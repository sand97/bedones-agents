import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { MessagingService } from '../../../social/messaging.service'
import { type SingleReplyGuard, REPLY_ALREADY_SENT_NOTICE } from './turn-guard'

export function createCommunicationTools(deps: {
  messagingService: MessagingService
  conversationId: string
  replyGuard?: SingleReplyGuard
}) {
  const replyToMessage = tool(
    async ({ message }) => {
      if (deps.replyGuard?.sent) return REPLY_ALREADY_SENT_NOTICE
      try {
        await deps.messagingService.sendMessageAsAgent(deps.conversationId, message)
        if (deps.replyGuard) deps.replyGuard.sent = true
        return `Message sent: "${message.substring(0, 50)}..."`
      } catch (error: unknown) {
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
