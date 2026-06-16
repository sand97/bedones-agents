import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { OnEvent } from '@nestjs/event-emitter'
import { Queue } from 'bullmq'
import { PrismaService } from '../prisma/prisma.service'
import { PostHogService } from '../posthog/posthog.service'
import { WHATSAPP_OPTIN_QUEUE } from '../queue/queue.module'
import { FACEBOOK_GRAPH_API_VERSION } from '../common/config/facebook-scopes.config'
import {
  OPTIN_WINDOW_MS,
  hourInTz,
  optinConfig,
  type OptinTrigger,
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
    private readonly posthog: PostHogService,
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
      const user = await this.findUserByPhone(payload.senderPhone)
      if (!user) return

      const isButtonReply = !!(payload.buttonId || payload.buttonTitle)

      // A plain (non-button) message is NOT a consent answer. It only re-enters
      // the loop: if the member's last opt-in reply is stale we re-ask. The
      // rolling 24h window is opened *only* by an explicit opt-in button tap.
      if (!isButtonReply) {
        await this.maybeReask(user.id)
        return
      }

      // The opt-in template was answered. Quick Reply payloads are static, so we
      // attribute the answer to the org of the most recently sent template.
      const last = await this.prisma.whatsAppOptInWindow.findFirst({
        where: { userId: user.id, lastTemplateSentAt: { not: null } },
        orderBy: { lastTemplateSentAt: 'desc' },
        select: { organisationId: true },
      })

      if (isRefusal(payload.buttonId, payload.buttonTitle)) {
        this.logger.log(`[WA opt-in] user ${user.id} declined the opt-in`)
        this.posthog.capture({
          distinctId: user.id,
          event: 'whatsapp_optin_declined',
          properties: { organisationId: last?.organisationId ?? null },
          groups: last ? { organisation: last.organisationId } : undefined,
        })
        return
      }

      if (!last) {
        this.logger.warn(
          `[WA opt-in] opt-in reply from user ${user.id} but no recent template — ignoring`,
        )
        return
      }

      // Record the reply date (lastInboundAt) and open the rolling 24h window.
      await this.recordInbound(user.id, last.organisationId)
      this.logger.log(`[WA opt-in] window opened for user ${user.id} / org ${last.organisationId}`)
      this.posthog.capture({
        distinctId: user.id,
        event: 'whatsapp_optin_accepted',
        properties: { organisationId: last.organisationId },
        groups: { organisation: last.organisationId },
      })
    } catch (err) {
      this.logger.error(`[WA opt-in] inbound handler failed: ${(err as Error).message}`)
    }
  }

  private findUserByPhone(senderPhone: string): Promise<{ id: string } | null> {
    const normalized = normalizePhone(senderPhone)
    return this.prisma.user.findFirst({
      where: {
        OR: [{ phone: senderPhone }, { phone: `+${normalized}` }, { phone: normalized }],
      },
      select: { id: true },
    })
  }

  /**
   * Re-entry into the opt-in loop from an inbound message. For each org the
   * member is still eligible for, if their last opt-in reply (lastInboundAt) is
   * older than `reaskHours` — and we haven't just asked (lastTemplateSentAt
   * cooldown) — we re-send the opt-in template so they can refresh their 24h
   * window without going through the dashboard.
   */
  private async maybeReask(userId: string): Promise<void> {
    const { reaskHours } = optinConfig()
    const thresholdMs = reaskHours * 60 * 60 * 1000
    const now = Date.now()

    const orgIds = await this.eligibleOrgIdsForUser(userId)
    for (const organisationId of orgIds) {
      const w = await this.prisma.whatsAppOptInWindow.findUnique({
        where: { userId_organisationId: { userId, organisationId } },
        select: { lastInboundAt: true, lastTemplateSentAt: true },
      })
      const consentStale = !w?.lastInboundAt || now - w.lastInboundAt.getTime() > thresholdMs
      const askedRecently =
        !!w?.lastTemplateSentAt && now - w.lastTemplateSentAt.getTime() < thresholdMs
      if (!consentStale || askedRecently) continue

      const hoursSinceConsent = w?.lastInboundAt
        ? Math.round((now - w.lastInboundAt.getTime()) / 3_600_000)
        : null
      this.logger.log(`[WA opt-in] re-ask for user ${userId} / org ${organisationId}`)
      this.posthog.capture({
        distinctId: userId,
        event: 'whatsapp_optin_reask_triggered',
        properties: { organisationId, hoursSinceConsent },
        groups: { organisation: organisationId },
      })
      await this.requestOptIn(userId, organisationId, 'reask')
    }
  }

  /** Orgs where the member is active, has a phone, and enabled ≥1 notification. */
  private async eligibleOrgIdsForUser(userId: string): Promise<string[]> {
    const memberships = await this.prisma.organisationMember.findMany({
      where: { userId, status: 'ACTIVE', user: { phone: { not: null } } },
      select: { organisationId: true },
    })
    if (memberships.length === 0) return []
    const memberOrgIds = memberships.map((m) => m.organisationId)

    const [prefs, subs] = await Promise.all([
      this.prisma.notificationPreference.findMany({
        where: { userId, enabled: true, socialAccount: { organisationId: { in: memberOrgIds } } },
        select: { socialAccount: { select: { organisationId: true } } },
      }),
      this.prisma.ticketStatusNotification.findMany({
        where: { userId, enabled: true, socialAccount: { organisationId: { in: memberOrgIds } } },
        select: { socialAccount: { select: { organisationId: true } } },
      }),
    ])

    const set = new Set<string>()
    for (const p of prefs) if (p.socialAccount) set.add(p.socialAccount.organisationId)
    for (const s of subs) if (s.socialAccount) set.add(s.socialAccount.organisationId)
    return [...set]
  }

  /**
   * Enqueue an opt-in template send (retried by BullMQ). Used when a member
   * enables a notification from the dashboard and for the inbound re-ask. For
   * the dashboard trigger we skip members whose window is already open (already
   * consented) so we don't ask twice.
   */
  async requestOptIn(userId: string, organisationId: string, trigger: OptinTrigger): Promise<void> {
    if (trigger === 'dashboard' && (await this.isWindowOpen(userId, organisationId))) return
    const data: SendTemplateJobData = { userId, organisationId, trigger }
    await this.queue.add('send-template', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: true,
      removeOnFail: 200,
    })
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
   * who have at least one notification effectively enabled. Every notification
   * is off by default (same rule as the modal frontend), so a member is
   * "eligible for org X" only if they have at least one explicitly-enabled
   * NotificationPreference or TicketStatusNotification tied to a social account
   * of org X — otherwise they get no opt-in template and no notifications.
   */
  async listEligibleUsersForOrg(
    organisationId: string,
  ): Promise<Array<{ userId: string; locale: string; name: string }>> {
    const members = await this.prisma.organisationMember.findMany({
      where: {
        organisationId,
        status: 'ACTIVE',
        user: { phone: { not: null } },
      },
      select: { userId: true, user: { select: { name: true, locale: true } } },
    })
    if (members.length === 0) return []

    const memberIds = members.map((m) => m.userId)
    const [enabledPrefs, statusSubs] = await Promise.all([
      this.prisma.notificationPreference.findMany({
        where: {
          userId: { in: memberIds },
          socialAccount: { organisationId },
          enabled: true,
        },
        select: { userId: true },
      }),
      this.prisma.ticketStatusNotification.findMany({
        where: {
          userId: { in: memberIds },
          socialAccount: { organisationId },
          enabled: true,
        },
        select: { userId: true },
      }),
    ])

    const eligible = new Set<string>()
    for (const p of enabledPrefs) eligible.add(p.userId)
    for (const s of statusSubs) eligible.add(s.userId)

    return members
      .filter((m) => eligible.has(m.userId))
      .map((m) => ({ userId: m.userId, locale: m.user.locale, name: m.user.name }))
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
        jobId: 'whatsapp-optin-tick-hourly',
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

  async sendOptInTemplate(
    userId: string,
    organisationId: string,
    trigger: OptinTrigger = 'cron',
  ): Promise<void> {
    const cfg = optinConfig()
    if (!cfg.corePhoneNumberId || !cfg.coreAccessToken) {
      this.logger.warn('[WA opt-in] CORE_WHATSAPP_NUMBER_ID/META_SYSTEM_USER not set; skipping')
      this.posthog.capture({
        distinctId: userId,
        event: 'whatsapp_optin_template_skipped',
        properties: { organisationId, trigger, reason: 'not_configured' },
        groups: { organisation: organisationId },
      })
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
      this.posthog.capture({
        distinctId: userId,
        event: 'whatsapp_optin_template_failed',
        properties: { organisationId, trigger, status: res.status, error: JSON.stringify(json) },
        groups: { organisation: organisationId },
      })
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
    this.posthog.capture({
      distinctId: userId,
      event: 'whatsapp_optin_template_sent',
      properties: { organisationId, trigger, lang, template: cfg.templateName },
      groups: { organisation: organisationId },
    })
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
    if (!(await this.isWindowOpen(userId, organisationId))) {
      this.captureNotif(userId, organisationId, 'dropped', 'window_closed')
      return false
    }

    const cfg = optinConfig()
    if (!cfg.corePhoneNumberId || !cfg.coreAccessToken) {
      this.captureNotif(userId, organisationId, 'dropped', 'not_configured')
      return false
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    })
    if (!user?.phone) {
      this.captureNotif(userId, organisationId, 'dropped', 'no_phone')
      return false
    }

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
      this.captureNotif(userId, organisationId, 'dropped', `meta_error_${res.status}`)
      return false
    }
    this.captureNotif(userId, organisationId, 'sent')
    return true
  }

  /**
   * PostHog trace for every free-form notification attempt. This is what makes
   * the otherwise-silent drops visible — in particular `reason: window_closed`,
   * the most common cause of "I enabled notifications but received nothing".
   */
  private captureNotif(
    userId: string,
    organisationId: string,
    outcome: 'sent' | 'dropped',
    reason?: string,
  ): void {
    this.posthog.capture({
      distinctId: userId,
      event: outcome === 'sent' ? 'whatsapp_notification_sent' : 'whatsapp_notification_dropped',
      properties: { organisationId, ...(reason ? { reason } : {}) },
      groups: { organisation: organisationId },
    })
  }
}
