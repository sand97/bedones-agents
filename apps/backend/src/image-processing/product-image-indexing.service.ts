import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from '../auth/encryption.service'
import { EventsGateway } from '../gateway/events.gateway'

import { GeminiEmbeddingService } from './gemini-embedding.service'
import { GeminiVisionService } from './gemini-vision.service'
import { QdrantService, type IndexedProductInfo } from './qdrant.service'

const META_API_BASE = 'https://graph.facebook.com/v22.0'
const META_PRODUCT_FIELDS =
  'id,retailer_id,name,description,image_url,price,currency,category,product_type,availability'
const IMAGE_DOWNLOAD_TIMEOUT_MS = 30000

export interface IndexingResult {
  success: boolean
  total: number
  processed: number
  skipped: number
  failed: number
  message: string
}

interface MetaProduct {
  id: string
  retailer_id?: string
  name?: string
  description?: string
  image_url?: string
  price?: string
  currency?: string
  category?: string
  product_type?: string
  availability?: string
}

@Injectable()
export class ProductImageIndexingService {
  private readonly logger = new Logger(ProductImageIndexingService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
    private readonly gateway: EventsGateway,
    private readonly geminiVisionService: GeminiVisionService,
    private readonly geminiEmbeddingService: GeminiEmbeddingService,
    private readonly qdrantService: QdrantService,
  ) {}

  /**
   * Smart sync: only indexes what's new or changed.
   *
   * 1. Ensure Qdrant collection exists
   * 2. Fetch all products from Meta API
   * 3. Compare with what's already indexed in Qdrant (by imageId)
   * 4. Index only new/changed products, skip the rest
   * 5. Remove orphan points (deleted products)
   *
   * Progress: 0-20% setup, 20-100% products
   */
  async syncCatalog(
    catalogId: string,
    organisationId: string,
    onProgress?: (percentage: number) => void,
  ): Promise<IndexingResult> {
    this.logger.log(`Starting catalog sync for catalog ${catalogId}`)

    await this.prisma.catalog.update({
      where: { id: catalogId },
      data: { analysisStatus: 'INDEXING' },
    })

    this.gateway.emitToOrg(organisationId, 'catalog:indexing-started', { catalogId })

    try {
      // ── Phase 1: Setup (0% → 5%) ──
      await this.qdrantService.ensureCollection(catalogId)
      this.emitProgress(organisationId, catalogId, 5, onProgress)

      // ── Phase 2: Fetch products from Meta (5% → 10%) ──
      const products = await this.fetchAllProducts(catalogId)
      this.logger.log(`Fetched ${products.length} products from Meta for catalog ${catalogId}`)

      // Update productCount in DB
      await this.prisma.catalog.update({
        where: { id: catalogId },
        data: { productCount: products.length },
      })
      this.emitProgress(organisationId, catalogId, 10, onProgress)

      if (products.length === 0) {
        await this.finalizeCatalog(catalogId, 'COMPLETED', 0, products.length)
        this.emitCompleted(organisationId, catalogId, 0)
        return {
          success: true,
          total: 0,
          processed: 0,
          skipped: 0,
          failed: 0,
          message: 'No products',
        }
      }

      // ── Phase 3: Diff with Qdrant (10% → 20%) ──
      const indexedMap = await this.qdrantService.getIndexedProducts(catalogId)
      this.logger.log(`Found ${indexedMap.size} products already indexed in Qdrant`)

      // Determine what to index, skip, and delete
      const { toIndex, toSkip, toDelete } = this.diffProducts(products, indexedMap)
      this.logger.log(
        `Sync plan: ${toIndex.length} to index, ${toSkip.length} to skip, ${toDelete.length} to delete`,
      )

      // Remove orphan products from Qdrant
      if (toDelete.length > 0) {
        await this.qdrantService.removeProducts(catalogId, toDelete)
        this.logger.log(`Removed ${toDelete.length} orphan products from Qdrant`)
      }
      this.emitProgress(organisationId, catalogId, 20, onProgress)

      // If nothing to index, we're done
      if (toIndex.length === 0) {
        const indexedCount = toSkip.length
        await this.finalizeCatalog(catalogId, 'COMPLETED', indexedCount, products.length)
        this.emitCompleted(organisationId, catalogId, indexedCount)
        return {
          success: true,
          total: products.length,
          processed: 0,
          skipped: toSkip.length,
          failed: 0,
          message: 'All products already indexed',
        }
      }

      // ── Phase 4: Index new/changed products (20% → 100%) ──
      let processed = 0
      let failed = 0
      const alreadyIndexed = toSkip.length

      for (let i = 0; i < toIndex.length; i++) {
        const product = toIndex[i]

        try {
          await this.indexSingleProduct(catalogId, product)
          processed += 1
        } catch (error: unknown) {
          failed += 1
          const err = error as Record<string, unknown>
          const errMsg = error instanceof Error ? error.message : String(error)
          const errorDetail = err?.response
            ? `${errMsg} — Response: ${JSON.stringify(err.response).slice(0, 300)}`
            : error instanceof Error && error.cause
              ? `${errMsg} — Cause: ${error.cause instanceof Error ? error.cause.message : error.cause}`
              : errMsg
          this.logger.warn(
            `Failed to index product ${product.id} (${product.name}): ${errorDetail}`,
          )
          if (failed <= 3) {
            this.logger.debug(
              `Full error for product ${product.id}:`,
              error instanceof Error ? error.stack : error,
            )
          }
        }

        const percentage = Math.round(20 + ((i + 1) / toIndex.length) * 80)
        onProgress?.(percentage)

        const currentIndexed = alreadyIndexed + processed
        await this.prisma.catalog.update({
          where: { id: catalogId },
          data: { indexedCount: currentIndexed },
        })

        this.gateway.emitToOrg(organisationId, 'catalog:indexing-progress', {
          catalogId,
          processed: currentIndexed,
          total: products.length,
          percentage,
        })
      }

      const totalIndexed = alreadyIndexed + processed
      const finalStatus = failed > 0 && processed === 0 ? 'FAILED' : 'COMPLETED'
      await this.finalizeCatalog(catalogId, finalStatus, totalIndexed, products.length)
      this.emitCompleted(organisationId, catalogId, totalIndexed)

      const message =
        `Sync done: ${processed} indexed, ${toSkip.length} skipped, ${failed} failed, ` +
        `${toDelete.length} deleted — ${products.length} total`
      this.logger.log(message)

      return {
        success: failed === 0 || processed > 0,
        total: products.length,
        processed,
        skipped: toSkip.length,
        failed,
        message,
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error(`Catalog sync failed for ${catalogId}: ${message}`)
      await this.prisma.catalog.update({
        where: { id: catalogId },
        data: { analysisStatus: 'FAILED' },
      })

      this.gateway.emitToOrg(organisationId, 'catalog:indexing-failed', {
        catalogId,
        error: message,
      })

      return {
        success: false,
        total: 0,
        processed: 0,
        skipped: 0,
        failed: 0,
        message: `Sync failed: ${message}`,
      }
    }
  }

  // ─── Diff logic ───

  private diffProducts(
    metaProducts: MetaProduct[],
    indexedMap: Map<string, IndexedProductInfo>,
  ): { toIndex: MetaProduct[]; toSkip: MetaProduct[]; toDelete: string[] } {
    const toIndex: MetaProduct[] = []
    const toSkip: MetaProduct[] = []
    const metaProductIds = new Set<string>()

    for (const product of metaProducts) {
      metaProductIds.add(product.id)
      const existing = indexedMap.get(product.id)

      if (!existing) {
        // New product — needs indexing
        toIndex.push(product)
        continue
      }

      // Product exists in Qdrant — check if image changed
      const currentImageId = product.image_url
        ? QdrantService.imageIdFromUrl(product.image_url)
        : null

      if (currentImageId && existing.imageId && currentImageId === existing.imageId) {
        // Same image — skip
        toSkip.push(product)
      } else {
        // Image changed or was missing — re-index
        toIndex.push(product)
      }
    }

    // Products in Qdrant but no longer in Meta — orphans to delete
    const toDelete: string[] = []
    for (const [productId] of indexedMap) {
      if (!metaProductIds.has(productId)) {
        toDelete.push(productId)
      }
    }

    return { toIndex, toSkip, toDelete }
  }

  // ─── Single product indexing ───

  private async indexSingleProduct(catalogId: string, product: MetaProduct): Promise<void> {
    const imageUrl = product.image_url
    const imageId = imageUrl ? QdrantService.imageIdFromUrl(imageUrl) : null

    const vectors: { image?: number[]; text?: number[] } = {}
    let coverDescription = ''

    if (!this.geminiEmbeddingService.isAvailable()) {
      this.logger.warn(`Gemini embedding not available, skipping product ${product.id}`)
      return
    }

    // Generate image embedding via Gemini multimodal embedding
    if (imageUrl) {
      try {
        const imageBuffer = await this.downloadImage(imageUrl)
        vectors.image = await this.geminiEmbeddingService.embedImage(imageBuffer)

        // Generate Gemini cover description for text embedding
        try {
          coverDescription = await this.geminiVisionService.describeProductImage(imageBuffer)
          const textToEmbed = [product.name || '', product.description || '', coverDescription]
            .filter(Boolean)
            .join(' | ')

          if (textToEmbed.trim()) {
            vectors.text = await this.geminiEmbeddingService.embedText(textToEmbed)
          }
        } catch (error: unknown) {
          this.logger.warn(
            `Gemini vision failed for product ${product.id}: ${error instanceof Error ? error.message : error}`,
          )
        }
      } catch (error: unknown) {
        this.logger.warn(
          `Image processing failed for product ${product.id}: ${error instanceof Error ? error.message : error}`,
        )
      }
    }

    // If no image or image failed, still try text embedding from name + description
    if (!vectors.text) {
      const textToEmbed = [product.name || '', product.description || '']
        .filter(Boolean)
        .join(' | ')
      if (textToEmbed.trim()) {
        try {
          vectors.text = await this.geminiEmbeddingService.embedText(textToEmbed)
        } catch (error: unknown) {
          this.logger.warn(
            `Text embedding failed for product ${product.id}: ${error instanceof Error ? error.message : error}`,
          )
        }
      }
    }

    const price = this.parsePrice(product.price)
    const payload: Record<string, unknown> = {
      product_id: product.id,
      product_name: product.name || '',
      description: product.description || null,
      retailer_id: product.retailer_id || null,
      category: product.category || product.product_type || null,
      price,
      image_url: imageUrl || null,
      image_id: imageId,
      cover_image_description: coverDescription || null,
    }

    await this.qdrantService.upsertProduct(catalogId, product.id, vectors, payload)
    this.logger.debug(`Indexed product ${product.id} (${product.name})`)
  }

  // ─── Meta API ───

  async fetchAllProducts(catalogId: string): Promise<MetaProduct[]> {
    const catalog = await this.prisma.catalog.findUnique({
      where: { id: catalogId },
      include: {
        socialAccounts: {
          include: { socialAccount: { omit: { accessToken: false } } },
        },
      },
    })

    if (!catalog?.providerId) {
      throw new Error(`Catalog ${catalogId} not found or missing providerId`)
    }

    const socialLink = catalog.socialAccounts[0]
    if (!socialLink) {
      throw new Error(`No social account linked to catalog ${catalogId}`)
    }

    const accessToken = await this.encryptionService.decrypt(socialLink.socialAccount.accessToken)

    const allProducts: MetaProduct[] = []
    let url: string | null =
      `${META_API_BASE}/${catalog.providerId}/products?fields=${META_PRODUCT_FIELDS}&limit=50&access_token=${accessToken}`

    while (url) {
      const response = await fetch(url)
      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Meta API error: ${error}`)
      }

      const data = (await response.json()) as {
        data: MetaProduct[]
        paging?: { next?: string }
      }

      allProducts.push(...(data.data || []))
      url = data.paging?.next || null
    }

    return allProducts
  }

  /** Fetch just the product count without downloading all product data */
  async fetchProductCount(catalogId: string): Promise<number> {
    const catalog = await this.prisma.catalog.findUnique({
      where: { id: catalogId },
      include: {
        socialAccounts: {
          include: { socialAccount: { omit: { accessToken: false } } },
        },
      },
    })

    if (!catalog?.providerId) return 0

    const socialLink = catalog.socialAccounts[0]
    if (!socialLink) return 0

    const accessToken = await this.encryptionService.decrypt(socialLink.socialAccount.accessToken)
    const url = `${META_API_BASE}/${catalog.providerId}/products?summary=true&limit=0&access_token=${accessToken}`

    try {
      const response = await fetch(url)
      if (!response.ok) return 0

      const data = (await response.json()) as {
        summary?: { total_count?: number }
        data?: unknown[]
      }

      return data.summary?.total_count ?? data.data?.length ?? 0
    } catch {
      return 0
    }
  }

  // ─── Helpers ───

  private async downloadImage(url: string): Promise<Buffer> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), IMAGE_DOWNLOAD_TIMEOUT_MS)

    try {
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) {
        throw new Error(`Image download failed: ${response.status}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      return Buffer.from(arrayBuffer)
    } finally {
      clearTimeout(timeout)
    }
  }

  private async finalizeCatalog(
    catalogId: string,
    status: 'COMPLETED' | 'FAILED',
    indexedCount: number,
    productCount: number,
  ) {
    await this.prisma.catalog.update({
      where: { id: catalogId },
      data: { analysisStatus: status, indexedCount, productCount },
    })
  }

  private emitProgress(
    organisationId: string,
    catalogId: string,
    percentage: number,
    onProgress?: (p: number) => void,
  ) {
    onProgress?.(percentage)
    this.gateway.emitToOrg(organisationId, 'catalog:indexing-progress', {
      catalogId,
      percentage,
    })
  }

  private emitCompleted(organisationId: string, catalogId: string, indexedCount: number) {
    this.gateway.emitToOrg(organisationId, 'catalog:indexing-completed', {
      catalogId,
      indexedCount,
    })
  }

  private parsePrice(priceStr?: string): number | null {
    if (!priceStr) return null
    const cleaned = priceStr.replace(/[^0-9.]/g, '')
    const parsed = parseFloat(cleaned)
    return Number.isFinite(parsed) ? parsed / 100 : null
  }
}
