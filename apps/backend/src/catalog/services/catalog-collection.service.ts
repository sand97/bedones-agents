import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { CatalogAccessService } from './catalog-access.service'

@Injectable()
export class CatalogCollectionService {
  private readonly logger = new Logger('CatalogService')
  private readonly META_API_BASE = 'https://graph.facebook.com/v22.0'

  constructor(private accessService: CatalogAccessService) {}

  // ─── Collections (Product Sets) ───

  async findCollections(catalogId: string) {
    const [accessToken, providerId] = await Promise.all([
      this.accessService.resolveAccessToken(catalogId),
      this.accessService.getCatalogProviderId(catalogId),
    ])

    const allCollections: Array<{ id: string; name: string; product_count?: number }> = []
    let url: string | null =
      `${this.META_API_BASE}/${providerId}/product_sets?fields=id,name,product_count&limit=100&access_token=${accessToken}`

    while (url) {
      const response = await fetch(url)

      if (!response.ok) {
        const error = await response.text()
        this.logger.error(`Meta list collections error: ${error}`)
        throw new BadRequestException(`Meta API error: ${error}`)
      }

      const data = (await response.json()) as {
        data: Array<{ id: string; name: string; product_count?: number }>
        paging?: { next?: string }
      }

      allCollections.push(...(data.data || []))
      url = data.paging?.next || null
    }

    return allCollections
  }

  async createCollection(catalogId: string, data: { name: string; productIds?: string[] }) {
    const [accessToken, providerId] = await Promise.all([
      this.accessService.resolveAccessToken(catalogId),
      this.accessService.getCatalogProviderId(catalogId),
    ])

    const body: Record<string, unknown> = {
      access_token: accessToken,
      name: data.name,
    }

    // Meta requires a filter to distinguish product sets from the default "All products" set.
    // Without a filter it throws "duplicate product set" error.
    // With a filter matching 0 products it throws "cannot create empty set" error.
    // Solution: use a broad filter that matches all products (contains empty string).
    if (data.productIds?.length) {
      body.filter = JSON.stringify({
        retailer_id: { is_any: data.productIds },
      })
    } else {
      body.filter = JSON.stringify({
        product_type: { contains: '' },
      })
    }

    const response = await fetch(`${this.META_API_BASE}/${providerId}/product_sets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.text()
      this.logger.error(`Meta create collection error: ${error}`)
      throw new BadRequestException(`Meta API error: ${error}`)
    }

    // Product-set membership is defined entirely by the filter above — Meta has
    // no "add product to set by id" operation — so there's nothing else to do.
    return (await response.json()) as { id: string }
  }

  async updateCollection(catalogId: string, collectionId: string, data: { name?: string }) {
    const accessToken = await this.accessService.resolveAccessToken(catalogId)

    const response = await fetch(`${this.META_API_BASE}/${collectionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: accessToken,
        name: data.name,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      this.logger.error(`Meta update collection error: ${error}`)
      throw new BadRequestException(`Meta API error: ${error}`)
    }

    return response.json()
  }

  async deleteCollection(catalogId: string, collectionId: string) {
    const accessToken = await this.accessService.resolveAccessToken(catalogId)

    const response = await fetch(
      `${this.META_API_BASE}/${collectionId}?access_token=${accessToken}`,
      { method: 'DELETE' },
    )

    if (!response.ok) {
      const error = await response.text()
      this.logger.error(`Meta delete collection error: ${error}`)
      throw new BadRequestException(`Meta API error: ${error}`)
    }

    return response.json()
  }
}
