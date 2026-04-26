import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { OnEvent } from '@nestjs/event-emitter'
import { Queue } from 'bullmq'
import { PrismaService } from '../prisma/prisma.service'
import { WHATSAPP_OPTIN_QUEUE } from '../queue/queue.module'
import { FACEBOOK_GRAPH_API_VERSION } from '../common/config/facebook-scopes.config'
import {
  OPTIN_WINDOW_MS,
  hourInTz,
  optinConfig,
  type SendTemplateJobData,
} from './whatsapp-optin.config'

/** Strip everything but digits — Meta sends `wa_id` without a leading `+`. */
function normalizePhone(input: string): string {
  return input.replace(/\D+/g, '')
}

const SUPPORTED_LANGS = new Set(['fr', 'en'])
function pickLang(locale: string | null | undefined): 'fr' | 'en' {
  const short = (locale ?? 'fr').slice(0, 2).toLowerCase()
  return SUPPORTED_LANGS.has(short) ? (short as 'fr' | 'en') : 'fr'
}

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

const REFUSAL_TOKENS = new Set(['no', 'non'])
function isRefusal(buttonId?: string, buttonTitle?: string): boolean {
  const norm = (s?: string) => (s ?? '').trim().toLowerCase()
  return REFUSAL_TOKENS.has(norm(buttonId)) || REFUSAL_TOKENS.has(norm(buttonTitle))
}

@Injectable()
export class WhatsappOptinService {
  private readonly logger = new Logger(WhatsappOptinService.name)

  constructor(
    private prisma: PrismaService,
    @InjectQueue(WHATSAPP_OPTIN_QUEUE) private queue: Queue,
  ) {}

  // ─── Window lifecycle ────────────────────────────────────────────────

  /** True when the member can receive free-form notifications about this org. */
  async isWindowOpen(userId: string, organisationId: string): Promise<boolean> {
    const w = await this.prisma.whatsAppOptInWindow.findUnique({
      where: { userId_organisationId: { userId, organisationId } },
      select: { expiresAt: true },
    })
    return !!w && w.expiresAt.getTime() > Date.now()
  }

  /**
   * Listens to `whatsapp.core.inbound` from the webhook. Resolves the sender
   * phone to a User, then opens the window for the org tied to the most
   * recently sent template (Meta Quick Reply payloads are static, so we can't
   * encode the orgId in the button — we infer it from the last outbound
   * template). If the user picked the explicit "Non" / "No" Quick Reply we
   * log it as a refusal and skip the refresh.
   */
  @OnEvent('whatsapp.core.inbound')
  async onInboundEvent(payload: { senderPhone: string; buttonId?: string; buttonTitle?: string }) {
    try {
      const refusal = isRefusal(payload.buttonId, payload.buttonTitle)

      const normalized = normalizePhone(payload.senderPhone)
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [{ phone: payload.senderPhone }, { phone: `+${normalized}` }, { phone: normalized }],
        },
        select: { id: true },
      })
      if (!user) return

      if (refusal) {
        this.logger.log(`[WA opt-in] user ${user.id} declined the daily opt-in`)
        return
      }

      // Pick the most recently sent template across this user's org windows.
      const last = await this.prisma.whatsAppOptInWindow.findFirst({
        where: { userId: user.id, lastTemplateSentAt: { not: null } },
        orderBy: { lastTemplateSentAt: 'desc' },
        select: { organisationId: true },
      })
      if (!last) {
        this.logger.warn(
          `[WA opt-in] inbound from user ${user.id} but no recent template — ignoring`,
        )
        return
      }

      await this.recordInbound(user.id, last.organisationId)
      this.logger.log(`[WA opt-in] window opened for user ${user.id} / org ${last.organisationId}`)
    } catch (err) {
      this.logger.error(`[WA opt-in] inbound handler failed: ${(err as Error).message}`)
    }
  }

  /** Refresh the rolling 24-hour window for a (user, org) pair. */
  async recordInbound(userId: string, organisationId: string): Promise<void> {
    const expiresAt = new Date(Date.now() + OPTIN_WINDOW_MS)
    await this.prisma.whatsAppOptInWindow.upsert({
      where: { userId_organisationId: { userId, organisationId } },
      create: { userId, organisationId, expiresAt, lastInboundAt: new Date() },
      update: { expiresAt, lastInboundAt: new Date() },
    })
  }

  // ─── Eligibility per (org, user) ─────────────────────────────────────

  /**
   * For a given organisation, returns the active members with a phone number
   * who have at least one messaging notification type effectively enabled.
   * Default-on types are MESSAGE_TO_READ / MESSAGE_TICKET_CREATED /
   * MESSAGE_TICKET_CLOSED — same default rule as the modal frontend.
   * Overrides are scoped per (user, socialAccount, type), so a user is
   * "eligible for org X" if they have at least one default-on or
   * explicitly-on row tied to any social account of org X.
   */
  async listEligibleUsersForOrg(
    organisationId: string,
  ): Promise<Array<{ userId: string; locale: string; name: string }>> {
    const messageTypes = [
      'MESSAGE_TO_READ',
      'MESSAGE_AI_SUGGESTION',
      'MESSAGE_TICKET_CREATED',
      'MESSAGE_TICKET_CLOSED',
      'MESSAGE_DAILY_SUMMARY',
    ] as const
    const defaultOff = new Set(['MESSAGE_AI_SUGGESTION', 'MESSAGE_DAILY_SUMMARY'])

    const members = await this.prisma.organisationMember.findMany({
      where: {
        organisationId,
        status: 'ACTIVE',
        user: { phone: { not: null } },
      },
      select: { userId: true, user: { select: { name: true, locale: true } } },
    })
    if (members.length === 0) return []

    const overrides = await this.prisma.notificationPreference.findMany({
      where: {
        userId: { in: members.map((m) => m.userId) },
        socialAccount: { organisationId },
        type: { in: messageTypes as unknown as never },
      },
      select: { userId: true, type: true, enabled: true },
    })
    const explicitlyOn = new Set<string>()
    const explicitlyOff = new Map<string, Set<string>>()
    for (const o of overrides) {
      if (o.enabled) explicitlyOn.add(o.userId)
      else {
        const s = explicitlyOff.get(o.userId) ?? new Set()
        s.add(o.type)
        explicitlyOff.set(o.userId, s)
      }
    }

    const out: Array<{ userId: string; locale: string; name: string }> = []
    for (const m of members) {
      let eligible: boolean
      if (explicitlyOn.has(m.userId)) {
        eligible = true
      } else {
        const off = explicitlyOff.get(m.userId) ?? new Set<string>()
        eligible = messageTypes.some((t) => !defaultOff.has(t) && !off.has(t))
      }
      if (eligible) {
        out.push({ userId: m.userId, locale: m.user.locale, name: m.user.name })
      }
    }
    return out
  }

  // ─── Hourly cron (BullMQ repeatable) ─────────────────────────────────

  async ensureHourlyCron(): Promise<void> {
    const { tickCron } = optinConfig()

    const existing = await this.queue.getRepeatableJobs()
    for (const j of existing) {
      // Drop both the legacy 'tick-daily' and any stale 'tick-hourly' so a
      // changed cron expression takes effect on next boot.
      if (j.name === 'tick-hourly' || j.name === 'tick-daily') {
        await this.queue.removeRepeatableByKey(j.key)
      }
    }

    await this.queue.add(
      'tick-hourly',
      {},
      {
        repeat: { pattern: tickCron },
        jobId: 'whatsapp-optin:tick-hourly',
        removeOnComplete: true,
        removeOnFail: 100,
      },
    )
  }

  /** Walks every organisation, picks the ones whose local time hit the
   * configured hour, and enqueues per-(user, org) `send-template` jobs for
   * eligible members whose window for that org is closed. */
  async tickHourly(): Promise<{ enqueued: number }> {
    const { localHour } = optinConfig()
    const orgs = await this.prisma.organisation.findMany({
      select: { id: true, timezone: true },
    })

    let enqueued = 0
    for (const org of orgs) {
      if (hourInTz(org.timezone) !== localHour) continue
      const users = await this.listEligibleUsersForOrg(org.id)
      for (const u of users) {
        if (await this.isWindowOpen(u.userId, org.id)) continue
        const data: SendTemplateJobData = { userId: u.userId, organisationId: org.id }
        await this.queue.add('send-template', data, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: true,
          removeOnFail: 200,
        })
        enqueued++
      }
    }
    if (enqueued > 0) this.logger.log(`[WA opt-in] hourly tick enqueued ${enqueued} jobs`)
    return { enqueued }
  }

  // ─── Send template via CORE number ───────────────────────────────────

  async sendOptInTemplate(userId: string, organisationId: string): Promise<void> {
    const cfg = optinConfig()
    if (!cfg.corePhoneNumberId || !cfg.coreAccessToken) {
      this.logger.warn('[WA opt-in] CORE_WHATSAPP_NUMBER_ID/META_SYSTEM_USER not set; skipping')
      return
    }

    const [user, org] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { phone: true, name: true, locale: true },
      }),
      this.prisma.organisation.findUnique({
        where: { id: organisationId },
        select: { name: true },
      }),
    ])
    if (!user?.phone) throw new NotFoundException('User has no phone number')
    if (!org) throw new NotFoundException('Organisation not found')

    const lang = pickLang(user.locale)
    const url = `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${cfg.corePhoneNumberId}/messages`
    const body = {
      messaging_product: 'whatsapp',
      to: user.phone.replace('+', ''),
      type: 'template',
      template: {
        name: cfg.templateName,
        language: { code: lang },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: firstNameOf(user.name) },
              { type: 'text', text: org.name },
            ],
          },
        ],
      },
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.coreAccessToken}`,
      },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      this.logger.error(
        `[WA opt-in] template send failed (${res.status}) user=${userId} org=${organisationId}: ${JSON.stringify(json)}`,
      )
      throw new Error(`Template send failed: ${res.status}`)
    }

    await this.prisma.whatsAppOptInWindow.upsert({
      where: { userId_organisationId: { userId, organisationId } },
      create: {
        userId,
        organisationId,
        expiresAt: new Date(0), // template alone doesn't open the window
        lastTemplateSentAt: new Date(),
      },
      update: { lastTemplateSentAt: new Date() },
    })

    this.logger.log(`[WA opt-in] template sent to ${userId} (org ${organisationId}, ${lang})`)
  }

  // ─── Notification dispatch ───────────────────────────────────────────

  /**
   * Send a free-form WhatsApp text from the CORE number, but only if the
   * (user, org) window is open. Returns true on send, false otherwise.
   */
  async dispatchNotification(
    userId: string,
    organisationId: string,
    text: string,
  ): Promise<boolean> {
    if (!(await this.isWindowOpen(userId, organisationId))) return false

    const cfg = optinConfig()
    if (!cfg.corePhoneNumberId || !cfg.coreAccessToken) return false

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    })
    if (!user?.phone) return false

    const url = `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${cfg.corePhoneNumberId}/messages`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.coreAccessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: user.phone.replace('+', ''),
        type: 'text',
        text: { body: text },
      }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      this.logger.error(
        `[WA opt-in] notif send failed (${res.status}) user=${userId} org=${organisationId}: ${JSON.stringify(json)}`,
      )
      return false
    }
    return true
  }
}
