import { tool } from '@langchain/core/tools'
import { z } from 'zod'

export interface TicketRequestPayload {
  conversationId: string
  agentId: string
  organisationId: string
  note?: string
}

/**
 * The live agent no longer creates/updates tickets itself (that caused
 * duplicates and recursion-limit crashes). It just SIGNALS a lead via
 * request_ticket, which enqueues a dedicated async ticket agent that reads the
 * conversation + the existing tickets and decides create / update / noop,
 * linking the contact automatically.
 */
export function createTicketTools(deps: {
  agentId: string
  organisationId: string
  conversationId?: string
  enqueueTicketRequest?: (payload: TicketRequestPayload) => Promise<void> | void
}) {
  const requestTicket = tool(
    async ({ note }) => {
      if (!deps.conversationId) {
        return "Aucune conversation active — impossible d'enregistrer la demande."
      }
      try {
        await deps.enqueueTicketRequest?.({
          conversationId: deps.conversationId,
          agentId: deps.agentId,
          organisationId: deps.organisationId,
          note,
        })
        return 'Demande prise en compte. Le dossier sera cree ou mis a jour automatiquement.'
      } catch (error: unknown) {
        return `Impossible d'enregistrer la demande: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    },
    {
      name: 'request_ticket',
      description:
        'Signal that this conversation is a lead/order/booking to track (the customer wants to order, book, or needs follow-up). A dedicated process then creates OR updates the ticket from the conversation — deduplicated, with the contact linked automatically. You do NOT create the ticket yourself; this returns immediately.',
      schema: z.object({
        note: z
          .string()
          .optional()
          .describe('Optional one-line summary of what the customer wants (helps the ticket agent).'),
      }),
    },
  )

  return [requestTicket]
}
