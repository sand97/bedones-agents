import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { StripeService, type StripeEvent, type StripeMode } from './stripe.service'
import {
  OrgPlan,
  PaymentKind,
  PaymentStatus,
  SubscriptionStatus,
} from '../../generated/prisma/client'
import {
  CREDIT_PURCHASE_STEP,
  PLAN_CATALOG,
  getCreditPurchasePriceUsd,
  getRecurringTotalUsd,
  planLabel,
  planToApiKey,
} from './plans.config'
import {
  CreateCreditCheckoutDto,
  CreateSubscriptionCheckoutDto,
  PaymentItemDto,
  SubscriptionStatusResponseDto,
} from './dto/payment.dto'

// Vues minimales et défensives des objets Stripe lus dans les webhooks. On ne
// dépend que des champs réellement utilisés (le namespace de types de ressources
// de stripe n'est pas exposé au niveau racine en résolution CommonJS).
interface CheckoutSessionLike {
  id: string
  metadata?: Record<string, string> | null
  payment_intent?: string | null
  subscription?: string | null
  customer?: string | null
}

interface InvoiceLike {
  id?: string | null
  billing_reason?: string | null
  amount_paid?: number | null
  currency?: string | null
}

interface SubscriptionLike {
  id: string
  status: string
  cancel_at_period_end?: boolean | null
}

interface PaymentIntentLike {
  id: string
  metadata?: Record<string, string> | null
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name)

  constructor(
    private prisma: PrismaService,
    private stripe: StripeService,
  ) {}

  // ─────────────────────────── Lectures ───────────────────────────

  async getStatus(userId: string, orgId: string): Promise<SubscriptionStatusResponseDto> {
    await this.assertMember(userId, orgId)
    const org = await this.prisma.organisation.findUnique({
      where: { id: orgId },
      include: { subscription: true },
    })
    if (!org) throw new NotFoundException('Organisation introuvable')

    const monthlyCredits = PLAN_CATALOG[org.plan].monthlyCredits
    const sub = org.subscription

    return {
      plan: planToApiKey(org.plan),
      status: sub?.status ?? null,
      billingMonths: sub?.billingMonths ?? null,
      monthlyCredits,
      purchasedCredits: org.purchasedCredits,
      totalCredits: monthlyCredits + org.purchasedCredits,
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    }
  }

  async listPayments(userId: string, orgId: string): Promise<PaymentItemDto[]> {
    await this.assertMember(userId, orgId)
    const payments = await this.prisma.payment.findMany({
      where: { organisationId: orgId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return payments.map((p) => ({
      id: p.id,
      kind: p.kind,
      status: p.status,
      amount: p.amount,
      currency: p.currency,
      creditsPurchased: p.creditsPurchased,
      description: p.description,
      createdAt: p.createdAt.toISOString(),
    }))
  }

  // ─────────────────────── Création de checkout ───────────────────────

  /**
   * Crée une session Stripe Checkout en mode `subscription` (vrai abonnement
   * récurrent) pour souscrire/changer de forfait payant. L'application réelle du
   * forfait se fait au webhook `checkout.session.completed`, pas ici.
   */
  async createSubscriptionCheckout(
    userId: string,
    orgId: string,
    dto: CreateSubscriptionCheckoutDto,
  ): Promise<{ url: string }> {
    const { user, org } = await this.assertManager(userId, orgId)

    const plan = dto.plan.toUpperCase() as OrgPlan
    const billingMonths = dto.billingMonths
    const def = PLAN_CATALOG[plan]
    const totalUsd = getRecurringTotalUsd(plan, billingMonths)

    const customerId = await this.getOrCreateCustomer(
      orgId,
      org.subscription?.stripeCustomerId,
      user,
    )

    const stripe = this.stripe.getClient()
    const label = planLabel(plan)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      locale: 'fr',
      allow_promotion_codes: true,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Bedones ${label}`,
              description: `Forfait ${label} — ${def.monthlyCredits} crédits/mois`,
            },
            // Montant prélevé à chaque renouvellement (= total remisé de la
            // période), l'intervalle de renouvellement étant billingMonths mois.
            unit_amount: Math.round(totalUsd * 100),
            recurring: { interval: 'month', interval_count: billingMonths },
          },
        },
      ],
      success_url: this.buildReturnUrl(orgId, 'success'),
      cancel_url: this.buildReturnUrl(orgId, 'cancelled'),
      metadata: {
        organisationId: orgId,
        kind: PaymentKind.SUBSCRIPTION,
        plan,
        billingMonths: String(billingMonths),
      },
      subscription_data: {
        metadata: {
          organisationId: orgId,
          plan,
          billingMonths: String(billingMonths),
        },
      },
    })

    if (!session.url) throw new BadRequestException('Échec de création de la session de paiement')

    // Trace une souscription INCOMPLETE (sans toucher au forfait de l'org) +
    // un paiement PENDING réconcilié plus tard par le webhook.
    await this.prisma.subscription.upsert({
      where: { organisationId: orgId },
      update: {
        plan,
        billingMonths,
        monthlyCredits: def.monthlyCredits,
        provider: 'STRIPE',
        stripeCustomerId: customerId,
        status: org.subscription?.status === 'ACTIVE' ? org.subscription.status : 'INCOMPLETE',
      },
      create: {
        organisationId: orgId,
        plan,
        billingMonths,
        monthlyCredits: def.monthlyCredits,
        provider: 'STRIPE',
        status: 'INCOMPLETE',
        stripeCustomerId: customerId,
      },
    })

    await this.prisma.payment.create({
      data: {
        organisationId: orgId,
        kind: PaymentKind.SUBSCRIPTION,
        status: PaymentStatus.PENDING,
        amount: totalUsd,
        currency: 'USD',
        description: `Souscription ${label} (${billingMonths} mois)`,
        stripeCheckoutSessionId: session.id,
      },
    })

    return { url: session.url }
  }

  /**
   * Crée une session Stripe Checkout en mode `payment` (paiement PONCTUEL, pas
   * un abonnement) pour acheter des crédits supplémentaires par palier de 1000.
   * Réservé aux forfaits payants (un compte FREE doit d'abord upgrader).
   */
  async createCreditCheckout(
    userId: string,
    orgId: string,
    dto: CreateCreditCheckoutDto,
  ): Promise<{ url: string }> {
    const { user, org } = await this.assertManager(userId, orgId)

    if (org.plan === OrgPlan.FREE) {
      throw new BadRequestException(
        "L'achat de crédits est réservé aux forfaits payants. Veuillez d'abord souscrire à un forfait.",
      )
    }
    if (dto.credits <= 0 || dto.credits % CREDIT_PURCHASE_STEP !== 0) {
      throw new BadRequestException(
        `Le nombre de crédits doit être un multiple de ${CREDIT_PURCHASE_STEP}.`,
      )
    }

    const priceUsd = getCreditPurchasePriceUsd(org.plan, dto.credits)
    const customerId = await this.getOrCreateCustomer(
      orgId,
      org.subscription?.stripeCustomerId,
      user,
    )

    // Id stable de la ligne Payment, propagé À LA FOIS sur la session ET sur le
    // PaymentIntent. C'est l'ancre d'idempotence : que le crédit soit déclenché
    // par `checkout.session.completed` ou par `payment_intent.succeeded`, les deux
    // pointent vers la même ligne et le crédit n'est appliqué qu'une seule fois.
    const paymentId = randomUUID()
    const sharedMetadata = {
      organisationId: orgId,
      kind: PaymentKind.CREDIT_PURCHASE,
      credits: String(dto.credits),
      paymentId,
    }

    const stripe = this.stripe.getClient()
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      locale: 'fr',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Bedones — ${dto.credits.toLocaleString('fr-FR')} crédits supplémentaires`,
            },
            unit_amount: Math.round(priceUsd * 100),
          },
        },
      ],
      success_url: this.buildReturnUrl(orgId, 'success'),
      cancel_url: this.buildReturnUrl(orgId, 'cancelled'),
      payment_intent_data: {
        description: `Achat de ${dto.credits} crédits Bedones`,
        // Recopie les métadonnées sur le PaymentIntent pour que
        // `payment_intent.succeeded` puisse créditer même sans la session.
        metadata: sharedMetadata,
      },
      metadata: sharedMetadata,
    })

    if (!session.url) throw new BadRequestException('Échec de création de la session de paiement')

    await this.prisma.payment.create({
      data: {
        id: paymentId,
        organisationId: orgId,
        kind: PaymentKind.CREDIT_PURCHASE,
        status: PaymentStatus.PENDING,
        amount: priceUsd,
        currency: 'USD',
        creditsPurchased: dto.credits,
        description: `Achat de ${dto.credits} crédits`,
        stripeCheckoutSessionId: session.id,
      },
    })

    return { url: session.url }
  }

  /** Ouvre le portail de facturation Stripe (gestion/annulation de l'abonnement). */
  async createPortalSession(userId: string, orgId: string): Promise<{ url: string }> {
    const { org } = await this.assertManager(userId, orgId)
    const customerId = org.subscription?.stripeCustomerId
    if (!customerId) {
      throw new BadRequestException('Aucun abonnement à gérer pour cette organisation')
    }
    const stripe = this.stripe.getClient()
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: this.buildReturnUrl(orgId, 'portal'),
    })
    return { url: session.url }
  }

  // ─────────────────────────── Webhooks ───────────────────────────

  async handleWebhookEvent(event: StripeEvent, mode: StripeMode): Promise<void> {
    this.logger.log(`Stripe webhook reçu (${mode}): ${event.type}`)
    const object = event.data.object as unknown
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(object as CheckoutSessionLike, mode)
        break
      case 'invoice.paid':
        await this.handleInvoicePaid(object as InvoiceLike, mode)
        break
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(object as SubscriptionLike)
        break
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(object as SubscriptionLike)
        break
      case 'payment_intent.succeeded':
        await this.handlePaymentIntentSucceeded(object as PaymentIntentLike)
        break
      case 'payment_intent.payment_failed':
        await this.handlePaymentIntentFailed(object as PaymentIntentLike)
        break
      default:
        this.logger.debug(`Webhook non géré: ${event.type}`)
    }
  }

  private async handleCheckoutCompleted(
    session: CheckoutSessionLike,
    mode: StripeMode,
  ): Promise<void> {
    const orgId = session.metadata?.organisationId
    const kind = session.metadata?.kind as PaymentKind | undefined
    if (!orgId || !kind) {
      this.logger.warn(`checkout.session.completed sans métadonnées exploitables: ${session.id}`)
      return
    }

    if (kind === PaymentKind.CREDIT_PURCHASE) {
      await this.applyCreditPurchase({
        paymentId: session.metadata?.paymentId,
        sessionId: session.id,
        paymentIntentId: (session.payment_intent as string) ?? undefined,
        organisationId: orgId,
        credits: session.metadata?.credits ? Number(session.metadata.credits) : undefined,
      })
      return
    }

    // Idempotence souscription : si le paiement est déjà COMPLETED, rien à faire.
    const payment = await this.prisma.payment.findUnique({
      where: { stripeCheckoutSessionId: session.id },
    })
    if (payment?.status === PaymentStatus.COMPLETED) return

    // kind === SUBSCRIPTION
    const plan = (session.metadata?.plan as OrgPlan) ?? OrgPlan.PRO
    const billingMonths = Number(session.metadata?.billingMonths ?? 1)
    const def = PLAN_CATALOG[plan]
    const stripeSubId = session.subscription as string | null

    let period: { start?: Date; end?: Date; priceId?: string } = {}
    if (stripeSubId) {
      try {
        const stripeSub = await this.stripe.getClient(mode).subscriptions.retrieve(stripeSubId)
        period = this.extractPeriod(stripeSub)
      } catch (err) {
        this.logger.warn(`Impossible de récupérer l'abonnement Stripe ${stripeSubId}: ${err}`)
      }
    }

    await this.prisma.$transaction([
      this.prisma.subscription.upsert({
        where: { organisationId: orgId },
        update: {
          plan,
          billingMonths,
          monthlyCredits: def.monthlyCredits,
          status: SubscriptionStatus.ACTIVE,
          provider: 'STRIPE',
          stripeCustomerId: (session.customer as string) ?? undefined,
          stripeSubscriptionId: stripeSubId ?? undefined,
          stripePriceId: period.priceId,
          currentPeriodStart: period.start,
          currentPeriodEnd: period.end,
          cancelAtPeriodEnd: false,
        },
        create: {
          organisationId: orgId,
          plan,
          billingMonths,
          monthlyCredits: def.monthlyCredits,
          status: SubscriptionStatus.ACTIVE,
          provider: 'STRIPE',
          stripeCustomerId: (session.customer as string) ?? undefined,
          stripeSubscriptionId: stripeSubId ?? undefined,
          stripePriceId: period.priceId,
          currentPeriodStart: period.start,
          currentPeriodEnd: period.end,
        },
      }),
      this.prisma.organisation.update({ where: { id: orgId }, data: { plan } }),
      this.prisma.payment.updateMany({
        where: { stripeCheckoutSessionId: session.id },
        data: {
          status: PaymentStatus.COMPLETED,
          stripePaymentIntentId: (session.payment_intent as string) ?? undefined,
        },
      }),
    ])
    this.logger.log(`Org ${orgId} souscrit au forfait ${plan} (${billingMonths} mois)`)
  }

  private async handleInvoicePaid(invoice: InvoiceLike, mode: StripeMode): Promise<void> {
    const stripeSubId = this.getInvoiceSubscriptionId(invoice)
    if (!stripeSubId) return

    const sub = await this.prisma.subscription.findFirst({
      where: { stripeSubscriptionId: stripeSubId },
    })
    if (!sub) {
      this.logger.warn(`invoice.paid: abonnement local introuvable pour ${stripeSubId}`)
      return
    }

    // Met à jour la période courante depuis l'abonnement Stripe.
    let period: { start?: Date; end?: Date } = {}
    try {
      const stripeSub = await this.stripe.getClient(mode).subscriptions.retrieve(stripeSubId)
      period = this.extractPeriod(stripeSub)
    } catch {
      // best-effort
    }

    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: period.start ?? sub.currentPeriodStart ?? undefined,
        currentPeriodEnd: period.end ?? sub.currentPeriodEnd ?? undefined,
      },
    })

    // N'enregistre un paiement que pour les RENOUVELLEMENTS (le paiement initial
    // est déjà tracé par checkout.session.completed). Idempotent via stripeInvoiceId.
    if (invoice.billing_reason === 'subscription_cycle' && invoice.id) {
      const existing = await this.prisma.payment.findUnique({
        where: { stripeInvoiceId: invoice.id },
      })
      if (!existing) {
        await this.prisma.payment.create({
          data: {
            organisationId: sub.organisationId,
            subscriptionId: sub.id,
            kind: PaymentKind.SUBSCRIPTION,
            status: PaymentStatus.COMPLETED,
            amount: (invoice.amount_paid ?? 0) / 100,
            currency: (invoice.currency ?? 'usd').toUpperCase(),
            description: `Renouvellement forfait ${planLabel(sub.plan)}`,
            stripeInvoiceId: invoice.id,
          },
        })
        this.logger.log(`Renouvellement enregistré pour org ${sub.organisationId}`)
      }
    }
  }

  private async handleSubscriptionUpdated(stripeSub: SubscriptionLike): Promise<void> {
    const sub = await this.prisma.subscription.findFirst({
      where: { stripeSubscriptionId: stripeSub.id },
    })
    if (!sub) return
    const period = this.extractPeriod(stripeSub)
    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: this.mapStripeStatus(stripeSub.status),
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end ?? false,
        currentPeriodStart: period.start ?? sub.currentPeriodStart ?? undefined,
        currentPeriodEnd: period.end ?? sub.currentPeriodEnd ?? undefined,
      },
    })
  }

  private async handleSubscriptionDeleted(stripeSub: SubscriptionLike): Promise<void> {
    const sub = await this.prisma.subscription.findFirst({
      where: { stripeSubscriptionId: stripeSub.id },
    })
    if (!sub) return
    // Fin d'abonnement : on rebascule l'organisation en FREE.
    await this.prisma.$transaction([
      this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: SubscriptionStatus.EXPIRED, cancelAtPeriodEnd: false },
      }),
      this.prisma.organisation.update({
        where: { id: sub.organisationId },
        data: { plan: OrgPlan.FREE },
      }),
    ])
    this.logger.log(`Abonnement terminé pour org ${sub.organisationId} — retour au forfait FREE`)
  }

  /**
   * Filet de sécurité pour l'ACHAT DE CRÉDITS : crédite l'organisation même si
   * `checkout.session.completed` n'arrive jamais (event désactivé, manqué…). Ne
   * traite QUE les paiements de crédits ; les abonnements passent par
   * `checkout.session.completed` + `invoice.paid`. Le crédit reste exactement
   * une fois grâce à `applyCreditPurchase` (ancre d'idempotence sur la ligne
   * Payment), donc aucun double crédit même si les deux events arrivent.
   */
  private async handlePaymentIntentSucceeded(pi: PaymentIntentLike): Promise<void> {
    if (pi.metadata?.kind !== PaymentKind.CREDIT_PURCHASE) return
    await this.applyCreditPurchase({
      paymentId: pi.metadata?.paymentId,
      paymentIntentId: pi.id,
      organisationId: pi.metadata?.organisationId,
      credits: pi.metadata?.credits ? Number(pi.metadata.credits) : undefined,
    })
  }

  /**
   * Applique un achat de crédits de façon ATOMIQUE et EXACTEMENT UNE FOIS.
   *
   * La ligne Payment sert d'ancre d'idempotence : on ne crédite que lors de la
   * transition PENDING → COMPLETED, gérée par un `updateMany` filtré sur
   * `status: PENDING`. Une seule transaction peut faire basculer la ligne (les
   * autres voient `count = 0` et n'incrémentent rien), peu importe que le
   * déclencheur soit `checkout.session.completed`, `payment_intent.succeeded`,
   * ou un retry Stripe du même event.
   */
  private async applyCreditPurchase(args: {
    paymentId?: string | null
    sessionId?: string
    paymentIntentId?: string
    organisationId?: string
    credits?: number
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Localise la ligne Payment : par id (le plus fiable), sinon par session,
      // sinon par PaymentIntent déjà rattaché.
      let payment = null
      if (args.paymentId) {
        payment = await tx.payment.findUnique({ where: { id: args.paymentId } })
      } else if (args.sessionId) {
        payment = await tx.payment.findUnique({
          where: { stripeCheckoutSessionId: args.sessionId },
        })
      } else if (args.paymentIntentId) {
        payment = await tx.payment.findFirst({
          where: { stripePaymentIntentId: args.paymentIntentId },
        })
      }

      if (!payment) {
        this.logger.warn(
          `applyCreditPurchase: aucune ligne Payment trouvée (paymentId=${args.paymentId}, session=${args.sessionId}, pi=${args.paymentIntentId})`,
        )
        return
      }
      if (payment.status === PaymentStatus.COMPLETED) return // déjà crédité

      // Bascule atomique PENDING → COMPLETED : seul le gagnant de la course
      // (count === 1) procède au crédit.
      const flipped = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING },
        data: {
          status: PaymentStatus.COMPLETED,
          stripePaymentIntentId: args.paymentIntentId ?? payment.stripePaymentIntentId ?? undefined,
        },
      })
      if (flipped.count !== 1) return

      const credits = payment.creditsPurchased ?? args.credits ?? 0
      if (credits > 0) {
        await tx.organisation.update({
          where: { id: payment.organisationId },
          data: { purchasedCredits: { increment: credits } },
        })
      }
      this.logger.log(`+${credits} crédits achetés pour org ${payment.organisationId}`)
    })
  }

  private async handlePaymentIntentFailed(pi: PaymentIntentLike): Promise<void> {
    const updated = await this.prisma.payment.updateMany({
      where: { stripePaymentIntentId: pi.id, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.FAILED },
    })
    if (updated.count > 0) {
      this.logger.warn(`Paiement échoué (payment_intent ${pi.id})`)
    }
  }

  // ─────────────────────────── Helpers ───────────────────────────

  private async getOrCreateCustomer(
    orgId: string,
    existingCustomerId: string | null | undefined,
    user: { id: string; email: string | null; name: string | null },
  ): Promise<string> {
    if (existingCustomerId) return existingCustomerId
    const stripe = this.stripe.getClient()
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: user.name ?? undefined,
      metadata: { organisationId: orgId, userId: user.id },
    })
    return customer.id
  }

  /**
   * Récupère la période courante + price ID d'un abonnement Stripe en tolérant
   * les différences de schéma entre versions d'API (les champs de période ont
   * migré de l'abonnement vers ses items selon les versions).
   */
  private extractPeriod(stripeSub: unknown): {
    start?: Date
    end?: Date
    priceId?: string
  } {
    const sub = stripeSub as unknown as {
      current_period_start?: number
      current_period_end?: number
      items?: {
        data?: Array<{
          current_period_start?: number
          current_period_end?: number
          price?: { id?: string }
        }>
      }
    }
    const item = sub.items?.data?.[0]
    const startTs = sub.current_period_start ?? item?.current_period_start
    const endTs = sub.current_period_end ?? item?.current_period_end
    return {
      start: startTs ? new Date(startTs * 1000) : undefined,
      end: endTs ? new Date(endTs * 1000) : undefined,
      priceId: item?.price?.id,
    }
  }

  private getInvoiceSubscriptionId(invoice: unknown): string | null {
    const inv = invoice as unknown as {
      subscription?: string | { id?: string } | null
      parent?: { subscription_details?: { subscription?: string | { id?: string } } }
    }
    const direct = inv.subscription
    if (typeof direct === 'string') return direct
    if (direct && typeof direct === 'object' && direct.id) return direct.id
    const nested = inv.parent?.subscription_details?.subscription
    if (typeof nested === 'string') return nested
    if (nested && typeof nested === 'object' && nested.id) return nested.id
    return null
  }

  private mapStripeStatus(status: string): SubscriptionStatus {
    switch (status) {
      case 'active':
      case 'trialing':
        return SubscriptionStatus.ACTIVE
      case 'past_due':
        return SubscriptionStatus.PAST_DUE
      case 'canceled':
      case 'unpaid':
        return SubscriptionStatus.CANCELED
      default:
        return SubscriptionStatus.INCOMPLETE
    }
  }

  private buildReturnUrl(orgId: string, outcome: 'success' | 'cancelled' | 'portal'): string {
    const base = (process.env.FRONTEND_URL || 'https://moderator.bedones.local').replace(/\/$/, '')
    return `${base}/?org=${orgId}&payment=${outcome}`
  }

  // ───────────────────── Contrôle d'accès ─────────────────────

  private async assertMember(userId: string, orgId: string) {
    const membership = await this.prisma.organisationMember.findUnique({
      where: { userId_organisationId: { userId, organisationId: orgId } },
    })
    if (!membership) {
      throw new ForbiddenException("Vous n'êtes pas membre de cette organisation")
    }
    return membership
  }

  /**
   * Vérifie que l'utilisateur peut gérer la facturation (OWNER ou ADMIN) et
   * renvoie l'utilisateur + l'organisation (avec sa souscription).
   */
  private async assertManager(userId: string, orgId: string) {
    const membership = await this.assertMember(userId, orgId)
    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Seuls les propriétaires et administrateurs gèrent la facturation',
      )
    }
    const org = await this.prisma.organisation.findUnique({
      where: { id: orgId },
      include: { subscription: true },
    })
    if (!org) throw new NotFoundException('Organisation introuvable')
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    })
    if (!user) throw new NotFoundException('Utilisateur introuvable')
    return { org, user }
  }
}
