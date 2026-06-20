import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { MessagingService } from '../../../social/messaging.service'
import {
  type SingleReplyGuard,
  REPLY_ALREADY_SENT_NOTICE,
  RUN_CANCELLED_NOTICE,
  claimReply,
  releaseReply,
} from './turn-guard'

export function createCommunicationTools(deps: {
  messagingService: MessagingService
  conversationId: string
  replyGuard?: SingleReplyGuard
  /** Annulé quand un message plus récent du même contact arrive : on n'envoie plus rien. */
  signal?: AbortSignal
}) {
  const replyToMessage = tool(
    async ({ message, aboutProductIds }) => {
      // Yield once so a richer send_products / send_buttons emitted in the SAME
      // (parallel) tool batch claims the turn first — a plain text reply must
      // never pre-empt the product/button message the model sent alongside it.
      await Promise.resolve()
      if (deps.signal?.aborted) return RUN_CANCELLED_NOTICE
      if (!claimReply(deps.replyGuard)) return REPLY_ALREADY_SENT_NOTICE
      try {
        // Tag the message with the product(s) it is about so the conversation
        // keeps their merchant context (sizes, rules) available on later turns —
        // even though no card was sent. Unknown ids are simply ignored downstream.
        const ids = (aboutProductIds ?? []).map((s) => s.trim()).filter(Boolean)
        const metadata =
          ids.length > 0 ? { aboutProducts: ids.map((retailerId) => ({ retailerId })) } : undefined
        await deps.messagingService.sendMessageAsAgent(deps.conversationId, message, metadata)
        return `Message sent: "${message.substring(0, 50)}..."`
      } catch (error: unknown) {
        releaseReply(deps.replyGuard)
        return `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    },
    {
      name: 'reply_to_message',
      description:
        'Send a text message reply to the current conversation. Use this for every client-facing response.',
      schema: z.object({
        message: z.string().describe('The message to send. Keep it concise (max 500 characters).'),
        aboutProductIds: z
          .array(z.string())
          .optional()
          .describe(
            'Retailer id(s) of the catalog product(s) this reply is ABOUT, e.g. ["S180BLEU"]. Set it whenever your message discusses, confirms or asks about specific catalog product(s) WITHOUT sending a card — so the conversation keeps their merchant context (available sizes, rules) on later turns. Use the EXACT ids from search_products / get_product / [IMAGE_CONTEXT]; omit when the reply is not about a specific product.',
          ),
      }),
    },
  )

  return [replyToMessage]
}
