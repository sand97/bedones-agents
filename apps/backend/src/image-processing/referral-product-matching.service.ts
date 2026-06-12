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
  /** Vector similarity (semantic matches only). */
  similarity?: number
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
  ): Promise<{ name: string; price?: number; currency?: string; retailerId?: string }> {
    const point = await this.qdrant.getProductPoint(catalogId, providerProductId).catch(() => null)
    if (point) {
      const p = point.payload
      return {
        name: (p.product_name as string) || (p.name as string) || 'Produit du catalogue',
        price: typeof p.price === 'number' ? p.price : undefined,
        currency: (p.currency as string) || undefined,
        retailerId: (p.retailer_id as string) || undefined,
      }
    }

    const product = await this.prisma.product
      .findUnique({
        where: { catalogId_providerProductId: { catalogId, providerProductId } },
        select: { name: true, price: true, currency: true },
      })
      .catch(() => null)
    if (product) {
      return {
        name: product.name,
        price: product.price ?? undefined,
        currency: product.currency ?? undefined,
      }
    }

    return { name: 'Produit du catalogue' }
  }
}
