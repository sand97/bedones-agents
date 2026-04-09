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

    return this.findById(catalogId)
  }

  // ─── Meta Product Fields ───

  private static readonly META_PRODUCT_FIELDS =
    'id,name,description,image_url,price,currency,category,product_type,url,availability,brand,condition,inventory,review_status'

  /**
   * Parse Meta price format like "FCFA10,000" or "1999 XAF" or "$25.99"
   */
  private parseMetaPrice(raw: string): { amount: number; currency: string } {
    const cleaned = raw.replace(/[,\s]/g, '')
    const match = cleaned.match(/^([A-Z$€£]+)?(\d+(?:\.\d+)?)([A-Z]+)?$/)
    if (!match) return { amount: 0, currency: 'XAF' }
    const amount = parseFloat(match[2])
    const currency = match[1]?.replace(/[$€£]/, '') || match[3] || 'XAF'
    return { amount, currency }
  }

  // ─── Products (Meta Graph API proxy) ───

  async findProducts(
    catalogId: string,
    params?: {
      search?: string
      status?: string
      after?: string
      limit?: number
    },
  ) {
    const [accessToken, providerId] = await Promise.all([
      this.resolveAccessToken(catalogId),
      this.getCatalogProviderId(catalogId),
    ])

    const limit = params?.limit || 20
    const query = new URLSearchParams({
      fields: CatalogService.META_PRODUCT_FIELDS,
      limit: String(limit),
      summary: 'true',
      access_token: accessToken,
    })
    if (params?.after) query.set('after', params.after)
    if (params?.status) query.set('filter', JSON.stringify({ review_status: params.status }))

    const url = `${this.META_API_BASE}/${providerId}/products?${query}`
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

    const products = (data.data || []).map((p) => {
      const priceInfo = p.price ? this.parseMetaPrice(String(p.price)) : null
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        imageUrl: p.image_url,
        price: priceInfo?.amount ?? null,
        currency: priceInfo?.currency ?? 'XAF',
        category: p.product_type || p.category,
        url: p.url,
        availability: p.availability,
        brand: p.brand,
        condition: p.condition,
        status: p.review_status || 'approved',
        inventory: p.inventory,
      }
    })

    // Client-side search filter (Meta doesn't support search on products endpoint)
    let filtered = products
    if (params?.search) {
      const q = params.search.toLowerCase()
      filtered = products.filter(
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
    const socialAccount = await this.prisma.socialAccount.findFirst({
      where: { provider: 'WHATSAPP', providerAccountId: phoneNumberId },
      omit: { accessToken: false },
    })

    if (!socialAccount) {
      throw new NotFoundException('Compte WhatsApp introuvable pour ce numéro')
    }

    const accessToken = await this.encryptionService.decrypt(socialAccount.accessToken)

    const response = await fetch(
      `${this.META_API_BASE}/${phoneNumberId}/whatsapp_commerce_settings?access_token=${accessToken}`,
    )

    if (!response.ok) {
      const error = await response.text()
      this.logger.error(`WhatsApp commerce settings API error: ${error}`)
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
      price?: string
      currency?: string
      category?: string
      url?: string
      availability?: string
      brand?: string
      condition?: string
    },
  ) {
    const [accessToken, providerId] = await Promise.all([
      this.resolveAccessToken(catalogId),
      this.getCatalogProviderId(catalogId),
    ])

    const retailerId = randomUUID()

    const productData: Record<string, string> = { name: data.name }
    if (data.description) productData.description = data.description
    if (data.imageUrl) productData.image_url = data.imageUrl
    if (data.price) productData.price = data.price
    if (data.currency) productData.currency = data.currency
    if (data.url) productData.url = data.url
    if (data.availability) productData.availability = data.availability
    if (data.brand) productData.brand = data.brand
    if (data.category) productData.product_type = data.category
    if (data.condition) productData.condition = data.condition

    const response = await fetch(`${this.META_API_BASE}/${providerId}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: accessToken,
        retailer_id: retailerId,
        data: productData,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      this.logger.error(`Meta create product error: ${error}`)
      throw new BadRequestException(`Meta API error: ${error}`)
    }

    return response.json()
  }

  async updateProduct(
    catalogId: string,
    productId: string,
    data: {
      name?: string
      description?: string
      imageUrl?: string
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

    const productData: Record<string, string> = {}
    if (data.name) productData.name = data.name
    if (data.description) productData.description = data.description
    if (data.imageUrl) productData.image_url = data.imageUrl
    if (data.price) productData.price = data.price
    if (data.currency) productData.currency = data.currency
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

    const response = await fetch(
      `${this.META_API_BASE}/${providerId}/product_sets?fields=id,name,product_count&access_token=${accessToken}`,
    )

    if (!response.ok) {
      const error = await response.text()
      this.logger.error(`Meta list collections error: ${error}`)
      throw new BadRequestException(`Meta API error: ${error}`)
    }

    return response.json()
  }

  async createCollection(catalogId: string, data: { name: string; productIds?: string[] }) {
    const [accessToken, providerId] = await Promise.all([
      this.resolveAccessToken(catalogId),
      this.getCatalogProviderId(catalogId),
    ])

    const response = await fetch(`${this.META_API_BASE}/${providerId}/product_sets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: accessToken,
        name: data.name,
      }),
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

  // ─── Catalog-Phone Association ───

  async associatePhone(catalogId: string, phoneNumberId: string) {
    const [accessToken, providerId] = await Promise.all([
      this.resolveAccessToken(catalogId),
      this.getCatalogProviderId(catalogId),
    ])

    const response = await fetch(
      `${this.META_API_BASE}/${providerId}/whatsapp_catalog_phone_numbers`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: accessToken,
          phone_number_id: phoneNumberId,
        }),
      },
    )

    if (!response.ok) {
      const error = await response.text()
      this.logger.error(`Meta associate phone error: ${error}`)
      throw new BadRequestException(`Meta API error: ${error}`)
    }

    return response.json()
  }

  async dissociatePhone(catalogId: string, phoneNumberId: string) {
    const [accessToken, providerId] = await Promise.all([
      this.resolveAccessToken(catalogId),
      this.getCatalogProviderId(catalogId),
    ])

    const response = await fetch(
      `${this.META_API_BASE}/${providerId}/whatsapp_catalog_phone_numbers`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: accessToken,
          phone_number_id: phoneNumberId,
        }),
      },
    )

    if (!response.ok) {
      const error = await response.text()
      this.logger.error(`Meta dissociate phone error: ${error}`)
      throw new BadRequestException(`Meta API error: ${error}`)
    }

    return response.json()
  }
}
