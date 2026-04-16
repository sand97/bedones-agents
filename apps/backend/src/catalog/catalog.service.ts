import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { EventsGateway } from '../gateway/events.gateway'
import { EncryptionService } from '../auth/encryption.service'
import { resolveGoogleCategory } from './google-product-categories'

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name)
  private readonly META_API_BASE = 'https://graph.facebook.com/v22.0'

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private gateway: EventsGateway,
    private encryptionService: EncryptionService,
  ) {}

  // ─── CRUD ───

  async findAllByOrg(userId: string, organisationId: string) {
    await this.assertMembership(userId, organisationId)
    return this.prisma.catalog.findMany({
      where: { organisationId },
      include: {
        socialAccounts: {
          include: { socialAccount: true },
        },
        _count: { select: { products: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findById(userId: string, id: string) {
    const catalog = await this.prisma.catalog.findUnique({
      where: { id },
      include: {
        socialAccounts: {
          include: { socialAccount: true },
        },
      },
    })
    if (!catalog) throw new NotFoundException('Catalogue introuvable')
    await this.assertMembership(userId, catalog.organisationId)
    return catalog
  }

  async create(
    userId: string,
    data: { organisationId: string; name: string; providerId?: string },
  ) {
    await this.assertMembership(userId, data.organisationId)
    return this.prisma.catalog.create({
      data: {
        organisationId: data.organisationId,
        name: data.name,
        providerId: data.providerId,
      },
    })
  }

  async update(userId: string, id: string, data: { name?: string }) {
    await this.assertCatalogAccess(userId, id)
    return this.prisma.catalog.update({
      where: { id },
      data,
    })
  }

  async remove(userId: string, id: string) {
    await this.assertCatalogAccess(userId, id)
    return this.prisma.catalog.delete({ where: { id } })
  }

  // ─── Social Account Links ───

  async linkSocialAccounts(userId: string, catalogId: string, socialAccountIds: string[]) {
    await this.assertCatalogAccess(userId, catalogId)
    // Remove existing links not in the new list
    await this.prisma.catalogSocialAccount.deleteMany({
      where: {
        catalogId,
        socialAccountId: { notIn: socialAccountIds },
      },
    })

    // Create new links
    for (const socialAccountId of socialAccountIds) {
      await this.prisma.catalogSocialAccount.upsert({
        where: {
          catalogId_socialAccountId: { catalogId, socialAccountId },
        },
        update: {},
        create: { catalogId, socialAccountId },
      })
    }

    return this.findById(userId, catalogId)
  }

  // ─── Meta Product Fields ───

  private static readonly META_PRODUCT_FIELDS =
    'id,retailer_id,name,description,image_url,additional_image_urls,price,currency,category,product_type,url,availability,brand,condition,inventory,review_status,product_sets{id,name}'

  /**
   * Parse Meta price format like "FCFA10,000" or "1999 XAF" or "$25.99"
   */
  private parseMetaPrice(raw: string): { amount: number; currency: string } {
    const cleaned = raw.replace(/[,\s]/g, '')
    const match = cleaned.match(/^([A-Z$€£]+)?(\d+(?:\.\d+)?)([A-Z]+)?$/)
    if (!match) return { amount: 0, currency: 'XAF' }
    const amount = parseFloat(match[2])
    let currency = match[1]?.replace(/[$€£]/, '') || match[3] || 'XAF'
    // Normalize non-ISO currency aliases
    if (currency === 'FCFA' || currency === 'CFA') currency = 'XAF'
    return { amount, currency }
  }

  /** Ensure currency is a valid ISO 4217 code for Meta */
  private normalizeIsoCurrency(currency?: string): string {
    if (!currency) return 'XAF'
    const upper = currency.toUpperCase()
    if (upper === 'FCFA' || upper === 'CFA') return 'XAF'
    return upper
  }

  // ─── Products (Meta Graph API proxy) ───

  private mapMetaProduct(p: Record<string, unknown>) {
    const priceInfo = p.price ? this.parseMetaPrice(String(p.price)) : null
    return {
      id: p.id,
      retailerId: p.retailer_id,
      name: p.name,
      description: p.description,
      imageUrl: p.image_url,
      additionalImageUrls: Array.isArray(p.additional_image_urls)
        ? (p.additional_image_urls as string[])
        : [],
      price: priceInfo?.amount ?? null,
      currency: priceInfo?.currency ?? 'XAF',
      category:
        (p.product_type as string) ||
        (p.category ? resolveGoogleCategory(String(p.category)) : undefined),
      url: p.url,
      availability: p.availability,
      brand: p.brand,
      condition: p.condition,
      status: (p.review_status as string) || 'approved',
      inventory: p.inventory,
      collectionId: (p.product_sets as { data?: Array<{ id: string; name: string }> })?.data?.[0]
        ?.id,
      collectionName: (p.product_sets as { data?: Array<{ id: string; name: string }> })?.data?.[0]
        ?.name,
    }
  }

  async findProducts(
    catalogId: string,
    params?: {
      search?: string
      status?: string
      after?: string
      limit?: number
      collectionId?: string
    },
  ) {
    const [accessToken, providerId] = await Promise.all([
      this.resolveAccessToken(catalogId),
      this.getCatalogProviderId(catalogId),
    ])

    // When filtering by collection, fetch from the product set endpoint
    const baseId = params?.collectionId || providerId
    const limit = params?.limit || 20
    const query = new URLSearchParams({
      fields: CatalogService.META_PRODUCT_FIELDS,
      limit: String(limit),
      summary: 'true',
      access_token: accessToken,
    })
    if (params?.after) query.set('after', params.after)

    const url = `${this.META_API_BASE}/${baseId}/products?${query}`
    const response = await fetch(url)

    if (!response.ok) {
      const error = await response.text()
      this.logger.error(`Meta list products error: ${error}`)
      throw new BadRequestException(`Meta API error: ${error}`)
    }

    const data = (await response.json()) as {
      data: Array<Record<string, unknown>>
      paging?: { cursors?: { after?: string; before?: string }; next?: string }
      summary?: { total_count?: number }
    }

    const products = (data.data || []).map((p) => this.mapMetaProduct(p))

    // Server-side filtering (Meta doesn't support filter/search on products endpoint)
    let filtered = products

    if (params?.status) {
      filtered = filtered.filter((p) => p.status === params.status)
    }

    if (params?.search) {
      const q = params.search.toLowerCase()
      filtered = filtered.filter(
        (p) =>
          (p.name as string)?.toLowerCase().includes(q) ||
          (p.description as string)?.toLowerCase().includes(q),
      )
    }

    return {
      products: filtered,
      total: data.summary?.total_count ?? filtered.length,
      cursors: data.paging?.cursors,
      hasMore: !!data.paging?.next,
    }
  }

  // ─── Webhook: external catalog changes ───

  async handleWebhookUpdate(providerId: string, _changes: Record<string, unknown>) {
    const catalog = await this.prisma.catalog.findFirst({
      where: { providerId },
      select: { id: true, organisationId: true },
    })

    if (!catalog) {
      this.logger.warn(`Webhook: no catalog found for providerId ${providerId}`)
      return
    }

    // Emit event to frontend so it can refetch
    this.gateway.emitToOrg(catalog.organisationId, 'catalog:updated', {
      catalogId: catalog.id,
    })
    this.logger.log(`Webhook: emitted catalog:updated for ${catalog.id}`)
  }

  // ─── Analysis status helpers ───

  async getAnalysisProgress(catalogId: string) {
    const catalog = await this.prisma.catalog.findUnique({
      where: { id: catalogId },
      select: {
        analysisStatus: true,
        description: true,
        productCount: true,
        indexedCount: true,
      },
    })
    if (!catalog) throw new NotFoundException('Catalogue introuvable')
    return catalog
  }

  // ─── Authorization helpers ───

  private async assertMembership(userId: string, organisationId: string) {
    const membership = await this.prisma.organisationMember.findUnique({
      where: { userId_organisationId: { userId, organisationId } },
    })
    if (!membership) {
      throw new ForbiddenException("Vous n'êtes pas membre de cette organisation")
    }
  }

  /**
   * Verify user is a member of the organisation that owns this catalog.
   * Returns the catalog for convenience.
   */
  async assertCatalogAccess(userId: string, catalogId: string) {
    const catalog = await this.prisma.catalog.findUnique({
      where: { id: catalogId },
      select: { organisationId: true },
    })
    if (!catalog) throw new NotFoundException('Catalogue introuvable')
    await this.assertMembership(userId, catalog.organisationId)
    return catalog
  }

  /**
   * Verify user is a member of the organisation that owns this WhatsApp account.
   */
  private async assertWhatsAppAccess(userId: string, phoneNumberId: string) {
    const socialAccount = await this.prisma.socialAccount.findFirst({
      where: { provider: 'WHATSAPP', providerAccountId: phoneNumberId },
      select: { organisationId: true },
    })
    if (!socialAccount) throw new NotFoundException('Compte WhatsApp introuvable')
    await this.assertMembership(userId, socialAccount.organisationId)
  }

  // ─── Resolve access token for a catalog ───

  private async resolveAccessToken(catalogId: string): Promise<string> {
    const catalog = await this.prisma.catalog.findUnique({
      where: { id: catalogId },
      include: {
        socialAccounts: {
          include: { socialAccount: { omit: { accessToken: false } } },
        },
      },
    })

    if (!catalog || !catalog.providerId) {
      throw new NotFoundException('Catalogue ou providerId introuvable')
    }

    const socialLink = catalog.socialAccounts[0]
    if (!socialLink) {
      throw new NotFoundException('Aucun compte social lié au catalogue')
    }

    return this.encryptionService.decrypt(socialLink.socialAccount.accessToken)
  }

  private async getCatalogProviderId(catalogId: string): Promise<string> {
    const catalog = await this.prisma.catalog.findUnique({
      where: { id: catalogId },
      select: { providerId: true },
    })
    if (!catalog?.providerId) {
      throw new NotFoundException('Catalogue ou providerId introuvable')
    }
    return catalog.providerId
  }

  // ─── WhatsApp Commerce Settings ───

  async getWhatsAppCommerceSettings(userId: string, phoneNumberId: string) {
    await this.assertWhatsAppAccess(userId, phoneNumberId)
    const { accessToken, wabaId } = await this.resolveWhatsAppAccount(phoneNumberId)

    const response = await fetch(
      `${this.META_API_BASE}/${wabaId}/product_catalogs?access_token=${accessToken}`,
    )

    if (!response.ok) {
      const error = await response.text()
      this.logger.error(`WABA product_catalogs API error: ${error}`)
      throw new BadRequestException(`Meta API error: ${error}`)
    }

    return response.json()
  }

  // ─── Product CRUD via Meta API ───

  async createProduct(
    catalogId: string,
    data: {
      name: string
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
      this.resolveAccessToken(catalogId),
      this.getCatalogProviderId(catalogId),
    ])

    const retailerId = randomUUID()

    const body: Record<string, unknown> = {
      access_token: accessToken,
      retailer_id: retailerId,
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
    if (data.category) body.product_type = data.category
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

    return result
  }

  async updateProduct(
    catalogId: string,
    productId: string,
    data: {
      name?: string
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
    const accessToken = await this.resolveAccessToken(catalogId)

    const productData: Record<string, unknown> = {}
    if (data.name) productData.name = data.name
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
    if (data.category) productData.product_type = data.category
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
    const accessToken = await this.resolveAccessToken(catalogId)

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

  // ─── Collections (Product Sets) ───

  async findCollections(catalogId: string) {
    const [accessToken, providerId] = await Promise.all([
      this.resolveAccessToken(catalogId),
      this.getCatalogProviderId(catalogId),
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
      this.resolveAccessToken(catalogId),
      this.getCatalogProviderId(catalogId),
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

    const result = (await response.json()) as { id: string }

    // If productIds provided, add products to the collection
    if (data.productIds?.length) {
      const addResponse = await fetch(`${this.META_API_BASE}/${result.id}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: accessToken,
          product_ids: data.productIds,
        }),
      })

      if (!addResponse.ok) {
        const error = await addResponse.text()
        this.logger.warn(`Meta add products to collection error: ${error}`)
      }
    }

    return result
  }

  async updateCollection(catalogId: string, collectionId: string, data: { name?: string }) {
    const accessToken = await this.resolveAccessToken(catalogId)

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
    const accessToken = await this.resolveAccessToken(catalogId)

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

  // ─── Catalog-Phone Association (via WABA) ───

  private async resolveWhatsAppAccount(phoneNumberId: string) {
    const account = await this.prisma.socialAccount.findFirst({
      where: { provider: 'WHATSAPP', providerAccountId: phoneNumberId },
      omit: { accessToken: false },
    })
    if (!account) throw new NotFoundException('Compte WhatsApp introuvable')
    if (!account.wabaId) throw new BadRequestException('WABA ID manquant pour ce numéro WhatsApp')
    const accessToken = await this.encryptionService.decrypt(account.accessToken)
    return { account, accessToken, wabaId: account.wabaId }
  }

  async associatePhone(catalogId: string, phoneNumberId: string) {
    const [providerId, catalogToken] = await Promise.all([
      this.getCatalogProviderId(catalogId),
      this.resolveAccessToken(catalogId),
    ])
    const { accessToken: whatsappToken, wabaId } = await this.resolveWhatsAppAccount(phoneNumberId)

    // 1. Link catalog to WABA (idempotent — ignore "already linked" errors)
    const wabaRes = await fetch(`${this.META_API_BASE}/${wabaId}/product_catalogs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${catalogToken}` },
      body: JSON.stringify({ catalog_id: providerId }),
    })
    const wabaBody = await wabaRes.text()
    if (!wabaRes.ok) {
      this.logger.warn(`Meta link catalog to WABA (may already be linked): ${wabaBody}`)
    } else {
      this.logger.log(`[Catalog] WABA link response: ${wabaBody}`)
    }

    // 2. Activate commerce settings on phone number
    const phoneRes = await fetch(
      `${this.META_API_BASE}/${phoneNumberId}/whatsapp_commerce_settings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${whatsappToken}` },
        body: JSON.stringify({
          catalog_id: providerId,
          is_catalog_visible: true,
          is_cart_enabled: true,
        }),
      },
    )
    if (!phoneRes.ok) {
      const error = await phoneRes.text()
      this.logger.warn(`Meta activate commerce settings (may already be set): ${error}`)
    }

    this.logger.log(
      `[Catalog] Associated catalog ${providerId} to phone ${phoneNumberId} via WABA ${wabaId}`,
    )
    return { success: true }
  }

  async dissociatePhone(catalogId: string, phoneNumberId: string) {
    const [providerId, catalogToken] = await Promise.all([
      this.getCatalogProviderId(catalogId),
      this.resolveAccessToken(catalogId),
    ])
    const { accessToken: whatsappToken, wabaId } = await this.resolveWhatsAppAccount(phoneNumberId)

    // 1. Deactivate commerce settings on phone number
    const phoneRes = await fetch(
      `${this.META_API_BASE}/${phoneNumberId}/whatsapp_commerce_settings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${whatsappToken}` },
        body: JSON.stringify({
          catalog_id: '',
          is_catalog_visible: false,
          is_cart_enabled: false,
        }),
      },
    )
    if (!phoneRes.ok) {
      const error = await phoneRes.text()
      this.logger.warn(`Meta deactivate commerce settings (may already be off): ${error}`)
    }

    // 2. Remove catalog from WABA
    const wabaRes = await fetch(`${this.META_API_BASE}/${wabaId}/product_catalogs`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${catalogToken}` },
      body: JSON.stringify({ catalog_id: providerId }),
    })
    if (!wabaRes.ok) {
      const error = await wabaRes.text()
      this.logger.warn(`Meta remove catalog from WABA (may already be removed): ${error}`)
    }

    this.logger.log(
      `[Catalog] Dissociated catalog ${providerId} from phone ${phoneNumberId} via WABA ${wabaId}`,
    )
    return { success: true }
  }
}
