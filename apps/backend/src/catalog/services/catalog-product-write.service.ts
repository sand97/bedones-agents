import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { CATALOG_INDEXING_QUEUE } from '../../queue/queue.module'
import {
  INDEX_PRODUCT_JOB,
  type SingleProductIndexingJobData,
} from '../../image-processing/catalog-indexing.processor'
import { CatalogAccessService } from './catalog-access.service'

@Injectable()
export class CatalogProductWriteService {
  private readonly logger = new Logger('CatalogService')
  private readonly META_API_BASE = 'https://graph.facebook.com/v22.0'

  constructor(
    private accessService: CatalogAccessService,
    @InjectQueue(CATALOG_INDEXING_QUEUE) private readonly catalogIndexingQueue: Queue,
  ) {}

  /** Ensure currency is a valid ISO 4217 code for Meta */
  private normalizeIsoCurrency(currency?: string): string {
    if (!currency) return 'XAF'
    const upper = currency.toUpperCase()
    if (upper === 'FCFA' || upper === 'CFA') return 'XAF'
    return upper
  }

  // ─── Product CRUD via Meta API ───

  async createProduct(
    catalogId: string,
    data: {
      name: string
      retailerId: string
      description?: string
      imageUrl?: string
      additionalImageUrls?: string[]
      price?: string
      currency?: string
      category?: string
      url?: string
      availability?: string
      brand?: string
      condition?: string
      collectionId?: string
    },
  ) {
    const [accessToken, providerId] = await Promise.all([
      this.accessService.resolveAccessToken(catalogId),
      this.accessService.getCatalogProviderId(catalogId),
    ])

    // retailer_id is the merchant's own product code (SKU) — it must be
    // provided (manually in the modal or carried over from the scraped
    // catalogue), never auto-generated.
    if (!data.retailerId?.trim()) {
      throw new BadRequestException('Le code produit (retailer_id) est requis')
    }

    const body: Record<string, unknown> = {
      access_token: accessToken,
      retailer_id: data.retailerId.trim(),
      name: data.name,
    }
    if (data.description) body.description = data.description
    if (data.imageUrl) body.image_url = data.imageUrl
    if (data.additionalImageUrls && data.additionalImageUrls.length > 0) {
      body.additional_image_urls = data.additionalImageUrls
    }
    if (data.price) {
      const iso = this.normalizeIsoCurrency(data.currency)
      body.price = Math.round(parseFloat(data.price) * 100)
      body.currency = iso
    } else if (data.currency) {
      body.currency = this.normalizeIsoCurrency(data.currency)
    }
    if (data.url) body.url = data.url
    if (data.availability) body.availability = data.availability
    if (data.brand) body.brand = data.brand
    if (data.category) {
      // `category` is the Google Product Category numeric ID (e.g. "5344").
      // Meta accepts it as `google_product_category` and auto-fills product_type
      // with the resolved label.
      body.google_product_category = data.category
    }
    if (data.condition) body.condition = data.condition

    const response = await fetch(`${this.META_API_BASE}/${providerId}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.text()
      this.logger.error(`Meta create product error: ${error}`)
      throw new BadRequestException(`Meta API error: ${error}`)
    }

    const result = (await response.json()) as { id: string }

    // Add product to collection if specified
    if (data.collectionId && result.id) {
      const addRes = await fetch(`${this.META_API_BASE}/${data.collectionId}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: accessToken,
          product_ids: [result.id],
        }),
      })
      if (!addRes.ok) {
        this.logger.warn(
          `Failed to add product ${result.id} to collection ${data.collectionId}: ${await addRes.text()}`,
        )
      }
    }

    // Best-effort: index the freshly created product into Qdrant so the agent
    // can find it immediately. Never fail product creation if indexing hiccups.
    if (result.id) {
      try {
        await this.catalogIndexingQueue.add(
          INDEX_PRODUCT_JOB,
          {
            catalogId,
            product: {
              id: result.id,
              retailer_id: data.retailerId.trim(),
              name: data.name,
              description: data.description,
              image_url: data.imageUrl,
              price: data.price,
              currency: data.currency,
              category: data.category,
            },
          } satisfies SingleProductIndexingJobData,
          { jobId: `index-product-${catalogId}-${result.id}` },
        )
      } catch (error) {
        this.logger.warn(
          `Failed to enqueue indexing for product ${result.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }

    return result
  }

  async updateProduct(
    catalogId: string,
    productId: string,
    data: {
      name?: string
      retailerId?: string
      description?: string
      imageUrl?: string
      additionalImageUrls?: string[]
      price?: string
      currency?: string
      category?: string
      url?: string
      availability?: string
      brand?: string
      condition?: string
    },
  ) {
    const accessToken = await this.accessService.resolveAccessToken(catalogId)

    const productData: Record<string, unknown> = {}
    if (data.name) productData.name = data.name
    if (data.retailerId) productData.retailer_id = data.retailerId
    if (data.description) productData.description = data.description
    if (data.imageUrl) productData.image_url = data.imageUrl
    if (data.additionalImageUrls) {
      productData.additional_image_urls = data.additionalImageUrls
    }
    if (data.price) {
      const iso = this.normalizeIsoCurrency(data.currency)
      productData.price = Math.round(parseFloat(data.price) * 100)
      productData.currency = iso
    } else if (data.currency) {
      productData.currency = this.normalizeIsoCurrency(data.currency)
    }
    if (data.url) productData.url = data.url
    if (data.availability) productData.availability = data.availability
    if (data.brand) productData.brand = data.brand
    if (data.category) {
      productData.google_product_category = data.category
    }
    if (data.condition) productData.condition = data.condition

    const response = await fetch(`${this.META_API_BASE}/${productId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: accessToken,
        ...productData,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      this.logger.error(`Meta update product error: ${error}`)
      throw new BadRequestException(`Meta API error: ${error}`)
    }

    return response.json()
  }

  async deleteProduct(catalogId: string, productId: string) {
    const accessToken = await this.accessService.resolveAccessToken(catalogId)

    const response = await fetch(`${this.META_API_BASE}/${productId}?access_token=${accessToken}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      const error = await response.text()
      this.logger.error(`Meta delete product error: ${error}`)
      throw new BadRequestException(`Meta API error: ${error}`)
    }

    return response.json()
  }
}
