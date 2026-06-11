import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { EncryptionService } from '../../auth/encryption.service'
import { SocialHealthService } from '../../social/social-health.service'
import { ErrorExplanationService, redactSecrets } from '../../social/error-explanation.service'
import { CatalogAccessService } from './catalog-access.service'

@Injectable()
export class CatalogProductQueryService {
  private readonly logger = new Logger('CatalogService')
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
    private encryptionService: EncryptionService,
    private socialHealth: SocialHealthService,
    private errorExplanation: ErrorExplanationService,
    private accessService: CatalogAccessService,
  ) {}

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
    const accessToken = await this.accessService.resolveAccessToken(catalogId)

    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          const url = `${this.META_API_BASE}/${id}?fields=${CatalogProductQueryService.META_PRODUCT_FIELDS}&access_token=${accessToken}`
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
    const socialLink = this.accessService.pickCatalogSocialLink(catalog.socialAccounts)
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
      this.accessService.resolveAccessToken(catalogId),
      this.accessService.getCatalogProviderId(catalogId),
      this.accessService.resolveCatalogSocialAccount(catalogId),
    ])

    // Note: catalog listing is a user-triggered READ, so we never gate it on the
    // circuit breaker (and React Query retries would trip it almost instantly).
    // We still surface a friendly error + log it for visibility on failure.

    // When filtering by collection, fetch from the product set endpoint
    const baseId = params?.collectionId || providerId
    const limit = params?.limit || 20
    const query = new URLSearchParams({
      fields: CatalogProductQueryService.META_PRODUCT_FIELDS,
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

  /** Parses a Meta/TikTok error code from a raw provider error payload. */
  private extractProviderErrorCode(text: string): string | null {
    const code = text.match(/"code"\s*:\s*(\d+)/)
    const sub = text.match(/"error_subcode"\s*:\s*(\d+)/)
    if (code) return sub ? `${code[1]}/${sub[1]}` : code[1]
    const type = text.match(/"type"\s*:\s*"([A-Za-z]+Exception)"/)
    return type ? type[1] : null
  }
}
