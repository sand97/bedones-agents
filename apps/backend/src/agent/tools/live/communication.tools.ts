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

export function createCommunicationTools(deps: {
  messagingService: MessagingService
  conversationId: string
  replyGuard?: SingleReplyGuard
  /** Annulé quand un message plus récent du même contact arrive : on n'envoie plus rien. */
  signal?: AbortSignal
}) {
  const replyToMessage = tool(
    async ({ message }, config) => {
      // Yield once so a richer send_products / send_buttons emitted in the SAME
      // (parallel) tool batch claims the turn first — a plain text reply must
      // never pre-empt the product/button message the model sent alongside it.
      await Promise.resolve()
      if (deps.signal?.aborted) return RUN_CANCELLED_NOTICE
      if (!claimReply(deps.replyGuard)) return REPLY_ALREADY_SENT_NOTICE
      try {
        await deps.messagingService.sendMessageAsAgent(deps.conversationId, message)
        // Reply delivered → end the turn now (no second, wasted LLM call).
        return endTurnAfterSend(`Message sent: "${message.substring(0, 50)}..."`, config)
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
      }),
    },
  )

  return [replyToMessage]
}
