import { createHash } from 'crypto'

import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { QdrantClient } from '@qdrant/js-client-rest'

export type SearchHit = {
  productId: string
  score: number
  metadata: Record<string, unknown>
}

/** What Qdrant already knows about a product */
export interface IndexedProductInfo {
  productId: string
  imageId: string | null
}

@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly logger = new Logger(QdrantService.name)
  private client: QdrantClient | null = null
  private readonly vectorSize: number

  constructor(private readonly configService: ConfigService) {
    this.vectorSize = Number.parseInt(
      this.configService.get<string>('GEMINI_EMBEDDING_DIMENSIONS', '768'),
      10,
    )
  }

  async onModuleInit() {
    if (!this.isConfigured()) {
      this.logger.warn('QDRANT_URL is not configured. Qdrant features are disabled.')
      return
    }

    const url = this.configService.get<string>('QDRANT_URL')!
    const apiKey = this.configService.get<string>('QDRANT_API_KEY')

    const clientOptions: { url: string; apiKey?: string } = { url }
    if (apiKey) {
      clientOptions.apiKey = apiKey
    }

    this.client = new QdrantClient(clientOptions)
    this.logger.log(`Qdrant client initialized (url=${url})`)
  }

  isConfigured(): boolean {
    return !!this.configService.get<string>('QDRANT_URL')
  }

  // ─── Collection naming: 1 collection per catalog ───

  private collectionName(catalogId: string): string {
    return `catalog-${catalogId}`
  }

  // ─── Collection lifecycle ───

  async ensureCollection(catalogId: string): Promise<void> {
    this.assertClient()
    const name = this.collectionName(catalogId)

    try {
      await this.client!.getCollection(name)
      // Collection already exists
    } catch (error) {
      if (!this.isCollectionNotFoundError(error)) throw error

      // Create collection with named vectors (same dimensionality from Gemini embedding model)
      await this.client!.createCollection(name, {
        vectors: {
          image: { size: this.vectorSize, distance: 'Cosine' },
          text: { size: this.vectorSize, distance: 'Cosine' },
        },
      })
      this.logger.log(
        `Created Qdrant collection "${name}" (image: ${this.vectorSize}d, text: ${this.vectorSize}d)`,
      )
    }
  }

  async deleteCollection(catalogId: string): Promise<void> {
    this.assertClient()
    const name = this.collectionName(catalogId)
    try {
      await this.client!.deleteCollection(name)
      this.logger.log(`Deleted Qdrant collection "${name}"`)
    } catch (error) {
      if (!this.isCollectionNotFoundError(error)) throw error
    }
  }

  // ─── Sync helpers ───

  /**
   * Returns a map of productId → imageId for all products already in Qdrant.
   * Used by the sync logic to know what to skip / re-index.
   */
  async getIndexedProducts(catalogId: string): Promise<Map<string, IndexedProductInfo>> {
    if (!this.isConfigured() || !this.client) return new Map()

    const name = this.collectionName(catalogId)
    const indexed = new Map<string, IndexedProductInfo>()
    let offset: string | number | undefined

    try {
      do {
        const page = await this.client!.scroll(name, {
          limit: 256,
          offset,
          with_payload: ['product_id', 'image_id'],
          with_vector: false,
        })

        for (const point of page.points || []) {
          const payload = point.payload as Record<string, unknown> | undefined
          const productId = payload?.product_id
          if (typeof productId === 'string' && productId.length > 0) {
            indexed.set(productId, {
              productId,
              imageId: typeof payload?.image_id === 'string' ? payload.image_id : null,
            })
          }
        }

        offset = page.next_page_offset as string | number | undefined
      } while (offset !== undefined && offset !== null)
    } catch (error) {
      if (this.isCollectionNotFoundError(error)) return new Map()
      throw error
    }

    return indexed
  }

  // ─── Indexing (upsert a full product point) ───

  async upsertProduct(
    catalogId: string,
    productId: string,
    vectors: { image?: number[]; text?: number[] },
    payload: Record<string, unknown>,
  ): Promise<void> {
    this.assertClient()
    const name = this.collectionName(catalogId)
    const pointId = this.toPointId(productId)

    const namedVectors: Record<string, number[]> = {}
    if (vectors.image) namedVectors.image = vectors.image
    if (vectors.text) namedVectors.text = vectors.text

    if (Object.keys(namedVectors).length === 0) return

    await this.client!.upsert(name, {
      wait: true,
      points: [
        {
          id: pointId,
          vector: namedVectors,
          payload: { ...payload, indexed_at: new Date().toISOString() },
        },
      ],
    })
  }

  // ─── Search ───

  async searchSimilarImages(
    catalogId: string,
    embedding: number[],
    limit = 5,
    scoreThreshold = 0.7,
  ): Promise<SearchHit[]> {
    return this.searchByNamedVector(catalogId, 'image', embedding, limit, scoreThreshold)
  }

  async searchSimilarText(
    catalogId: string,
    embedding: number[],
    limit = 5,
    scoreThreshold = 0.7,
  ): Promise<SearchHit[]> {
    return this.searchByNamedVector(catalogId, 'text', embedding, limit, scoreThreshold)
  }

  // ─── Deletion ───

  async removeProducts(catalogId: string, productIds: string[]): Promise<void> {
    if (productIds.length === 0) return
    this.assertClient()
    const name = this.collectionName(catalogId)

    await this.client!.delete(name, {
      wait: true,
      points: productIds.map((id) => this.toPointId(id)),
    })
  }

  // ─── Helpers ───

  /** Derive a stable image fingerprint from the URL for change detection */
  static imageIdFromUrl(imageUrl: string): string {
    return createHash('md5').update(imageUrl).digest('hex').slice(0, 16)
  }

  // ─── Private ───

  private assertClient() {
    if (!this.client) {
      throw new Error('Qdrant client is not initialized')
    }
  }

  private async searchByNamedVector(
    catalogId: string,
    vectorName: string,
    embedding: number[],
    limit: number,
    scoreThreshold: number,
  ): Promise<SearchHit[]> {
    this.assertClient()
    const name = this.collectionName(catalogId)

    try {
      const result = await this.client!.search(name, {
        vector: { name: vectorName, vector: embedding },
        limit,
        with_payload: true,
        score_threshold: scoreThreshold,
      })

      return result.map((hit) => {
        const payload = (hit.payload || {}) as Record<string, unknown>
        return {
          productId: typeof payload.product_id === 'string' ? payload.product_id : String(hit.id),
          score: hit.score,
          metadata: payload,
        }
      })
    } catch (error) {
      if (this.isCollectionNotFoundError(error)) return []
      throw error
    }
  }

  private toPointId(rawId: string): string {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawId)) {
      return rawId
    }
    const hash = createHash('sha1').update(rawId).digest('hex')
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`
  }

  private isCollectionNotFoundError(error: unknown): boolean {
    return /not found/i.test(String((error as { message?: unknown })?.message || error))
  }
}
