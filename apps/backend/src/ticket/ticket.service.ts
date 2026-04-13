import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { EventsGateway } from '../gateway/events.gateway'

@Injectable()
export class TicketService {
  constructor(
    private prisma: PrismaService,
    private gateway: EventsGateway,
  ) {}

  async findAllByOrg(
    organisationId: string,
    params?: {
      statusId?: string
      agentId?: string
      priority?: string
      search?: string
      page?: number
      pageSize?: number
    },
  ) {
    const { statusId, agentId, priority, search, page = 1, pageSize = 20 } = params || {}

    const where: Record<string, unknown> = { organisationId }
    if (statusId) where.statusId = statusId
    if (agentId) where.agentId = agentId
    if (priority) where.priority = priority
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [tickets, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        include: {
          status: true,
          agent: { select: { id: true, name: true } },
          activities: { orderBy: { createdAt: 'desc' } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.ticket.count({ where }),
    ])

    return { tickets, total, page, pageSize }
  }

  async findById(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        status: true,
        agent: { select: { id: true, name: true } },
        activities: { orderBy: { createdAt: 'desc' } },
      },
    })
    if (!ticket) throw new NotFoundException('Ticket introuvable')
    return ticket
  }

  async create(
    data: {
      organisationId: string
      agentId?: string
      title: string
      description?: string
      statusId?: string
      priority?: string
      contactName?: string
      contactId?: string
      provider?: string
      conversationId?: string
      assignedTo?: string
      metadata?: Record<string, unknown>
    },
    user?: { id: string; name: string },
  ) {
    // If no statusId provided, find the default for this organisation
    let statusId = data.statusId
    if (!statusId && data.organisationId) {
      const defaultStatus = await this.prisma.ticketStatus.findFirst({
        where: { organisationId: data.organisationId, isDefault: true },
      })
      statusId = defaultStatus?.id
    }

    const ticket = await this.prisma.ticket.create({
      data: {
        organisationId: data.organisationId,
        agentId: data.agentId,
        statusId,
        title: data.title,
        description: data.description,
        priority: (data.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT') || 'MEDIUM',
        contactName: data.contactName,
        contactId: data.contactId,
        provider: data.provider as 'FACEBOOK' | 'INSTAGRAM' | 'WHATSAPP' | 'TIKTOK' | undefined,
        conversationId: data.conversationId,
        assignedTo: data.assignedTo,
        metadata: (data.metadata as Record<string, unknown> & object) || undefined,
        activities: {
          create: {
            type: 'created',
            author: user?.name || data.contactName || 'System',
          },
        },
      },
      include: { status: true, activities: true },
    })

    this.gateway.emitToOrg(data.organisationId, 'ticket:created', ticket)
    return ticket
  }

  async update(
    id: string,
    data: {
      title?: string
      description?: string
      statusId?: string
      priority?: string
      assignedTo?: string
      metadata?: Record<string, unknown>
    },
    user?: { id: string; name: string },
  ) {
    // Fetch current ticket to detect changes for activity log
    const current = await this.prisma.ticket.findUnique({
      where: { id },
      include: { status: true },
    })
    if (!current) throw new NotFoundException('Ticket introuvable')

    const ticket = await this.prisma.ticket.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        statusId: data.statusId,
        priority: data.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | undefined,
        assignedTo: data.assignedTo,
        metadata: (data.metadata as Record<string, unknown> & object) || undefined,
      },
      include: {
        status: true,
        activities: { orderBy: { createdAt: 'desc' } },
        organisation: { select: { id: true } },
      },
    })

    // Create activity for status change
    if (data.statusId && data.statusId !== current.statusId) {
      const newStatus = ticket.status
      await this.prisma.ticketActivity.create({
        data: {
          ticketId: id,
          type: 'status_change',
          author: user?.name || 'System',
          fromStatus: current.status?.name || 'N/A',
          toStatus: newStatus?.name || 'N/A',
        },
      })
    }

    // Create activity for description change
    if (data.description !== undefined && data.description !== current.description) {
      await this.prisma.ticketActivity.create({
        data: {
          ticketId: id,
          type: 'description_change',
          author: user?.name || 'System',
          diff: {
            field: 'description',
            before: current.description || '',
            after: data.description || '',
          },
        },
      })
    }

    this.gateway.emitToOrg(ticket.organisationId, 'ticket:updated', ticket)
    return ticket
  }

  async remove(id: string) {
    const ticket = await this.prisma.ticket.delete({
      where: { id },
      select: { id: true, organisationId: true },
    })
    this.gateway.emitToOrg(ticket.organisationId, 'ticket:removed', { id })
    return ticket
  }

  // ─── Ticket Statuses ───

  async getStatuses(organisationId: string) {
    return this.prisma.ticketStatus.findMany({
      where: { organisationId },
      orderBy: { order: 'asc' },
    })
  }

  async updateStatuses(
    organisationId: string,
    statuses: Array<{
      id?: string
      name: string
      color: string
      order: number
      isDefault: boolean
    }>,
  ) {
    // Delete existing and recreate
    await this.prisma.ticketStatus.deleteMany({ where: { organisationId } })

    return this.prisma.ticketStatus.createMany({
      data: statuses.map((s) => ({
        organisationId,
        name: s.name,
        color: s.color,
        order: s.order,
        isDefault: s.isDefault,
      })),
    })
  }

  async getStats(organisationId: string) {
    const [total, byPriority, byStatus] = await Promise.all([
      this.prisma.ticket.count({ where: { organisationId } }),
      this.prisma.ticket.groupBy({
        by: ['priority'],
        where: { organisationId },
        _count: true,
      }),
      this.prisma.ticket.groupBy({
        by: ['statusId'],
        where: { organisationId },
        _count: true,
      }),
    ])

    return {
      total,
      byPriority: byPriority.map((p) => ({ priority: p.priority, count: p._count })),
      byStatus: byStatus.map((s) => ({ statusId: s.statusId, count: s._count })),
    }
  }
}
