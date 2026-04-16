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
        'Send product(s) from the catalog to the customer via WhatsApp. Use "product" format for a single product, or "product_list" for multiple products (up to 30). The product IDs must be retailer IDs from the search_products tool results.',
      schema: z.object({
        productIds: z
          .array(z.string())
          .min(1)
          .max(30)
          .describe('Array of product retailer IDs to send'),
        catalogId: z.string().describe('Internal catalog ID (from search_products context)'),
        format: z
          .enum(['product', 'product_list', 'carousel', 'catalog_message'])
          .describe(
            'Message format: "product" (single, loops if multiple IDs), "product_list" (sectioned list), "carousel" (swipeable product cards), "catalog_message" (catalog CTA with optional thumbnail)',
          ),
        headerText: z
          .string()
          .optional()
          .describe('Header text for product_list messages (required for product_list)'),
        bodyText: z.string().optional().describe('Body text to accompany the product message'),
      }),
    },
  )

  return [sendProducts]
}
