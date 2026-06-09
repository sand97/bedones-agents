import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { PrismaService } from '../../../prisma/prisma.service'

const NOTE_CATEGORIES = [
  'delivery_address',
  'phone',
  'size',
  'preference',
  'other',
] as const

export function createContactNoteTools(deps: {
  prisma: PrismaService
  conversationId: string
  agentId: string
}) {
  const saveContactNote = tool(
    async ({ content, category }) => {
      try {
        await deps.prisma.contactNote.create({
          data: {
            conversationId: deps.conversationId,
            agentId: deps.agentId,
            category: category ?? null,
            content,
          },
        })
        return `Note saved${category ? ` (${category})` : ''}: "${content}"`
      } catch (error: unknown) {
        return `Failed to save note: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    },
    {
      name: 'save_contact_note',
      description:
        'Save a durable fact about THIS customer (address, phone, sizes, preferences) to reuse later instead of asking again. Never save secrets or card numbers.',
      schema: z.object({
        content: z.string().describe('The information to remember, in a short factual sentence.'),
        category: z
          .enum(NOTE_CATEGORIES)
          .optional()
          .describe('Optional bucket to organise the note.'),
      }),
    },
  )

  return [saveContactNote]
}
