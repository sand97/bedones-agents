import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { MessagingService } from '../../../social/messaging.service'
import { type SingleReplyGuard, REPLY_ALREADY_SENT_NOTICE } from './turn-guard'

export function createProductMessagingTools(deps: {
  messagingService: MessagingService
  conversationId: string
  catalogProviderMap: Record<string, string> // internalId → Meta providerId
  replyGuard?: SingleReplyGuard
}) {
  const sendProducts = tool(
    async ({ productIds, catalogId, format, headerText, bodyText }) => {
      if (deps.replyGuard?.sent) return REPLY_ALREADY_SENT_NOTICE

      // The model frequently confuses catalogId with a product/retailer id. When
      // the agent has a single catalog, resolve it automatically; otherwise keep
      // the id it provided. This avoids a failed call + retry that eats the turn
      // budget (and can lead to a recursion-limit crash).
      const catalogKeys = Object.keys(deps.catalogProviderMap)
      let resolvedCatalogId = catalogId
      if (!resolvedCatalogId || !deps.catalogProviderMap[resolvedCatalogId]) {
        if (catalogKeys.length === 1) resolvedCatalogId = catalogKeys[0]
      }
      const metaCatalogId = resolvedCatalogId
        ? deps.catalogProviderMap[resolvedCatalogId]
        : undefined
      if (!metaCatalogId) {
        return `Failed: unknown catalogId "${catalogId ?? ''}" (this is NOT a product/retailer id). Use one of: ${catalogKeys.join(', ')}.`
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
        if (deps.replyGuard) deps.replyGuard.sent = true
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
        catalogId: z
          .string()
          .optional()
          .describe(
            'Internal catalog ID. Omit it when the agent has a single catalog (it is inferred automatically). This is NOT a product/retailer id.',
          ),
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
