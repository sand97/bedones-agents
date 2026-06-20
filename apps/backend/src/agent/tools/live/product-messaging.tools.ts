import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { MessagingService } from '../../../social/messaging.service'
import {
  type SingleReplyGuard,
  REPLY_ALREADY_SENT_NOTICE,
  RUN_CANCELLED_NOTICE,
  claimReply,
  releaseReply,
  endTurnAfterSend,
} from './turn-guard'

export function createProductMessagingTools(deps: {
  messagingService: MessagingService
  conversationId: string
  catalogProviderMap: Record<string, string> // internalId → Meta providerId
  /** Shared product→catalog index populated by search_products. */
  productCatalogIndex?: Map<string, string>
  replyGuard?: SingleReplyGuard
  /** Annulé quand un message plus récent du même contact arrive : on n'envoie plus rien. */
  signal?: AbortSignal
}) {
  const sendProducts = tool(
    async ({ productIds, catalogId, format, headerText, bodyText }, config) => {
      if (deps.signal?.aborted) return RUN_CANCELLED_NOTICE
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

      // Claim the single customer-facing send synchronously (before any await), so
      // a parallel reply_to_message in the same batch is suppressed, not doubled.
      if (!claimReply(deps.replyGuard)) return REPLY_ALREADY_SENT_NOTICE

      try {
        // `product` format → always send the accompanying text as its OWN text
        // message first, then the card(s) with no body. WhatsApp does not reliably
        // render the Single Product Message `body` field, so a single-product send
        // that relied on it would silently drop the agent's message; and for several
        // cards a per-card body would just repeat. A standalone text message is
        // delivered reliably in both cases.
        // (product_list already carries a single shared body, untouched.)
        const trimmedBody = bodyText?.trim()
        const textFirst = format === 'product' && !!trimmedBody
        if (textFirst && trimmedBody) {
          await deps.messagingService.sendMessageAsAgent(deps.conversationId, trimmedBody)
        }
        await deps.messagingService.sendProductMessageAsAgent(
          deps.conversationId,
          productIds,
          metaCatalogId,
          format,
          headerText,
          textFirst ? undefined : bodyText,
        )
        // Products delivered → end the turn now (no second, wasted LLM call).
        return endTurnAfterSend(
          `Successfully sent ${productIds.length} product(s) as ${format} message.`,
          config,
        )
      } catch (error: unknown) {
        releaseReply(deps.replyGuard)
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
          .enum(['product', 'product_list', 'catalog_message'])
          .describe(
            'Message format. Defaults: "product" for 1-3 items (sent as individual product cards), "product_list" for 4+ items (sectioned list, up to 30; headerText required). "catalog_message" shows a catalog CTA with optional thumbnail. Carousels are intentionally disabled — the customer cannot pick a product from them.',
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
