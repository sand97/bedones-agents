import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { PrismaService } from '../../../prisma/prisma.service'

const NOTE_CATEGORIES = ['delivery_address', 'phone', 'size', 'preference', 'other'] as const

// Categories that hold a single current value — saving a new one replaces the
// existing note instead of stacking a second, possibly contradictory, line.
const SINGULAR_CATEGORIES: readonly string[] = ['delivery_address', 'phone', 'size']

export function createContactNoteTools(deps: {
  prisma: PrismaService
  conversationId: string
  agentId: string
}) {
  const saveContactNote = tool(
    async ({ content, category }) => {
      const trimmed = content.trim()
      if (!trimmed) return 'Empty note — nothing saved.'
      try {
        const existing = await deps.prisma.contactNote.findMany({
          where: { conversationId: deps.conversationId },
          select: { id: true, content: true, category: true },
        })

        // The agent already sees known facts in its prompt but sometimes re-saves
        // them — skip exact duplicates so the note doesn't grow repeated lines.
        if (existing.some((n) => n.content.trim().toLowerCase() === trimmed.toLowerCase())) {
          return `Already known — not duplicated: "${trimmed}"`
        }

        // Single-valued categories (phone, address, size) keep ONE current fact:
        // update the existing one rather than stacking a contradictory line.
        const cat = category ?? null
        if (cat && SINGULAR_CATEGORIES.includes(cat)) {
          const current = existing.find((n) => n.category === cat)
          if (current) {
            await deps.prisma.contactNote.update({
              where: { id: current.id },
              data: { content: trimmed },
            })
            return `Updated ${cat}: "${trimmed}"`
          }
        }

        await deps.prisma.contactNote.create({
          data: {
            conversationId: deps.conversationId,
            agentId: deps.agentId,
            category: cat,
            content: trimmed,
          },
        })
        return `Note saved${cat ? ` (${cat})` : ''}: "${trimmed}"`
      } catch (error: unknown) {
        return `Failed to save note: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    },
    {
      name: 'save_contact_note',
      description:
        'Save a NEW durable fact about THIS customer (address, phone, sizes, preferences) — or a confirmed next-step plan (e.g. a product to propose, with its retailer id, if the customer agrees) — to reuse on the next turn instead of asking again. Do NOT re-save something already listed in "What we already know about this customer". Never save secrets or card numbers.',
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
