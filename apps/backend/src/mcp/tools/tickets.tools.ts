import { Injectable, NotFoundException } from '@nestjs/common'
import { Tool } from '@rekog/mcp-nest'
import { z } from 'zod'
import { PrismaService } from '../../prisma/prisma.service'
import { mcpContext } from '../mcp-context'
import { READ_ONLY, WRITE_INTERNAL, withTitle } from './annotations'
import { createTicketSchema, listTicketsSchema, updateTicketStatusSchema } from './tool-schemas'

@Injectable()
export class McpTicketTools {
  constructor(private readonly prisma: PrismaService) {}

  @Tool({
    name: 'create_ticket',
    annotations: withTitle('Créer un ticket', WRITE_INTERNAL),
    description:
      'Créer un ticket de suivi pour une demande client (lié optionnellement à une conversation).',
    parameters: createTicketSchema,
  })
  async create(args: z.infer<typeof createTicketSchema>, _c: unknown, request: unknown) {
    const ctx = mcpContext(request)
    const defaultStatus = await this.prisma.ticketStatus.findFirst({
      where: { organisationId: ctx.organisationId, isDefault: true },
    })
    const ticket = await this.prisma.ticket.create({
      data: {
        organisationId: ctx.organisationId,
        statusId: defaultStatus?.id,
        title: args.title,
        description: args.description,
        priority: args.priority || 'MEDIUM',
        contactName: args.contactName,
        contactId: args.contactId,
        provider: args.provider,
        conversationId: args.conversationId,
      },
    })
    return { ticketId: ticket.id, title: ticket.title, status: defaultStatus?.name ?? null }
  }

  @Tool({
    name: 'list_tickets',
    annotations: withTitle('Lister les tickets', READ_ONLY),
    description: "Lister les tickets de l'organisation (filtrable par statut et priorité).",
    parameters: listTicketsSchema,
  })
  async list(args: z.infer<typeof listTicketsSchema>, _c: unknown, request: unknown) {
    const ctx = mcpContext(request)
    const tickets = await this.prisma.ticket.findMany({
      where: {
        organisationId: ctx.organisationId,
        statusId: args.statusId || undefined,
        priority: args.priority || undefined,
      },
      include: { status: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: args.limit || 20,
    })
    return tickets.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      status: t.status?.name ?? null,
      statusId: t.statusId,
      contactName: t.contactName,
      provider: t.provider,
      createdAt: t.createdAt,
    }))
  }

  @Tool({
    name: 'update_ticket_status',
    annotations: withTitle("Changer le statut d'un ticket", WRITE_INTERNAL),
    description: "Changer le statut d'un ticket.",
    parameters: updateTicketStatusSchema,
  })
  async updateStatus(
    args: z.infer<typeof updateTicketStatusSchema>,
    _c: unknown,
    request: unknown,
  ) {
    const ctx = mcpContext(request)
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: args.ticketId, organisationId: ctx.organisationId },
    })
    if (!ticket) throw new NotFoundException('Ticket introuvable')
    const status = await this.prisma.ticketStatus.findFirst({
      where: { id: args.statusId, organisationId: ctx.organisationId },
    })
    if (!status) throw new NotFoundException('Statut introuvable')
    const updated = await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: { statusId: status.id },
    })
    return { ticketId: updated.id, status: status.name }
  }
}
