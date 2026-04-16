import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { MessagingService } from '../../../social/messaging.service'

export function createCommunicationTools(deps: {
  messagingService: MessagingService
  conversationId: string
}) {
  const replyToMessage = tool(
    async ({ message }) => {
      try {
        await deps.messagingService.sendMessageAsAgent(deps.conversationId, message)
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
