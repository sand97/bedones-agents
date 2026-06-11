import { Injectable } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from '../auth/encryption.service'

const META_API_BASE = 'https://graph.facebook.com/v22.0'
const META_PRODUCT_FIELDS =
  'id,retailer_id,name,description,image_url,price,currency,category,product_type,availability'

export interface MetaProduct {
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
export class MetaCatalogProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
  ) {}

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

    const socialLink =
      catalog.socialAccounts.find((l) => l.socialAccount.provider === 'FACEBOOK_CATALOG') ??
      catalog.socialAccounts[0]
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

    const socialLink =
      catalog.socialAccounts.find((l) => l.socialAccount.provider === 'FACEBOOK_CATALOG') ??
      catalog.socialAccounts[0]
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
}
