import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { MessagingService } from '../../../social/messaging.service'

export function createProductMessagingTools(deps: {
  messagingService: MessagingService
  conversationId: string
  catalogProviderMap: Record<string, string> // internalId → Meta providerId
}) {
  const sendProducts = tool(
    async ({ productIds, catalogId, format, headerText, bodyText }) => {
      const metaCatalogId = deps.catalogProviderMap[catalogId]
      if (!metaCatalogId) {
        return `Failed: catalog "${catalogId}" has no Meta provider ID. Available catalogs: ${Object.keys(deps.catalogProviderMap).join(', ')}`
      }

      try {
        await deps.messagingService.sendProductMessageAsAgent(
          deps.conversationId,
          productIds,
          metaCatalogId,
          format,
          headerText,
          bodyText,
        )
        return `Successfully sent ${productIds.length} product(s) as ${format} message.`
      } catch (error: unknown) {
        return `Failed to send products: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    },
    {
      name: 'send_products',
      description:
        'Send product(s) from the catalog to the customer via WhatsApp. Default format by count (unless admin rules override): 1-3 → "product", 4-10 → "carousel", >10 → "product_list". If you request "carousel" with more than 10 products, the service will automatically fall back to "product_list". Product IDs must be retailer IDs from the search_products tool results.',
      schema: z.object({
        productIds: z
          .array(z.string())
          .min(1)
          .max(30)
          .describe('Array of product retailer IDs to send (max 30)'),
        catalogId: z.string().describe('Internal catalog ID (from search_products context)'),
        format: z
          .enum(['product', 'product_list', 'carousel', 'catalog_message'])
          .describe(
            'Message format. Defaults: "product" for 1-3 items (sent as individual product cards), "carousel" for 4-10 items (swipeable cards, hard cap 10), "product_list" for >10 items (sectioned list, up to 30). "catalog_message" shows a catalog CTA with optional thumbnail.',
          ),
        headerText: z
          .string()
          .optional()
          .describe('Header text — required for product_list, ignored by other formats'),
        bodyText: z.string().optional().describe('Body text to accompany the product message'),
      }),
    },
  )

  return [sendProducts]
}
