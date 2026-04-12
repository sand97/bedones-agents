import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { PrismaService } from '../../../prisma/prisma.service'

export function createMessageTools(deps: { prisma: PrismaService; conversationId: string }) {
  const getMessageHistory = tool(
    async ({ count }) => {
      const messages = await deps.prisma.directMessage.findMany({
        where: { conversationId: deps.conversationId },
        orderBy: { createdTime: 'desc' },
        take: count || 20,
        select: {
          message: true,
          isFromPage: true,
          senderName: true,
          mediaType: true,
          createdTime: true,
        },
      })

      if (messages.length === 0) return 'No message history available.'

      return messages
        .reverse()
        .map((m) => {
          const sender = m.isFromPage ? 'Business' : m.senderName
          const content = m.message || (m.mediaType ? `[${m.mediaType}]` : '[empty]')
          return `[${sender}]: ${content}`
        })
        .join('\n')
    },
    {
      name: 'get_message_history',
      description: 'Get older messages from this conversation for additional context.',
      schema: z.object({
        count: z.number().optional().describe('Number of messages to fetch (default: 20)'),
      }),
    },
  )

  return [getMessageHistory]
}
