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

      if (!result.success || result.products.length === 0) {
        return `No products found for query "${query}". ${result.error || ''}`
      }

      // Remember which catalog each product belongs to, so send_products can
      // resolve it from the product id instead of the model guessing.
      if (deps.productCatalogIndex) {
        for (const p of result.products) {
          if (p.catalogId) deps.productCatalogIndex.set(p.id, p.catalogId)
        }
      }

      const lines = result.products.map(
        (p) =>
          `${p.id},${(p.rankingScore ?? p.similarity ?? 0).toFixed(3)},${p.name},${p.price || 'N/A'},${p.currency || 'N/A'}`,
      )
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
