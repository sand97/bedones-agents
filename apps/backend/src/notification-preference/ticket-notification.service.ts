import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { PrismaService } from '../prisma/prisma.service'
import { WhatsappOptinService } from '../whatsapp-optin/whatsapp-optin.service'
import { CatalogService } from '../catalog/catalog.service'

/** Emitted on the ticket create path and on the agent's ticket-update path. */
export interface TicketNotifyEvent {
  ticketId: string
  type: 'MESSAGE_TICKET_CREATED'
  /** True when the agent updated an existing ticket (vs. created a new one). */
  updated?: boolean
}

/** Emitted when a ticket moves into a (different) status. */
export interface TicketStatusChangedEvent {
  ticketId: string
  statusId: string
}

type LoadedTicket = {
  id: string
  organisationId: string
  socialAccountId: string | null
  title: string
  contactName: string | null
  metadata: unknown
  socialAccount: { catalogs: { catalog: { providerId: string | null } }[] } | null
}

/**
 * Sends a WhatsApp notification (via the CORE number, opt-in window permitting)
 * to the org members who asked to be notified — restricted to the product
 * collections each member selected. Two flavours:
 *  - "ticket created": default-ON, stored in NotificationPreference
 *    (MESSAGE_TICKET_CREATED).
 *  - "status changed": opt-IN per ticket status, stored in
 *    TicketStatusNotification — members define a notification for any of the
 *    statuses they manage (e.g. a "closed" status they created).
 */
@Injectable()
export class TicketNotificationService {
  private readonly logger = new Logger(TicketNotificationService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly optin: WhatsappOptinService,
    private readonly catalog: CatalogService,
  ) {}

  @OnEvent('ticket.notify')
  handleTicketNotify(payload: TicketNotifyEvent): void {
    void this.runCreated(payload.ticketId, payload.updated ?? false).catch((err) =>
      this.logFailure(payload.updated ? 'agent-updated' : 'created', payload.ticketId, err),
    )
  }

  @OnEvent('ticket.status-changed')
  handleStatusChanged(payload: TicketStatusChangedEvent): void {
    void this.runStatusChanged(payload.ticketId, payload.statusId).catch((err) =>
      this.logFailure(`status:${payload.statusId}`, payload.ticketId, err),
    )
  }

  private logFailure(kind: string, ticketId: string, err: unknown): void {
    this.logger.error(
      `[TicketNotif] ${kind} for ${ticketId} failed: ${err instanceof Error ? err.message : err}`,
    )
  }

  // ─── "Ticket created or updated by the agent" — opt-in (NotificationPreference) ───

  private async runCreated(ticketId: string, updated: boolean): Promise<void> {
    const ticket = await this.loadTicket(ticketId)
    // Preferences are scoped per social account; without one we can't route.
    if (!ticket?.socialAccountId) return

    const ticketCollections = await this.resolveTicketCollections(ticket)
    const recipients = await this.createdRecipients(
      ticket.organisationId,
      ticket.socialAccountId,
      ticketCollections,
    )
    if (recipients.length === 0) return

    const who = ticket.contactName ? ` — ${ticket.contactName}` : ''
    const text = updated
      ? `✏️ Ticket mis à jour par l'agent : ${ticket.title}${who}`
      : `🎫 Nouveau ticket : ${ticket.title}${who}`
    await this.dispatch(
      recipients,
      ticket.organisationId,
      text,
      updated ? 'agent-updated' : 'created',
      ticketId,
      ticketCollections.length,
    )
  }

  // ─── "Status changed" — opt-in (TicketStatusNotification) ───

  private async runStatusChanged(ticketId: string, statusId: string): Promise<void> {
    const ticket = await this.loadTicket(ticketId)
    if (!ticket?.socialAccountId) return

    const status = await this.prisma.ticketStatus.findUnique({
      where: { id: statusId },
      select: { name: true },
    })
    if (!status) return

    const ticketCollections = await this.resolveTicketCollections(ticket)
    const recipients = await this.statusRecipients(
      ticket.organisationId,
      ticket.socialAccountId,
      statusId,
      ticketCollections,
    )
    if (recipients.length === 0) return

    const who = ticket.contactName ? ` (${ticket.contactName})` : ''
    await this.dispatch(
      recipients,
      ticket.organisationId,
      `🔔 Ticket « ${ticket.title} » → ${status.name}${who}`,
      `status:${status.name}`,
      ticketId,
      ticketCollections.length,
    )
  }

  // ─── Shared helpers ───

  private loadTicket(ticketId: string): Promise<LoadedTicket | null> {
    return this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        organisationId: true,
        socialAccountId: true,
        title: true,
        contactName: true,
        metadata: true,
        socialAccount: {
          select: { catalogs: { select: { catalog: { select: { providerId: true } } } } },
        },
      },
    })
  }

  private async dispatch(
    recipients: string[],
    organisationId: string,
    text: string,
    kind: string,
    ticketId: string,
    collectionsCount: number,
  ): Promise<void> {
    let sent = 0
    for (const userId of recipients) {
      if (await this.optin.dispatchNotification(userId, organisationId, text)) sent++
    }
    this.logger.log(
      `[TicketNotif] ${kind} ${ticketId}: ${sent}/${recipients.length} delivered (collections=${collectionsCount})`,
    )
  }

  /** Collections (Meta product_set ids) the ticket's frozen articles belong to. */
  private async resolveTicketCollections(ticket: {
    metadata: unknown
    socialAccount: { catalogs: { catalog: { providerId: string | null } }[] } | null
  }): Promise<string[]> {
    const meta = (ticket.metadata ?? null) as { articles?: Array<{ id?: string }> } | null
    const retailerIds = Array.isArray(meta?.articles)
      ? meta.articles.map((a) => a?.id).filter((x): x is string => typeof x === 'string')
      : []
    if (retailerIds.length === 0) return []
    const providerId = ticket.socialAccount?.catalogs?.[0]?.catalog?.providerId
    if (!providerId) return []
    return this.catalog.collectionIdsForRetailerIds(providerId, retailerIds)
  }

  /**
   * "Ticket created" recipients: opt-IN — only active members with a phone who
   * explicitly enabled MESSAGE_TICKET_CREATED for the account are notified
   * (every notification is off by default), gated by the collection filter: an
   * empty filter means "all collections", otherwise it must intersect the
   * ticket's collections.
   */
  private async createdRecipients(
    organisationId: string,
    socialAccountId: string,
    ticketCollections: string[],
  ): Promise<string[]> {
    const members = await this.prisma.organisationMember.findMany({
      where: { organisationId, status: 'ACTIVE', user: { phone: { not: null } } },
      select: { userId: true },
    })
    if (members.length === 0) return []

    const prefs = await this.prisma.notificationPreference.findMany({
      where: {
        userId: { in: members.map((m) => m.userId) },
        socialAccountId,
        type: 'MESSAGE_TICKET_CREATED',
        enabled: true,
      },
      select: { userId: true, collectionIds: true },
    })

    const out: string[] = []
    for (const p of prefs) {
      if (this.collectionsMatch(p.collectionIds ?? [], ticketCollections)) out.push(p.userId)
    }
    return out
  }

  /**
   * "Status changed" recipients: opt-IN — only members with an *enabled*
   * TicketStatusNotification row for this (account, status) are notified, again
   * gated by the collection filter.
   */
  private async statusRecipients(
    organisationId: string,
    socialAccountId: string,
    ticketStatusId: string,
    ticketCollections: string[],
  ): Promise<string[]> {
    const members = await this.prisma.organisationMember.findMany({
      where: { organisationId, status: 'ACTIVE', user: { phone: { not: null } } },
      select: { userId: true },
    })
    if (members.length === 0) return []

    const subs = await this.prisma.ticketStatusNotification.findMany({
      where: {
        userId: { in: members.map((m) => m.userId) },
        socialAccountId,
        ticketStatusId,
        enabled: true,
      },
      select: { userId: true, collectionIds: true },
    })

    const out: string[] = []
    for (const s of subs) {
      if (this.collectionsMatch(s.collectionIds ?? [], ticketCollections)) out.push(s.userId)
    }
    return out
  }

  /** Empty filter = all collections; otherwise it must intersect the ticket's. */
  private collectionsMatch(filter: string[], ticketCollections: string[]): boolean {
    return filter.length === 0 || ticketCollections.some((c) => filter.includes(c))
  }
}
