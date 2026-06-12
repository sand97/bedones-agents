import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { MessagingService } from '../../../social/messaging.service'
import { MAX_BUTTONS } from '../../../social/button-format.util'
import {
  type SingleReplyGuard,
  REPLY_ALREADY_SENT_NOTICE,
  claimReply,
  releaseReply,
} from './turn-guard'

export function createButtonMessagingTools(deps: {
  messagingService: MessagingService
  conversationId: string
  replyGuard?: SingleReplyGuard
}) {
  const sendButtons = tool(
    async ({ body, buttons }) => {
      // Claim synchronously (before any await) so a parallel reply_to_message in
      // the same batch is suppressed, not doubled.
      if (!claimReply(deps.replyGuard)) return REPLY_ALREADY_SENT_NOTICE
      try {
        await deps.messagingService.sendInteractiveButtonsAsAgent(
          deps.conversationId,
          body,
          buttons,
        )
        return `Proposal sent with ${buttons.length} button(s): ${buttons.map((b) => b.label).join(', ')}`
      } catch (error: unknown) {
        releaseReply(deps.replyGuard)
        return `Failed to send buttons: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    },
    {
      name: 'send_buttons',
      description:
        'Send a short message with up to 3 tappable reply buttons for a small closed-set choice (payment, delivery, sizes). Do NOT also call reply_to_message this turn.',
      schema: z.object({
        body: z
          .string()
          .describe('The question / message shown above the buttons. Keep it concise.'),
        buttons: z
          .array(
            z.object({
              id: z
                .string()
                .optional()
                .describe('Optional stable id echoed back when tapped (auto-generated otherwise)'),
              label: z
                .string()
                .describe('Button text. Keep it under 20 characters; longer text is truncated.'),
            }),
          )
          .min(1)
          .max(MAX_BUTTONS)
          .describe(`Between 1 and ${MAX_BUTTONS} buttons.`),
      }),
    },
  )

  return [sendButtons]
}
