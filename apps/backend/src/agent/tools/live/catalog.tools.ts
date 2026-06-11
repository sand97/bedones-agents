import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { CatalogSearchService } from '../../../image-processing/catalog-search.service'

export function createCatalogTools(deps: {
  catalogSearchService: CatalogSearchService
  catalogIds: string[]
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

      if (!result.success || result.products.length === 0) {
        return `No products found for query "${query}". ${result.error || ''}`
      }

      // send_products needs the Meta retailer_id (merchant SKU), NOT the internal
      // product_id — sending a product_id triggers Meta error 131009 ("product
      // not found for product_retailer_id"). Expose the retailer_id here.
      const lines = result.products.map((p) => {
        const retailerId = p.retailerId || p.id
        return `${retailerId},${(p.rankingScore ?? p.similarity ?? 0).toFixed(3)},${p.name},${p.price || 'N/A'}`
      })
      return `retailerID,score,name,price\n${lines.join('\n')}`
    },
    {
      name: 'search_products',
      description:
        'Search for products in the catalog using semantic search. Provide the query in the user language, and optionally an English translation for better matching. Returns CSV `retailerID,score,name,price`; pass the retailerID values to send_products.',
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
