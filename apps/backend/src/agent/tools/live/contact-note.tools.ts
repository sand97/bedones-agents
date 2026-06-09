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
        "Save a durable note about THIS customer (delivery address, phone to call, clothing/shoe sizes, preferences, anything reusable). Use it whenever the customer shares such info so you can reuse it later instead of asking again. Don't save secrets or payment card numbers.",
      schema: z.object({
        content: z.string().describe('The information to remember, in a short factual sentence.'),
        category: z
          .enum(NOTE_CATEGORIES)
          .optional()
          .describe('Optional bucket to organise the note.'),
      }),
    },
  )

  const getContactNotes = tool(
    async () => {
      try {
        const notes = await deps.prisma.contactNote.findMany({
          where: { conversationId: deps.conversationId },
          orderBy: { createdAt: 'asc' },
          select: { category: true, content: true, createdAt: true },
        })
        if (notes.length === 0) return 'No notes saved for this customer yet.'
        return notes
          .map((n) => `- ${n.category ? `[${n.category}] ` : ''}${n.content}`)
          .join('\n')
      } catch (error: unknown) {
        return `Failed to read notes: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    },
    {
      name: 'get_contact_notes',
      description:
        'List everything previously saved about THIS customer (address, phone, sizes, preferences). Existing notes are already injected into your context, so use this only to refresh after saving.',
      schema: z.object({}),
    },
  )

  return [saveContactNote, getContactNotes]
}
