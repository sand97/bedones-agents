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
    async ({ title, description, priority, contactName, provider }) => {
      try {
        // Find default status for this organisation
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
            priority: (priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT') || 'MEDIUM',
            contactName,
            provider: provider as 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK' | undefined,
            conversationId: deps.conversationId,
          },
          include: { status: true },
        })

        deps.gateway.emitToOrg(deps.organisationId, 'ticket:created', ticket)
        return `Ticket cree avec succes. ID: ${ticket.id}, Titre: "${ticket.title}", Statut: ${ticket.status?.name || 'Par defaut'}`
      } catch (error: any) {
        return `Erreur lors de la creation du ticket: ${error.message}`
      }
    },
    {
      name: 'create_ticket',
      description:
        'Create a support ticket (lead) to track a customer request, order, or inquiry. Use this when a customer shows interest in a product, wants to place an order, or needs follow-up.',
      schema: z.object({
        title: z
          .string()
          .describe('Short descriptive title for the ticket (e.g. "Commande Robe Wax — Taille M")'),
        description: z.string().optional().describe('Detailed description of the request'),
        priority: z
          .enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
          .optional()
          .describe('Ticket priority. Default: MEDIUM'),
        contactName: z.string().optional().describe('Name of the contact/customer'),
        provider: z
          .enum(['WHATSAPP', 'INSTAGRAM', 'FACEBOOK'])
          .optional()
          .describe('Social platform of the conversation'),
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
        if (statusId) updateData.statusId = statusId

        const ticket = await deps.prisma.ticket.update({
          where: { id: ticketId },
          data: updateData,
          include: { status: true, organisation: { select: { id: true } } },
        })

        deps.gateway.emitToOrg(ticket.organisationId, 'ticket:updated', ticket)
        return `Ticket mis a jour. ID: ${ticket.id}, Titre: "${ticket.title}"`
      } catch (error: any) {
        return `Erreur lors de la mise a jour du ticket: ${error.message}`
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
      } catch (error: any) {
        return `Erreur lors de la recuperation des tickets: ${error.message}`
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

  const getTicketStatuses = tool(
    async () => {
      try {
        const statuses = await deps.prisma.ticketStatus.findMany({
          where: { organisationId: deps.organisationId },
          orderBy: { order: 'asc' },
        })
        if (statuses.length === 0) return 'Aucun statut de ticket configure.'
        return statuses
          .map((s) => `ID: ${s.id} | ${s.name} ${s.isDefault ? '(par defaut)' : ''}`)
          .join('\n')
      } catch (error: any) {
        return `Erreur: ${error.message}`
      }
    },
    {
      name: 'get_ticket_statuses',
      description: 'Get the list of available ticket statuses for this agent.',
      schema: z.object({}),
    },
  )

  return [createTicket, updateTicket, listTickets, getTicketStatuses]
}
