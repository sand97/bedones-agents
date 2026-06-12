import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { PrismaService } from '../prisma/prisma.service'
import { WhatsappOptinService } from '../whatsapp-optin/whatsapp-optin.service'
import { CatalogService } from '../catalog/catalog.service'

type TicketNotifType = 'MESSAGE_TICKET_CREATED' | 'MESSAGE_TICKET_CLOSED'

/** Event payload emitted by the ticket create/close paths. */
export interface TicketNotifyEvent {
  ticketId: string
  type: TicketNotifType
}

/**
 * Sends a WhatsApp notification (via the CORE number, opt-in window permitting)
 * to the org members who asked to be notified when a ticket is created or
 * closed — restricted to the product collections each member selected.
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
    this.notify(payload.ticketId, payload.type)
  }

  /** Fire-and-forget — callers should not await this on the request path. */
  notify(ticketId: string, type: TicketNotifType): void {
    void this.run(ticketId, type).catch((err) =>
      this.logger.error(
        `[TicketNotif] ${type} for ${ticketId} failed: ${err instanceof Error ? err.message : err}`,
      ),
    )
  }

  private async run(ticketId: string, type: TicketNotifType): Promise<void> {
    const ticket = await this.prisma.ticket.findUnique({
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
    // Preferences are scoped per social account; without one we can't route.
    if (!ticket?.socialAccountId) return

    const ticketCollections = await this.resolveTicketCollections(ticket)
    const recipients = await this.eligibleUserIds(
      ticket.organisationId,
      ticket.socialAccountId,
      type,
      ticketCollections,
    )
    if (recipients.length === 0) return

    const text = this.buildText(type, ticket.title, ticket.contactName)
    let sent = 0
    for (const userId of recipients) {
      if (await this.optin.dispatchNotification(userId, ticket.organisationId, text)) sent++
    }
    this.logger.log(
      `[TicketNotif] ${type} ${ticketId}: ${sent}/${recipients.length} delivered (collections=${ticketCollections.length})`,
    )
  }

  private buildText(type: TicketNotifType, title: string, contact: string | null): string {
    const who = contact ? ` — ${contact}` : ''
    return type === 'MESSAGE_TICKET_CREATED'
      ? `🎫 Nouveau ticket : ${title}${who}`
      : `✅ Ticket clôturé : ${title}${who}`
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
   * Active members with a phone who have this ticket type enabled for the
   * account (TICKET types are default-on) and whose collection filter matches:
   * an empty filter means "all collections", otherwise it must intersect the
   * ticket's collections.
   */
  private async eligibleUserIds(
    organisationId: string,
    socialAccountId: string,
    type: TicketNotifType,
    ticketCollections: string[],
  ): Promise<string[]> {
    const members = await this.prisma.organisationMember.findMany({
      where: { organisationId, status: 'ACTIVE', user: { phone: { not: null } } },
      select: { userId: true },
    })
    if (members.length === 0) return []

    const prefs = await this.prisma.notificationPreference.findMany({
      where: { userId: { in: members.map((m) => m.userId) }, socialAccountId, type },
      select: { userId: true, enabled: true, collectionIds: true },
    })
    const prefByUser = new Map(prefs.map((p) => [p.userId, p]))

    const out: string[] = []
    for (const m of members) {
      const pref = prefByUser.get(m.userId)
      // TICKET types are default-ON when there is no explicit row.
      if (pref && !pref.enabled) continue
      const filter = pref?.collectionIds ?? []
      if (filter.length === 0 || ticketCollections.some((c) => filter.includes(c))) {
        out.push(m.userId)
      }
    }
    return out
  }
}
