import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { CatalogSearchService } from '../../../image-processing/catalog-search.service'

export function createCatalogTools(deps: {
  catalogSearchService: CatalogSearchService
  catalogIds: string[]
  /** Shared product→catalog index; filled here so send_products can resolve the catalog. */
  productCatalogIndex?: Map<string, string>
}) {
  const searchProducts = tool(
    async ({ query, queryEn }) => {
      if (deps.catalogIds.length === 0) {
        return 'No catalogs linked to this agent.'
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
        return `No products found for query "${query}".`
      }

      // The agent must reference products by their RETAILER id — that is what the
      // WhatsApp product message API (and send_products) needs. The Qdrant
      // product_id is internal and Meta rejects it ("product not found for
      // product_retailer_id …"). Index each product's catalog under that same id.
      const lines = result.products.map((p) => {
        const sendId = p.retailerId || p.id
        if (p.catalogId) deps.productCatalogIndex?.set(sendId, p.catalogId)
        return `${sendId},${(p.rankingScore ?? p.similarity ?? 0).toFixed(3)},${p.name},${p.price || 'N/A'},${p.currency || 'N/A'}`
      })
      return `productID,score,name,price,currency\n${lines.join('\n')}`
    },
    {
      name: 'search_products',
      description:
        'Search for products in the catalog using semantic search. Provide the query in the user language, and optionally an English translation for better matching.',
      schema: z.object({
        query: z.string().describe('Search query in the user language'),
        queryEn: z
          .string()
          .optional()
          .describe('English translation of the query for better matching'),
      }),
    },
  )

  return [searchProducts]
}
