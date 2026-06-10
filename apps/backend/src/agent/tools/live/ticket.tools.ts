import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { PrismaService } from '../../../prisma/prisma.service'
import type { EventsGateway } from '../../../gateway/events.gateway'

export function createTicketTools(deps: {
  prisma: PrismaService
  gateway: EventsGateway
  agentId: string
  organisationId: string
  conversationId?: string
}) {
  const createTicket = tool(
    async ({ title, description, priority, contactName, provider, articles }) => {
      try {
        // Resolve the real contact from the conversation — authoritative, so the
        // ticket carries a proper contactId + a link to the conversation instead
        // of just a free-text name the model typed.
        let contactId: string | undefined
        let resolvedName = contactName
        let resolvedProvider = provider as
          | 'WHATSAPP'
          | 'INSTAGRAM'
          | 'FACEBOOK'
          | 'TIKTOK'
          | undefined
        if (deps.conversationId) {
          const conv = await deps.prisma.conversation.findUnique({
            where: { id: deps.conversationId },
            select: {
              participantId: true,
              participantName: true,
              socialAccount: { select: { provider: true } },
            },
          })
          if (conv) {
            contactId = conv.participantId
            resolvedName = conv.participantName || contactName
            resolvedProvider = conv.socialAccount?.provider ?? resolvedProvider
          }
        }

        const ticketPriority = (priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT') || 'MEDIUM'
        const metadata =
          articles && articles.length > 0 ? { articles } : undefined

        // De-dupe: keep a single open ticket per conversation. The live agent
        // tends to re-create a ticket every turn; if one already exists for this
        // conversation, update it instead of stacking duplicates.
        const existing = deps.conversationId
          ? await deps.prisma.ticket.findFirst({
              where: {
                organisationId: deps.organisationId,
                conversationId: deps.conversationId,
                resolvedAt: null,
              },
              orderBy: { createdAt: 'desc' },
              select: { id: true },
            })
          : null

        if (existing) {
          const ticket = await deps.prisma.ticket.update({
            where: { id: existing.id },
            data: {
              title,
              description,
              priority: ticketPriority,
              contactId,
              contactName: resolvedName,
              provider: resolvedProvider,
              ...(metadata ? { metadata } : {}),
            },
            include: { status: true },
          })
          deps.gateway.emitToOrg(deps.organisationId, 'ticket:updated', ticket)
          return `Demande prise en compte (ticket existant mis a jour, ID: ${ticket.id}).`
        }

        const defaultStatus = await deps.prisma.ticketStatus.findFirst({
          where: { organisationId: deps.organisationId, isDefault: true },
        })

        const ticket = await deps.prisma.ticket.create({
          data: {
            organisationId: deps.organisationId,
            agentId: deps.agentId,
            statusId: defaultStatus?.id,
            title,
            description,
            priority: ticketPriority,
            contactId,
            contactName: resolvedName,
            provider: resolvedProvider,
            conversationId: deps.conversationId,
            metadata,
          },
          include: { status: true },
        })

        deps.gateway.emitToOrg(deps.organisationId, 'ticket:created', ticket)
        return `Demande prise en compte (ticket cree, ID: ${ticket.id}).`
      } catch (error: unknown) {
        return `Erreur lors de la creation du ticket: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    },
    {
      name: 'create_ticket',
      description:
        'Create or update the lead/ticket for THIS conversation (it is de-duplicated automatically — there is at most one open ticket per conversation, so calling it again updates that ticket). The contact is linked automatically from the conversation. Use it when the customer wants to order/book or needs follow-up.',
      schema: z.object({
        title: z
          .string()
          .describe('Short descriptive title for the ticket (e.g. "Commande Robe Wax — Taille M")'),
        description: z.string().optional().describe('Detailed description of the request'),
        priority: z
          .enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
          .optional()
          .describe('Ticket priority. Default: MEDIUM'),
        contactName: z.string().optional().describe('Fallback contact name (the conversation name is used when available)'),
        provider: z
          .enum(['WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'TIKTOK'])
          .optional()
          .describe('Social platform of the conversation'),
        articles: z
          .array(z.string())
          .optional()
          .describe('Names or ids of the product(s)/article(s) the customer chose, e.g. ["Studio cosy"]'),
      }),
    },
  )

  const updateTicket = tool(
    async ({ ticketId, title, description, priority, statusId }) => {
      try {
        const updateData: Record<string, unknown> = {}
        if (title) updateData.title = title
        if (description) updateData.description = description
        if (priority) updateData.priority = priority
        if (statusId) {
          // The model sometimes invents a statusId (e.g. it reuses the ticket id).
          // Apply it only when it is a real status of this org — otherwise ignore
          // it, so the DB never throws a foreign-key error that the model would
          // retry until it exhausts its tool-call budget (recursion-limit crash).
          const validStatus = await deps.prisma.ticketStatus.findFirst({
            where: { id: statusId, organisationId: deps.organisationId },
            select: { id: true },
          })
          if (validStatus) updateData.statusId = statusId
        }

        if (Object.keys(updateData).length === 0) {
          return 'Aucune modification valide a appliquer.'
        }

        const ticket = await deps.prisma.ticket.update({
          where: { id: ticketId },
          data: updateData,
          include: { status: true, organisation: { select: { id: true } } },
        })

        deps.gateway.emitToOrg(ticket.organisationId, 'ticket:updated', ticket)
        return `Ticket mis a jour. ID: ${ticket.id}, Titre: "${ticket.title}"`
      } catch (error: unknown) {
        return `Erreur lors de la mise a jour du ticket: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    },
    {
      name: 'update_ticket',
      description:
        'Update an existing ticket. You can change the title, description, priority, or status.',
      schema: z.object({
        ticketId: z.string().describe('The ID of the ticket to update'),
        title: z.string().optional().describe('New title'),
        description: z.string().optional().describe('New description'),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional().describe('New priority'),
        statusId: z.string().optional().describe('New status ID'),
      }),
    },
  )

  const listTickets = tool(
    async ({ contactConversationOnly, search }) => {
      try {
        const where: Record<string, unknown> = { organisationId: deps.organisationId }

        // If in conversation context and requested, filter by conversation
        if (contactConversationOnly && deps.conversationId) {
          where.conversationId = deps.conversationId
        }

        if (search) {
          where.OR = [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { contactName: { contains: search, mode: 'insensitive' } },
          ]
        }

        const tickets = await deps.prisma.ticket.findMany({
          where,
          include: { status: true },
          orderBy: { createdAt: 'desc' },
          take: 15,
        })

        if (tickets.length === 0) return 'Aucun ticket trouve.'

        const lines = tickets.map(
          (t) =>
            `ID: ${t.id} | ${t.title} | Priorite: ${t.priority} | Statut: ${t.status?.name || 'N/A'} | Contact: ${t.contactName || 'N/A'} | Cree le: ${t.createdAt.toISOString().split('T')[0]}`,
        )
        return lines.join('\n')
      } catch (error: unknown) {
        return `Erreur lors de la recuperation des tickets: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    },
    {
      name: 'list_tickets',
      description:
        "List tickets. When handling a customer conversation, set contactConversationOnly=true to see only that contact's tickets. In admin context, list all tickets.",
      schema: z.object({
        contactConversationOnly: z
          .boolean()
          .optional()
          .describe('If true, only show tickets from the current conversation'),
        search: z.string().optional().describe('Search by title, description or contact name'),
      }),
    },
  )

  return [createTicket, updateTicket, listTickets]
}
