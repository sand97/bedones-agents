import { Injectable, Logger } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import { CatalogSearchService } from './catalog-search.service'
import { QdrantService } from './qdrant.service'

export interface ReferralProductMatch {
  /** How the product was found: an explicit post→product link, or a body text search. */
  source: 'post-link' | 'semantic'
  catalogId: string
  /** Meta product id (Qdrant `product_id` / ProductPostLink.providerProductId). */
  productId: string
  /** Merchant retailer id — the id the WhatsApp product message API expects. */
  retailerId?: string
  name: string
  price?: number
  currency?: string
  /** Product description as synced from Meta (when indexed). */
  description?: string
  /** Vector similarity (semantic matches only). */
  similarity?: number
}

/**
 * A catalog product the merchant EXPLICITLY linked to a social post (ProductPostLink),
 * enriched with its merchant details AND the custom context the merchant wrote for it.
 *
 * This is the richer counterpart used to give the comment / DM agents (Facebook,
 * Instagram, TikTok) the same product knowledge the WhatsApp agent already gets from a
 * post referral: name, price, description and — crucially — the seller's custom context.
 */
export interface LinkedPostProduct {
  catalogId: string
  /** Meta product id (ProductPostLink.providerProductId / ProductContext.providerProductId). */
  productId: string
  retailerId?: string
  name: string
  price?: number
  currency?: string
  description?: string
  /** Merchant-written context for this product (ProductContext.content), if any. */
  customContext?: string
}

/**
 * Resolves which catalog product a WhatsApp "post" referral points to.
 *
 * When a customer messages us straight from a social post, WhatsApp attaches a
 * `referral` describing that post (its id, caption, image). We use it to figure out
 * the product they saw so the agent can answer about it ("more info on this?").
 *
 * Sibling of {@link ImageProductMatchingService}: same idea — match an incoming
 * signal to a catalog product — but the signal is a post referral, not an image.
 */
@Injectable()
export class ReferralProductMatchingService {
  private readonly logger = new Logger(ReferralProductMatchingService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogSearch: CatalogSearchService,
    private readonly qdrant: QdrantService,
  ) {}

  async resolveFromReferral(params: {
    organisationId: string
    sourceId?: string | null
    body?: string | null
  }): Promise<ReferralProductMatch | null> {
    const { organisationId, sourceId, body } = params

    // Priority 1: the merchant explicitly linked a catalog article to this post.
    const linked = await this.resolveFromPostLink(organisationId, sourceId)
    if (linked) return linked

    // Priority 2 (fallback): semantic search of the post caption.
    return this.resolveFromBody(organisationId, body)
  }

  /**
   * Resolve EVERY catalog product the merchant explicitly linked to a stored post
   * (ProductPostLink), enriched with merchant details (name / price / description) AND
   * each product's custom context (ProductContext.content).
   *
   * Unlike {@link resolveFromReferral} — which picks a single best match for a WhatsApp
   * post referral — this returns the full set, because a comment/DM agent answering on a
   * given post benefits from the context of all the articles that post is about. Used by
   * the Facebook / Instagram / TikTok agents so they get the same product knowledge the
   * WhatsApp agent already has.
   *
   * Matches the bare post id OR a `_<postId>` suffix, mirroring {@link resolveFromPostLink}
   * (Facebook posts are stored as `PAGEID_POSTID`). Best-effort: returns [] on any failure.
   */
  async resolveLinkedProductsForPost(params: {
    organisationId: string
    postId?: string | null
  }): Promise<LinkedPostProduct[]> {
    const id = params.postId?.trim()
    if (!id) return []

    try {
      const links = await this.prisma.productPostLink.findMany({
        where: {
          catalog: { organisationId: params.organisationId },
          OR: [{ postId: id }, { postId: { endsWith: `_${id}` } }],
        },
        orderBy: { createdAt: 'desc' },
        select: { catalogId: true, providerProductId: true },
      })
      if (links.length === 0) return []

      // A product may be linked once per (catalog, post) — collapse to unique products.
      const seen = new Set<string>()
      const unique = links.filter((l) => {
        const key = `${l.catalogId}:${l.providerProductId}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      // Custom merchant context for those products (keyed by catalogId + product id).
      const contexts = await this.prisma.productContext.findMany({
        where: {
          OR: unique.map((l) => ({
            catalogId: l.catalogId,
            providerProductId: l.providerProductId,
          })),
        },
        select: { catalogId: true, providerProductId: true, content: true },
      })
      const contextByKey = new Map<string, string>()
      for (const c of contexts) {
        const content = c.content?.trim()
        if (content) contextByKey.set(`${c.catalogId}:${c.providerProductId}`, content)
      }

      return Promise.all(
        unique.map(async (l) => {
          const details = await this.enrichProduct(l.catalogId, l.providerProductId)
          return {
            catalogId: l.catalogId,
            productId: l.providerProductId,
            ...details,
            customContext: contextByKey.get(`${l.catalogId}:${l.providerProductId}`),
          } satisfies LinkedPostProduct
        }),
      )
    } catch (error) {
      this.logger.warn(
        `Linked products resolution failed for post ${id}: ${error instanceof Error ? error.message : error}`,
      )
      return []
    }
  }

  /**
   * Priority 1 — explicit catalog-article ↔ post link (ProductPostLink).
   *
   * WhatsApp sends the bare post id (e.g. `967072259499626`) while Facebook posts are
   * stored as `PAGEID_POSTID`, so we match on equality OR on a `_<sourceId>` suffix.
   */
  private async resolveFromPostLink(
    organisationId: string,
    sourceId?: string | null,
  ): Promise<ReferralProductMatch | null> {
    const id = sourceId?.trim()
    if (!id) return null

    try {
      const link = await this.prisma.productPostLink.findFirst({
        where: {
          catalog: { organisationId },
          OR: [{ postId: id }, { postId: { endsWith: `_${id}` } }],
        },
        orderBy: { createdAt: 'desc' },
        select: { catalogId: true, providerProductId: true },
      })
      if (!link) return null

      const enriched = await this.enrichProduct(link.catalogId, link.providerProductId)
      return {
        source: 'post-link',
        catalogId: link.catalogId,
        productId: link.providerProductId,
        ...enriched,
      }
    } catch (error) {
      this.logger.warn(
        `Post-link resolution failed for source_id ${id}: ${error instanceof Error ? error.message : error}`,
      )
      return null
    }
  }

  /** Priority 2 — semantic search of the post caption over the org's catalogs. */
  private async resolveFromBody(
    organisationId: string,
    body?: string | null,
  ): Promise<ReferralProductMatch | null> {
    const text = body?.trim()
    if (!text) return null

    try {
      const catalogs = await this.prisma.catalog.findMany({
        where: { organisationId },
        select: { id: true },
      })
      const catalogIds = catalogs.map((c) => c.id)
      if (catalogIds.length === 0) return null

      const result = await this.catalogSearch.searchProducts(catalogIds, text, 1)
      const top = result.products?.[0]
      if (!top) return null

      return {
        source: 'semantic',
        catalogId: top.catalogId || catalogIds[0],
        productId: top.id,
        retailerId: top.retailerId,
        name: top.name,
        price: top.price,
        currency: top.currency,
        similarity: top.similarity,
      }
    } catch (error) {
      this.logger.warn(
        `Body semantic resolution failed: ${error instanceof Error ? error.message : error}`,
      )
      return null
    }
  }

  /**
   * Fill in name/price/retailer for a linked product. Meta-synced catalogs often have
   * no local Product row, so we read the indexed Qdrant point first and fall back to
   * the local table.
   */
  private async enrichProduct(
    catalogId: string,
    providerProductId: string,
  ): Promise<{
    name: string
    price?: number
    currency?: string
    retailerId?: string
    description?: string
  }> {
    const point = await this.qdrant.getProductPoint(catalogId, providerProductId).catch(() => null)
    if (point) {
      const p = point.payload
      return {
        name: (p.product_name as string) || (p.name as string) || 'Produit du catalogue',
        price: typeof p.price === 'number' ? p.price : undefined,
        currency: (p.currency as string) || undefined,
        retailerId: (p.retailer_id as string) || undefined,
        description: (p.description as string) || undefined,
      }
    }

    const product = await this.prisma.product
      .findUnique({
        where: { catalogId_providerProductId: { catalogId, providerProductId } },
        select: { name: true, price: true, currency: true, description: true },
      })
      .catch(() => null)
    if (product) {
      return {
        name: product.name,
        price: product.price ?? undefined,
        currency: product.currency ?? undefined,
        description: product.description ?? undefined,
      }
    }

    return { name: 'Produit du catalogue' }
  }
}
