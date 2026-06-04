import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { EventsGateway } from '../gateway/events.gateway'
import { EncryptionService } from '../auth/encryption.service'
import { SocialHealthService } from '../social/social-health.service'
import { ErrorExplanationService, redactSecrets } from '../social/error-explanation.service'
import type { SocialFeature, SocialProvider } from 'generated/prisma/enums'
import { Prisma } from 'generated/prisma/client'

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name)
  private readonly META_API_BASE = 'https://graph.facebook.com/v22.0'

  /**
   * In-memory TTL cache for product lookups by retailer_id, keyed by
   * `${catalogProviderId}::${retailerId}`. Comment moderation resolves product codes
   * on (potentially) every incoming comment, so without a cache a popular post would
   * hammer the Meta Graph API. A `null` value is cached too (negative caching) so codes
   * that don't match a real product aren't re-queried on each comment.
   */
  private readonly productCache = new Map<
    string,
    {
      value: {
        retailerId: string
        name: string | null
        imageUrl: string | null
        price: number | null
        currency: string | null
      } | null
      expiresAt: number
    }
  >()
  private readonly PRODUCT_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
  private readonly PRODUCT_CACHE_MAX_ENTRIES = 5000

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private gateway: EventsGateway,
    private encryptionService: EncryptionService,
    private socialHealth: SocialHealthService,
    private errorExplanation: ErrorExplanationService,
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
    'id,retailer_id,name,description,image_url,additional_image_urls,price,currency,category,google_product_category,product_type,url,availability,brand,condition,inventory,review_status,product_sets{id,name}'

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
      // Prefer the numeric Google Product Category id (so the frontend can
      // localize) and fall back to the free-text product_type for legacy products.
      category:
        (p.google_product_category as string | undefined) ||
        (p.category as string | undefined) ||
        (p.product_type as string | undefined),
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

  /**
   * Fetch a subset of catalog products by their Meta product IDs. Missing
   * products are returned as `null` at the matching index so the caller can
   * align the response with the request order (handy for placeholder rendering
   * on the frontend).
   */
  async findProductsByIds(catalogId: string, productIds: string[]) {
    const ids = Array.from(new Set(productIds.filter(Boolean)))
    if (ids.length === 0)
      return { products: [] as Array<ReturnType<typeof this.mapMetaProduct> | null> }
    const accessToken = await this.resolveAccessToken(catalogId)

    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          const url = `${this.META_API_BASE}/${id}?fields=${CatalogService.META_PRODUCT_FIELDS}&access_token=${accessToken}`
          const res = await fetch(url)
          if (!res.ok) return null
          const data = (await res.json()) as Record<string, unknown>
          return this.mapMetaProduct(data)
        } catch {
          return null
        }
      }),
    )

    const map = new Map(results.filter((r) => r !== null).map((r) => [String(r!.id), r]))
    return { products: productIds.map((id) => map.get(id) ?? null) }
  }

  /**
   * Fetch a subset of catalog products by their retailer IDs, via Meta Graph API.
   * Resolves the access token from any social account linked to the catalog whose
   * providerId matches `catalogProviderId` (Meta catalog ID).
   *
   * Returns an array of `{ retailerId, name, imageUrl, price, currency }`. Missing
   * products are simply omitted — callers should fall back to the retailer ID.
   */
  async hydrateProductsByRetailerIds(
    catalogProviderId: string,
    retailerIds: string[],
  ): Promise<
    Array<{
      retailerId: string
      name: string | null
      imageUrl: string | null
      price: number | null
      currency: string | null
    }>
  > {
    const ids = Array.from(new Set(retailerIds.filter(Boolean)))
    if (ids.length === 0) return []

    const catalog = await this.prisma.catalog.findFirst({
      where: { providerId: catalogProviderId },
      include: {
        socialAccounts: {
          include: { socialAccount: { omit: { accessToken: false } } },
        },
      },
    })
    if (!catalog) {
      this.logger.warn(`hydrateProducts: no catalog found for providerId ${catalogProviderId}`)
      return []
    }
    const socialLink = catalog.socialAccounts[0]
    if (!socialLink) {
      this.logger.warn(`hydrateProducts: no linked social account for catalog ${catalog.id}`)
      return []
    }
    const accessToken = await this.encryptionService.decrypt(socialLink.socialAccount.accessToken)
    return this.hydrateProductsByRetailerIdsWithAccessToken(catalogProviderId, ids, accessToken)
  }

  async hydrateProductsByRetailerIdsWithAccessToken(
    catalogProviderId: string,
    retailerIds: string[],
    accessToken: string,
  ): Promise<
    Array<{
      retailerId: string
      name: string | null
      imageUrl: string | null
      price: number | null
      currency: string | null
    }>
  > {
    const ids = Array.from(new Set(retailerIds.filter(Boolean)))
    if (ids.length === 0) return []

    const now = Date.now()
    const hydrated: Array<{
      retailerId: string
      name: string | null
      imageUrl: string | null
      price: number | null
      currency: string | null
    }> = []
    const misses: string[] = []

    // Serve from cache where possible; collect the rest as misses.
    for (const id of ids) {
      const cached = this.productCache.get(this.productCacheKey(catalogProviderId, id))
      if (cached && cached.expiresAt > now) {
        if (cached.value) hydrated.push(cached.value)
      } else {
        misses.push(id)
      }
    }

    if (misses.length === 0) return hydrated

    // Meta Graph API supports filtering products by retailer_id via a JSON filter
    // on the catalog's /products edge. We request only the fields we need for UI.
    const filter = JSON.stringify({ retailer_id: { is_any: misses } })
    const query = new URLSearchParams({
      fields: 'id,retailer_id,name,image_url,price,currency',
      limit: String(Math.max(misses.length, 50)),
      filter,
      access_token: accessToken,
    })
    const url = `${this.META_API_BASE}/${catalogProviderId}/products?${query}`

    try {
      const response = await fetch(url)
      if (!response.ok) {
        const errorText = await response.text()
        this.logger.warn(`hydrateProducts: Meta API error ${response.status}: ${errorText}`)
        // Return whatever we already had cached; don't cache failures.
        return hydrated
      }
      const data = (await response.json()) as {
        data: Array<Record<string, unknown>>
      }
      const fetched = (data.data || []).map((p) => {
        const priceInfo = p.price ? this.parseMetaPrice(String(p.price)) : null
        return {
          retailerId: String(p.retailer_id ?? ''),
          name: (p.name as string) ?? null,
          imageUrl: (p.image_url as string) ?? null,
          price: priceInfo?.amount ?? null,
          currency: (p.currency as string) ?? priceInfo?.currency ?? null,
        }
      })

      const byId = new Map(fetched.map((p) => [p.retailerId, p]))
      // Cache each miss — including the ones Meta didn't return (negative cache).
      for (const id of misses) {
        const value = byId.get(id) ?? null
        this.setProductCache(catalogProviderId, id, value)
        if (value) hydrated.push(value)
      }

      return hydrated
    } catch (error: unknown) {
      this.logger.warn(
        `hydrateProducts: fetch failed: ${error instanceof Error ? error.message : error}`,
      )
      // Return whatever we already had cached; don't cache failures.
      return hydrated
    }
  }

  private productCacheKey(catalogProviderId: string, retailerId: string): string {
    return `${catalogProviderId}::${retailerId}`
  }

  private setProductCache(
    catalogProviderId: string,
    retailerId: string,
    value: {
      retailerId: string
      name: string | null
      imageUrl: string | null
      price: number | null
      currency: string | null
    } | null,
  ): void {
    // Cheap bound: when the cache grows too large, drop expired entries first and,
    // if still over budget, clear it entirely. Avoids unbounded memory growth.
    if (this.productCache.size >= this.PRODUCT_CACHE_MAX_ENTRIES) {
      const now = Date.now()
      for (const [k, v] of this.productCache) {
        if (v.expiresAt <= now) this.productCache.delete(k)
      }
      if (this.productCache.size >= this.PRODUCT_CACHE_MAX_ENTRIES) {
        this.productCache.clear()
      }
    }
    this.productCache.set(this.productCacheKey(catalogProviderId, retailerId), {
      value,
      expiresAt: Date.now() + this.PRODUCT_CACHE_TTL_MS,
    })
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
    const [accessToken, providerId, account] = await Promise.all([
      this.resolveAccessToken(catalogId),
      this.getCatalogProviderId(catalogId),
      this.resolveCatalogSocialAccount(catalogId),
    ])

    // Note: catalog listing is a user-triggered READ, so we never gate it on the
    // circuit breaker (and React Query retries would trip it almost instantly).
    // We still surface a friendly error + log it for visibility on failure.

    // When filtering by collection, fetch from the product set endpoint
    const baseId = params?.collectionId || providerId
    const limit = params?.limit || 20
    const query = new URLSearchParams({
      fields: CatalogService.META_PRODUCT_FIELDS,
      limit: String(limit),
      summary: 'true',
      access_token: accessToken,
    })

    // Run search server-side across the WHOLE catalogue via Meta's `filter` (the
    // /products edge supports it) so results, cursors and summary.total_count are
    // correct — not just the current page. For a collection we hit the
    // product-set edge and narrow in-memory below (sets are small).
    const search = params?.search?.trim()
    if (search && !params?.collectionId) {
      query.set(
        'filter',
        JSON.stringify({
          or: [{ name: { i_contains: search } }, { retailer_id: { i_contains: search } }],
        }),
      )
    }
    if (params?.after) query.set('after', params.after)

    const url = `${this.META_API_BASE}/${baseId}/products?${query}`
    const response = await fetch(url)

    if (!response.ok) {
      const errorText = await response.text()
      this.logger.error(`Meta list products error: ${errorText}`)

      // Log the failure (for visibility + the error bank) WITHOUT tripping the
      // circuit breaker, then resolve a human-friendly, multilingual explanation
      // so the frontend can show a "social empty" state with a reconnect prompt.
      let messages: Record<string, string> | null = null
      if (account) {
        await this.socialHealth.logError({
          socialAccountId: account.id,
          provider: account.provider,
          operation: 'findProducts',
          resource: 'catalog',
          error: new BadRequestException(`Meta API error: ${errorText}`),
        })
        messages = await this.errorExplanation.getOrCreate({
          provider: account.provider,
          errorCode: this.extractProviderErrorCode(errorText),
          errorTrace: errorText,
          resource: 'catalog',
        })
      }

      throw new BadRequestException({
        statusCode: 400,
        error: 'CatalogFetchError',
        code: 'catalog_fetch_failed',
        resource: 'catalog',
        message: messages?.en ?? 'Unable to load your catalogue. Please reconnect it to continue.',
        messages,
        technical: redactSecrets(errorText).slice(0, 2000),
      })
    }

    const data = (await response.json()) as {
      data: Array<Record<string, unknown>>
      paging?: { cursors?: { after?: string; before?: string }; next?: string }
      summary?: { total_count?: number }
    }

    const products = (data.data || []).map((p) => this.mapMetaProduct(p))

    // Search already ran server-side for the full catalogue. We still narrow
    // in-memory (same fields, a superset) — a no-op when Meta honoured the
    // filter, and the actual search for the product-set (collection) edge.
    // Status stays a client-side narrowing.
    let filtered = products

    if (params?.status) {
      filtered = filtered.filter((p) => p.status === params.status)
    }

    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(
        (p) =>
          (p.name as string)?.toLowerCase().includes(q) ||
          (p.retailerId as string)?.toLowerCase().includes(q) ||
          (p.description as string)?.toLowerCase().includes(q),
      )
    }

    // With an active filter: when the whole (filtered) edge fit in one page the
    // filtered length is the exact count; otherwise trust Meta's filtered
    // summary. Without a filter, the summary is the catalogue total.
    const allFetched = !data.paging?.next
    const hasFilter = !!search || !!params?.status
    const total =
      hasFilter && allFetched ? filtered.length : (data.summary?.total_count ?? filtered.length)

    return {
      products: filtered,
      total,
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

  // ─── Image Studio Templates ───

  async findImageTemplates(catalogId: string) {
    return this.prisma.imageTemplate.findMany({
      where: { catalogId },
      orderBy: { updatedAt: 'desc' },
    })
  }

  async createImageTemplate(
    catalogId: string,
    dto: {
      name: string
      format: string
      accent?: string
      definition: Record<string, unknown>
      sourceKey?: string
    },
  ) {
    const catalog = await this.prisma.catalog.findUnique({
      where: { id: catalogId },
      select: { organisationId: true },
    })
    if (!catalog) throw new NotFoundException('Catalogue introuvable')

    const data = {
      organisationId: catalog.organisationId,
      catalogId,
      name: dto.name,
      format: dto.format,
      accent: dto.accent ?? null,
      definition: dto.definition as Prisma.InputJsonValue,
      sourceKey: dto.sourceKey ?? null,
    }

    // Fork d'un template statique (sourceKey) : un seul override par
    // (catalogue, sourceKey) — on met à jour l'existant le cas échéant.
    if (dto.sourceKey) {
      const existing = await this.prisma.imageTemplate.findFirst({
        where: { catalogId, sourceKey: dto.sourceKey },
        select: { id: true },
      })
      if (existing) {
        return this.prisma.imageTemplate.update({ where: { id: existing.id }, data })
      }
    }
    return this.prisma.imageTemplate.create({ data })
  }

  async updateImageTemplate(
    catalogId: string,
    templateId: string,
    dto: {
      name?: string
      format?: string
      accent?: string
      definition?: Record<string, unknown>
    },
  ) {
    const existing = await this.prisma.imageTemplate.findFirst({
      where: { id: templateId, catalogId },
      select: { id: true },
    })
    if (!existing) throw new NotFoundException('Template introuvable')
    return this.prisma.imageTemplate.update({
      where: { id: templateId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.format !== undefined ? { format: dto.format } : {}),
        ...(dto.accent !== undefined ? { accent: dto.accent } : {}),
        ...(dto.definition !== undefined
          ? { definition: dto.definition as Prisma.InputJsonValue }
          : {}),
      },
    })
  }

  async deleteImageTemplate(catalogId: string, templateId: string) {
    const existing = await this.prisma.imageTemplate.findFirst({
      where: { id: templateId, catalogId },
      select: { id: true },
    })
    if (!existing) throw new NotFoundException('Template introuvable')
    await this.prisma.imageTemplate.delete({ where: { id: templateId } })
    return { id: templateId }
  }

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

  /** The social account backing a catalog — used to gate/record outbound calls. */
  private async resolveCatalogSocialAccount(catalogId: string): Promise<{
    id: string
    provider: SocialProvider
    disabled: boolean
    featureDisabled: SocialFeature[]
  } | null> {
    const catalog = await this.prisma.catalog.findUnique({
      where: { id: catalogId },
      include: {
        socialAccounts: {
          include: {
            socialAccount: {
              select: { id: true, provider: true, disabled: true, featureDisabled: true },
            },
          },
        },
      },
    })
    return catalog?.socialAccounts[0]?.socialAccount ?? null
  }

  /** Parses a Meta/TikTok error code from a raw provider error payload. */
  private extractProviderErrorCode(text: string): string | null {
    const code = text.match(/"code"\s*:\s*(\d+)/)
    const sub = text.match(/"error_subcode"\s*:\s*(\d+)/)
    if (code) return sub ? `${code[1]}/${sub[1]}` : code[1]
    const type = text.match(/"type"\s*:\s*"([A-Za-z]+Exception)"/)
    return type ? type[1] : null
  }

  // ─── WhatsApp Commerce Settings ───

  /**
   * List the Commerce Manager catalogue(s) linked to the number's WABA.
   *
   * This same call doubles as our SMB (WhatsApp Business app) detector: Meta
   * rejects it with error (#10) "This operation can not be performed on SMB
   * business type" for SMB numbers. That rejection is the reliable SMB signal,
   * so we surface `isSmb: true` instead of failing — only such numbers own an
   * in-app catalogue worth migrating to Commerce Manager.
   */
  async getWhatsAppCommerceSettings(userId: string, phoneNumberId: string) {
    await this.assertWhatsAppAccess(userId, phoneNumberId)
    const { accessToken, wabaId } = await this.resolveWhatsAppAccount(phoneNumberId)

    const response = await fetch(
      `${this.META_API_BASE}/${wabaId}/product_catalogs?access_token=${accessToken}`,
    )

    if (!response.ok) {
      const error = await response.text()
      if (this.isSmbBusinessError(error)) {
        this.logger.log(`[WhatsApp] ${phoneNumberId} is an SMB business (product_catalogs #10)`)
        return { data: [], isSmb: true }
      }
      this.logger.error(`WABA product_catalogs API error: ${error}`)
      throw new BadRequestException(`Meta API error: ${error}`)
    }

    const data = (await response.json()) as Record<string, unknown>
    return { ...data, isSmb: false }
  }

  /**
   * Meta error (#10) returned when an operation is attempted on an SMB
   * (WhatsApp Business app) business type — our reliable SMB-number signal.
   */
  private isSmbBusinessError(raw: string): boolean {
    return /SMB business type/i.test(raw)
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
      this.resolveAccessToken(catalogId),
      this.getCatalogProviderId(catalogId),
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
    const accessToken = await this.resolveAccessToken(catalogId)

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

    // Product-set membership is defined entirely by the filter above — Meta has
    // no "add product to set by id" operation — so there's nothing else to do.
    return (await response.json()) as { id: string }
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
