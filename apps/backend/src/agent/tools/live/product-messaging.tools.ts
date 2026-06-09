import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { MessagingService } from '../../../social/messaging.service'
import { type SingleReplyGuard, REPLY_ALREADY_SENT_NOTICE } from './turn-guard'

export function createProductMessagingTools(deps: {
  messagingService: MessagingService
  conversationId: string
  catalogProviderMap: Record<string, string> // internalId → Meta providerId
  /** Shared product→catalog index populated by search_products. */
  productCatalogIndex?: Map<string, string>
  replyGuard?: SingleReplyGuard
}) {
  const sendProducts = tool(
    async ({ productIds, catalogId, format, headerText, bodyText }) => {
      if (deps.replyGuard?.sent) return REPLY_ALREADY_SENT_NOTICE

      const catalogKeys = Object.keys(deps.catalogProviderMap)

      // Resolve the catalog FROM the products (search_products recorded which
      // catalog each one belongs to). The model must not guess it: if a product
      // maps to a catalog we cannot send under, we fail instead of forcing it
      // onto the wrong catalog.
      const productCatalogs = new Set<string>()
      for (const id of productIds) {
        const c = deps.productCatalogIndex?.get(id)
        if (c) productCatalogs.add(c)
      }

      if (productCatalogs.size > 1) {
        return `Failed: these products span multiple catalogs (${[...productCatalogs].join(', ')}). Send products from a single catalog per message.`
      }

      const resolvedCatalogId =
        [...productCatalogs][0] ??
        (catalogId && deps.catalogProviderMap[catalogId]
          ? catalogId
          : catalogKeys.length === 1
            ? catalogKeys[0]
            : undefined)

      const metaCatalogId = resolvedCatalogId
        ? deps.catalogProviderMap[resolvedCatalogId]
        : undefined
      if (!metaCatalogId) {
        return `Failed: could not resolve a sendable catalog for these products. Run search_products first, or pass a valid catalogId (one of: ${catalogKeys.join(', ')}). Do not force a different catalog.`
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
        'Send catalog product(s) to the customer (formatting and per-count rules are in the system prompt). Product IDs come from search_products results.',
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
