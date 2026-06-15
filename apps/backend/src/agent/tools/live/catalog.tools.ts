import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { PrismaService } from '../../../prisma/prisma.service'
import type {
  CatalogSearchService,
  ProductSearchResult,
} from '../../../image-processing/catalog-search.service'
import { groupByContent } from '../../product-context.util'

/**
 * Minimal seam over CatalogService's Meta Commerce lookup. Kept structural (not
 * the concrete class) so the tool layer carries no module dependency: production
 * passes the real CatalogService; dry-run/debug omit it and fall back to the
 * exact Qdrant lookup.
 */
export interface MetaProductLookup {
  hydrateProductsByRetailerIds(
    catalogProviderId: string,
    retailerIds: string[],
  ): Promise<
    Array<{
      retailerId: string
      name: string | null
      price: number | null
      currency: string | null
    }>
  >
}

export function createCatalogTools(deps: {
  catalogSearchService: CatalogSearchService
  prisma: PrismaService
  catalogIds: string[]
  /** internal catalog id → Meta provider catalog id (for the Meta Commerce lookup). */
  catalogProviderMap?: Record<string, string>
  /** Meta Commerce lookup (source of truth). Omitted in dry-run → Qdrant fallback. */
  catalogService?: MetaProductLookup
  /** Shared product→catalog index; filled here so send_products can resolve the catalog. */
  productCatalogIndex?: Map<string, string>
}) {
  // Per-turn loop breaker. buildLiveAgentTools (and therefore this factory) runs
  // once per turn, so this counter is scoped to a single turn. Semantic search
  // returns near-matches even for things we do not stock (asking for a "women's"
  // version returns the men's suits), which can tempt the model into searching
  // the same need over and over and blowing the graph recursion limit. After a
  // small budget we stop searching and force the model to answer.
  const MAX_SEARCHES_PER_TURN = 4
  let searchCount = 0

  const searchProducts = tool(
    async ({ query, queryEn }) => {
      if (deps.catalogIds.length === 0) {
        return 'No catalogs linked to this agent.'
      }

      searchCount++
      if (searchCount > MAX_SEARCHES_PER_TURN) {
        return `You have already searched the catalog ${MAX_SEARCHES_PER_TURN} times this turn — do NOT search again. Decide now with what the previous results showed: send the matching product(s), or tell the customer plainly the item is unavailable, then end your turn.`
      }

      const result = await deps.catalogSearchService.searchProducts(
        deps.catalogIds,
        query,
        10,
        queryEn || undefined,
      )

      if (!result.success) {
        return `Catalog search is temporarily unavailable (${result.error || 'unknown error'}). Tell the customer you will send this shortly — do NOT claim you already sent it or invent product details.`
      }
      if (result.products.length === 0) {
        return `No product matches "${query}" in the catalog — so we do NOT have it. Tell the customer plainly that this item is not available, then end your turn. Do NOT propose, offer, mention or imply ANY other product, model, style, colour, size, alternative or "other options" — none are confirmed to exist. Do NOT search again for this same request; only run a new search_products if the customer explicitly asks for a different product.`
      }

      // The agent must reference products by their RETAILER id — that is what the
      // WhatsApp product message API (and send_products) needs. The Qdrant
      // product_id is internal and Meta rejects it ("product not found for
      // product_retailer_id …"). Index each product's catalog under that same id.
      for (const p of result.products) {
        const sendId = p.retailerId || p.id
        if (p.catalogId) deps.productCatalogIndex?.set(sendId, p.catalogId)
      }

      // Attach the merchant-curated context of each product (available sizes,
      // advice, constraints…), grouped by identical content so a context shared
      // by several products is written once. Without this the agent speaks about
      // a product blind to its specific rules — e.g. it proposes M/L/XL when the
      // merchant only stocks sizes 46–56.
      const contextByProductId = await fetchProductContexts(deps.prisma, result.products)
      return formatResults(result.products, contextByProductId, SEARCH_RESULT_INTRO)
    },
    {
      name: 'search_products',
      description:
        'Search the catalog for products via semantic search. This is the ONLY source of truth for what exists: you MUST call it and get a matching row back BEFORE naming, proposing, promising or sending ANY product (or before claiming an item is unavailable). Provide the query in the user language, and optionally an English translation for better matching.',
      schema: z.object({
        query: z.string().describe('Search query in the user language'),
        queryEn: z
          .string()
          .optional()
          .describe('English translation of the query for better matching'),
      }),
    },
  )

  // Exact lookup by retailer id — used when the product is ALREADY identified, so
  // we send THAT product instead of a fuzzy search that returns look-alikes.
  const getProduct = tool(
    async ({ retailerIds }) => {
      const ids = Array.from(new Set(retailerIds.map((s) => s.trim()).filter(Boolean)))
      if (ids.length === 0) return 'Provide at least one retailer id.'
      if (deps.catalogIds.length === 0) return 'No catalogs linked to this agent.'

      const found = await resolveExactByRetailerId(deps, ids)
      if (found.length === 0) {
        return `No product matches the retailer id(s) ${ids.join(', ')} in the catalog. Do NOT invent or guess it. If the customer wants a different product, use search_products.`
      }

      // Index each product's catalog under its send id so send_products resolves
      // the catalog from the product (never guessed) — same contract as search.
      for (const p of found) {
        const sendId = p.retailerId || p.id
        if (p.catalogId) deps.productCatalogIndex?.set(sendId, p.catalogId)
      }

      const contextByProductId = await fetchProductContexts(deps.prisma, found)
      return formatResults(found, contextByProductId, EXACT_RESULT_INTRO)
    },
    {
      name: 'get_product',
      description:
        'Fetch the EXACT catalog product(s) by retailer id when you ALREADY know which product the customer means — the product from the post they came from, a code they typed, an [IMAGE_CONTEXT] match, or a product already shown in this conversation. Returns that exact product (never look-alikes), so you can send_products it directly WITHOUT a fuzzy search_products. Use search_products ONLY when the product is not yet identified.',
      schema: z.object({
        retailerIds: z
          .array(z.string())
          .min(1)
          .max(30)
          .describe('Known retailer id(s) / product code(s), e.g. ["S180KAKI"].'),
      }),
    },
  )

  return [searchProducts, getProduct]
}

/**
 * Resolve products by EXACT retailer id. Meta Commerce is the source of truth: it
 * confirms existence and refreshes name/price/currency from the live catalog.
 * Qdrant provides the structural data (internal product_id + catalog) needed for
 * the merchant context and for sending — and is the sole resolver when Meta is
 * not wired (dry-run) or unreachable. Either way the result is the exact product,
 * not a semantic look-alike.
 */
async function resolveExactByRetailerId(
  deps: {
    catalogSearchService: CatalogSearchService
    catalogIds: string[]
    catalogProviderMap?: Record<string, string>
    catalogService?: MetaProductLookup
  },
  ids: string[],
): Promise<ProductSearchResult[]> {
  const byRetailer = new Map<string, ProductSearchResult>()

  // Structural data + exact match from the index (product_id, catalog, context).
  const indexed = await deps.catalogSearchService
    .getProductsByRetailerIds(deps.catalogIds, ids)
    .catch(() => [] as ProductSearchResult[])
  for (const p of indexed) byRetailer.set(p.retailerId || p.id, p)

  // Meta Commerce as the authority: confirm/refresh, and recover products that
  // exist on Meta but are not (yet) indexed in Qdrant.
  if (deps.catalogService && deps.catalogProviderMap) {
    for (const [internalId, metaCatalogId] of Object.entries(deps.catalogProviderMap)) {
      const fresh = await deps.catalogService
        .hydrateProductsByRetailerIds(metaCatalogId, ids)
        .catch(() => [])
      for (const h of fresh) {
        const existing = byRetailer.get(h.retailerId)
        if (existing) {
          if (h.name) existing.name = h.name
          if (h.price != null) existing.price = h.price
          if (h.currency) existing.currency = h.currency
        } else {
          // Found on Meta only — usable for sending; no product_id so the
          // merchant-context lookup will simply miss for this one.
          byRetailer.set(h.retailerId, {
            id: h.retailerId,
            catalogId: internalId,
            retailerId: h.retailerId,
            name: h.name || '',
            price: h.price ?? undefined,
            currency: h.currency ?? undefined,
            rankingScore: 1,
          })
        }
      }
    }
  }

  return [...byRetailer.values()]
}

// Verbatim intro kept identical to the original output so the no-context path
// (catalogs without curated context) behaves exactly as before.
const SEARCH_RESULT_INTRO =
  'These rows are the ONLY products that exist for this query. You may ONLY mention, propose or send products listed below, using these EXACT productID values, names and prices. Do NOT invent, rename, re-price, or offer any product, variant, model, colour, size or "other option" that is not a row here. If what the customer asked for is NOT one of these exact rows, we do NOT have it: tell them plainly it is unavailable and STOP — do not search again for the same need (a repeat search returns these same rows). Only search again if the customer names a genuinely different product.'

// Intro for get_product (exact retailer-id lookup): these are THE products asked
// for, not look-alikes, so the agent can send them straight away.
const EXACT_RESULT_INTRO =
  'These are the EXACT product(s) you asked for by retailer id — the real catalog entries, not look-alikes. Use these EXACT productID, name and price, and send them directly with send_products (no further search needed). Do NOT add, rename, re-price or substitute any other product, variant, colour or size that is not listed here.'

/**
 * Fetch the merchant-curated context attached to each search hit, keyed by Meta
 * product id. The join key is reliable: ProductContext.providerProductId ===
 * the Qdrant `product_id` === ProductSearchResult.id (all the Meta product id).
 * Context is a best-effort enrichment — a failure here never breaks the search.
 */
async function fetchProductContexts(
  prisma: PrismaService,
  products: ProductSearchResult[],
): Promise<Map<string, string>> {
  // Context is scoped by (catalogId, providerProductId); a search can span
  // several catalogs, so group the product ids by their catalog.
  const idsByCatalog = new Map<string, Set<string>>()
  for (const p of products) {
    if (!p.catalogId) continue
    const ids = idsByCatalog.get(p.catalogId) ?? new Set<string>()
    ids.add(p.id)
    idsByCatalog.set(p.catalogId, ids)
  }
  if (idsByCatalog.size === 0) return new Map()

  try {
    const rows = await prisma.productContext.findMany({
      where: {
        OR: [...idsByCatalog].map(([catalogId, ids]) => ({
          catalogId,
          providerProductId: { in: [...ids] },
        })),
      },
      select: { providerProductId: true, content: true },
    })

    const byProductId = new Map<string, string>()
    for (const row of rows) {
      const content = row.content?.trim()
      if (content) byProductId.set(row.providerProductId, content)
    }
    return byProductId
  } catch {
    return new Map()
  }
}

/**
 * Render the search results for the agent. When products carry a curated
 * context, append a "ctx" column that points each row to its context, and list
 * the contexts once, grouped by identical content (so a context shared by five
 * suits is written a single time). When nothing has a context, fall back to the
 * original compact output verbatim.
 */
function formatResults(
  products: ProductSearchResult[],
  contextByProductId: Map<string, string>,
  intro: string,
): string {
  const sendIdOf = (p: ProductSearchResult) => p.retailerId || p.id
  const cells = (p: ProductSearchResult) =>
    `${sendIdOf(p)},${(p.rankingScore ?? p.similarity ?? 0).toFixed(3)},${p.name},${p.price || 'N/A'},${p.currency || 'N/A'}`

  if (contextByProductId.size === 0) {
    const lines = products.map(cells)
    return `${intro}\nproductID,score,name,price,currency\n${lines.join('\n')}`
  }

  // Group products by identical context (a context shared by several products is
  // listed once), labelling each group A, B, … so every row points to its one.
  const groups = groupByContent(
    products.flatMap((p) => {
      const content = contextByProductId.get(p.id)
      return content ? [{ item: p, content }] : []
    }),
  )
  const labelByContent = new Map(groups.map((g, i) => [g.content, String.fromCharCode(65 + i)]))

  const lines = products.map((p) => {
    const content = contextByProductId.get(p.id)
    const ctx = content ? labelByContent.get(content)! : '-'
    return `${cells(p)},${ctx}`
  })

  const contextBlocks = groups.map((g, i) => {
    const ids = g.items.map(sendIdOf).join(', ')
    return `[${String.fromCharCode(65 + i)}] applies to ${ids}:\n${g.content}`
  })

  return (
    `${intro}\n` +
    'The "ctx" column links each product to its CONTEXT listed below — the merchant\'s specific rules for that product (available sizes, how to advise, constraints). When a product has a context you MUST follow it and NEVER contradict it (e.g. propose only the sizes it lists, never invent others); "-" means no specific context.\n' +
    `productID,score,name,price,currency,ctx\n${lines.join('\n')}\n\n` +
    `CONTEXT:\n${contextBlocks.join('\n\n')}`
  )
}
