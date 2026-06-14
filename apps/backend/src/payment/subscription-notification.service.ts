import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { PrismaService } from '../prisma/prisma.service'
import { NotchpayService } from './notchpay.service'
import { FACEBOOK_GRAPH_API_VERSION } from '../common/config/facebook-scopes.config'
import { PLAN_CATALOG, getRecurringTotalUsd, planLabel } from './plans.config'
import { OrgPlan, Prisma } from '../../generated/prisma/client'
import { CHURN_FLOW_TOKEN_PREFIX, firstNameOf, notificationConfig } from './notification.config'

// Composant `button` d'un template WhatsApp (URL dynamique ou Flow).
type TemplateButtonComponent =
  | {
      type: 'button'
      sub_type: 'url'
      index: string
      parameters: Array<{ type: 'text'; text: string }>
    }
  | {
      type: 'button'
      sub_type: 'flow'
      index: string
      parameters: Array<{ type: 'action'; action: { flow_token: string } }>
    }

interface SubscriptionEndedEvent {
  organisationId: string
  subscriptionId: string
  reason: 'period_ended' | 'voluntary' | 'payment_failure'
}

interface Recipient {
  phone: string
  name: string | null
}

/**
 * Notifications WhatsApp du cycle de vie d'abonnement, envoyées depuis le numéro
 * CORE Bedones via des templates Meta approuvés :
 *   A. Rappel d'échéance (mobile money)           → payment_due_reminder
 *   B. Enquête de départ (WhatsApp Flow)          → feedback_survey_form_1
 *   C. Fin pour échec de paiement                 → payment_failed_4
 *
 * ⚠️ Le détail des composants de template (ordre des variables de corps, bouton
 * URL dynamique vs statique, paramètre du bouton Flow) doit être confirmé par un
 * envoi réel : ces structures dépendent de la définition exacte des templates Meta.
 */
@Injectable()
export class SubscriptionNotificationService {
  private readonly logger = new Logger(SubscriptionNotificationService.name)

  constructor(
    private prisma: PrismaService,
    private notchpay: NotchpayService,
  ) {}

  // ─────────────────── A. Rappel d'échéance (mobile) ───────────────────

  /**
   * Parcourt les abonnements mobile money (NotchPay) arrivant à échéance dans les
   * `reminderDaysBefore` jours et non encore relancés, et envoie le rappel.
   * Appelé par le cron quotidien (PaymentProcessor).
   */
  async sendDueReminders(now: Date = new Date()): Promise<{ sent: number }> {
    const cfg = notificationConfig()
    const windowEnd = new Date(now.getTime() + cfg.reminderDaysBefore * 24 * 60 * 60 * 1000)

    const due = await this.prisma.subscription.findMany({
      where: {
        provider: 'NOTCHPAY',
        status: 'ACTIVE',
        autoRenew: false,
        lastReminderSentAt: null,
        currentPeriodEnd: { gte: now, lte: windowEnd },
      },
    })

    let sent = 0
    for (const sub of due) {
      const recipient = await this.resolveRecipient(sub.organisationId, sub.payerUserId)
      if (!recipient) continue

      const totalUsd = getRecurringTotalUsd(sub.plan, sub.billingMonths)
      const amount = `${this.notchpay.toProviderAmount(totalUsd).toLocaleString('fr-FR')} ${this.notchpay.currency}`
      const dueDate = sub.currentPeriodEnd ? sub.currentPeriodEnd.toLocaleDateString('fr-FR') : ''
      const ref = `${planLabel(sub.plan)} (${sub.billingMonths} mois)`

      const ok = await this.sendTemplate({
        to: recipient.phone,
        template: cfg.tplPaymentDue,
        bodyParams: [firstNameOf(recipient.name), ref, amount, dueDate],
        button: this.urlButton(sub.organisationId),
      })
      if (ok) {
        await this.prisma.subscription.update({
          where: { id: sub.id },
          data: { lastReminderSentAt: now },
        })
        sent++
      }
    }
    if (sent > 0) this.logger.log(`${sent} rappel(s) d'échéance envoyé(s)`)
    return { sent }
  }

  // ─────────── B & C. Fin d'abonnement (churn / échec paiement) ───────────

  @OnEvent('subscription.ended')
  async onSubscriptionEnded(event: SubscriptionEndedEvent): Promise<void> {
    try {
      const recipient = await this.resolveRecipient(event.organisationId, null)
      if (!recipient) return
      const cfg = notificationConfig()

      if (event.reason === 'payment_failure') {
        // C — échec de paiement : invite à mettre à jour le moyen de paiement.
        await this.sendTemplate({
          to: recipient.phone,
          template: cfg.tplPaymentFailed,
          bodyParams: [firstNameOf(recipient.name), 'Bedones'],
          button: this.urlButton(event.organisationId),
        })
      } else {
        // B — départ : enquête de satisfaction via WhatsApp Flow.
        await this.sendTemplate({
          to: recipient.phone,
          template: cfg.tplChurnSurvey,
          bodyParams: ['Bedones'],
          button: this.flowButton(event.organisationId),
        })
      }
    } catch (err) {
      this.logger.error(`Notification de fin d'abonnement échouée: ${err}`)
    }
  }

  // ─────────── Capture des réponses de WhatsApp Flow (enquête) ───────────

  /**
   * Le numéro CORE reçoit la soumission du Flow comme un message `nfm_reply`
   * (voir webhook.service). On parse `response_json`, on retrouve l'org via le
   * `flow_token` (préfixé) et on stocke la réponse pour affichage côté app.
   */
  @OnEvent('whatsapp.core.inbound')
  async onCoreInbound(payload: { senderPhone?: string; flowResponseJson?: string }): Promise<void> {
    if (!payload.flowResponseJson) return
    try {
      const parsed = JSON.parse(payload.flowResponseJson) as Record<string, unknown>
      const flowToken = typeof parsed.flow_token === 'string' ? parsed.flow_token : undefined
      const organisationId =
        flowToken && flowToken.startsWith(CHURN_FLOW_TOKEN_PREFIX)
          ? flowToken.slice(CHURN_FLOW_TOKEN_PREFIX.length)
          : undefined

      await this.prisma.churnSurveyResponse.create({
        data: {
          organisationId: organisationId ?? null,
          phone: payload.senderPhone ?? null,
          flowToken: flowToken ?? null,
          response: parsed as Prisma.InputJsonValue,
        },
      })
      this.logger.log(`Réponse d'enquête de départ enregistrée (org ${organisationId ?? '?'})`)
    } catch (err) {
      this.logger.error(`Parsing réponse Flow échoué: ${err}`)
    }
  }

  // ─────────────────────────── Helpers ───────────────────────────

  /** Cible la notification : le payeur s'il a un téléphone, sinon le OWNER. */
  private async resolveRecipient(
    organisationId: string,
    payerUserId: string | null,
  ): Promise<Recipient | null> {
    if (payerUserId) {
      const payer = await this.prisma.user.findUnique({
        where: { id: payerUserId },
        select: { phone: true, name: true },
      })
      if (payer?.phone) return { phone: payer.phone, name: payer.name }
    }
    const owner = await this.prisma.organisationMember.findFirst({
      where: { organisationId, role: 'OWNER', user: { phone: { not: null } } },
      select: { user: { select: { phone: true, name: true } } },
    })
    if (owner?.user.phone) return { phone: owner.user.phone, name: owner.user.name }
    return null
  }

  /** Bouton URL dynamique → page Souscriptions de l'org (suffixe d'URL Meta). */
  private urlButton(organisationId: string): TemplateButtonComponent {
    return {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: `app/${organisationId}/plan` }],
    }
  }

  /** Bouton Flow → enquête de départ, flow_token encodant l'org pour corrélation. */
  private flowButton(organisationId: string): TemplateButtonComponent {
    return {
      type: 'button',
      sub_type: 'flow',
      index: '0',
      parameters: [
        { type: 'action', action: { flow_token: `${CHURN_FLOW_TOKEN_PREFIX}${organisationId}` } },
      ],
    }
  }

  /** Envoi bas niveau d'un template Meta via le numéro CORE. */
  private async sendTemplate(args: {
    to: string
    template: string
    bodyParams: string[]
    button?: TemplateButtonComponent
  }): Promise<boolean> {
    const cfg = notificationConfig()
    if (!cfg.corePhoneNumberId || !cfg.coreAccessToken) {
      this.logger.warn('CORE_WHATSAPP_NUMBER_ID/META_SYSTEM_USER absents — notification ignorée')
      return false
    }

    const components: Array<Record<string, unknown>> = [
      {
        type: 'body',
        parameters: args.bodyParams.map((text) => ({ type: 'text', text })),
      },
    ]
    if (args.button) components.push(args.button)

    const url = `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${cfg.corePhoneNumberId}/messages`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.coreAccessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: args.to.replace('+', ''),
        type: 'template',
        template: {
          name: args.template,
          language: { code: cfg.templateLang },
          components,
        },
      }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      this.logger.error(
        `Envoi template ${args.template} échoué (${res.status}): ${JSON.stringify(json)}`,
      )
      return false
    }
    return true
  }

  /** Crédits de base d'un forfait (utilitaire pour de futurs messages). */
  static monthlyCreditsFor(plan: OrgPlan): number {
    return PLAN_CATALOG[plan].monthlyCredits
  }
}
