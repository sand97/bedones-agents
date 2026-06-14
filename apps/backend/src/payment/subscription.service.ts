import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { randomUUID } from 'crypto'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PrismaService } from '../prisma/prisma.service'
import { StripeService, type StripeEvent, type StripeMode } from './stripe.service'
import { NotchpayService } from './notchpay.service'
import { InvoicePdfmakeService } from './invoice/invoice-pdfmake.service'
import { buildInvoiceData } from './invoice/invoice-data'
import {
  OrgPlan,
  PaymentKind,
  PaymentStatus,
  SubscriptionStatus,
} from '../../generated/prisma/client'
import {
  CREDIT_PURCHASE_STEP,
  PLAN_CATALOG,
  creditPaymentDescription,
  creditProductName,
  getCreditPurchasePriceUsd,
  getRecurringTotalUsd,
  paymentLineCredits,
  paymentLineRenewal,
  paymentLineSubscription,
  planToApiKey,
  resolveCheckoutLang,
  subscriptionProductText,
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
  cancellation_details?: { reason?: string | null } | null
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
    private notchpay: NotchpayService,
    private events: EventEmitter2,
    private invoicePdf: InvoicePdfmakeService,
  ) {}

  // ─────────────────────────── Lectures ───────────────────────────

  async getStatus(userId: string, orgId: string): Promise<SubscriptionStatusResponseDto> {
    await this.assertMember(userId, orgId)
    const [org, paymentsCount] = await Promise.all([
      this.prisma.organisation.findUnique({
        where: { id: orgId },
        include: { subscription: true },
      }),
      this.prisma.payment.count({ where: { organisationId: orgId } }),
    ])
    if (!org) throw new NotFoundException('Organisation introuvable')

    const monthlyCredits = PLAN_CATALOG[org.plan].monthlyCredits
    const sub = org.subscription

    // Résumé du moyen de paiement pour le récap (carte vs mobile money).
    let methodType: 'CARD' | 'MOBILE_MONEY' | null = null
    if (sub?.provider === 'STRIPE' && (sub.cardLast4 || sub.cardBrand)) methodType = 'CARD'
    else if (sub?.provider === 'NOTCHPAY' && sub.mobileNumber) methodType = 'MOBILE_MONEY'

    return {
      plan: planToApiKey(org.plan),
      status: sub?.status ?? null,
      billingMonths: sub?.billingMonths ?? null,
      monthlyCredits,
      purchasedCredits: org.purchasedCredits,
      totalCredits: monthlyCredits + org.purchasedCredits,
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
      provider: sub?.provider ?? null,
      paymentMethod: {
        type: methodType,
        brand: sub?.cardBrand ?? null,
        last4: sub?.cardLast4 ?? null,
        phone: sub?.mobileNumber ?? null,
      },
      hasPayments: paymentsCount > 0,
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
      provider: p.provider,
      cardBrand: p.cardBrand,
      cardLast4: p.cardLast4,
      mobileNumber: p.mobileNumber,
      createdAt: p.createdAt.toISOString(),
    }))
  }

  /** Réponses des enquêtes de départ (WhatsApp Flow) reçues pour l'organisation. */
  async listChurnSurveyResponses(userId: string, orgId: string) {
    await this.assertMember(userId, orgId)
    const rows = await this.prisma.churnSurveyResponse.findMany({
      where: { organisationId: orgId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return rows.map((r) => ({
      id: r.id,
      phone: r.phone,
      response: r.response as Record<string, unknown>,
      createdAt: r.createdAt.toISOString(),
    }))
  }

  /**
   * Génère la facture PDF (pdfmake) d'un paiement de l'organisation. Seuls les
   * paiements aboutis (COMPLETED) sont facturables.
   */
  async generateInvoice(
    userId: string,
    orgId: string,
    paymentId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    await this.assertMember(userId, orgId)
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, organisationId: orgId },
    })
    if (!payment) throw new NotFoundException('Paiement introuvable')
    if (payment.status !== PaymentStatus.COMPLETED) {
      throw new BadRequestException('Seul un paiement abouti peut être facturé')
    }

    const [org, sub] = await Promise.all([
      this.prisma.organisation.findUnique({ where: { id: orgId }, select: { name: true } }),
      this.prisma.subscription.findUnique({ where: { organisationId: orgId } }),
    ])
    const recipient = (await this.resolveInvoiceRecipient(orgId, sub?.payerUserId ?? null)) ?? {
      name: null,
      email: null,
      phone: null,
      locale: null,
    }

    const data = buildInvoiceData({
      lang: resolveCheckoutLang(recipient.locale),
      payment,
      orgName: org?.name ?? 'Organisation',
      recipient,
      subscription: sub
        ? {
            plan: sub.plan,
            billingMonths: sub.billingMonths,
            cardBrand: sub.cardBrand,
            cardLast4: sub.cardLast4,
            mobileNumber: sub.mobileNumber,
          }
        : null,
    })
    const buffer = await this.invoicePdf.generate(data)
    return { buffer, filename: `${data.invoiceNumber}.pdf` }
  }

  private async resolveInvoiceRecipient(orgId: string, payerUserId: string | null) {
    if (payerUserId) {
      const payer = await this.prisma.user.findUnique({
        where: { id: payerUserId },
        select: { name: true, email: true, phone: true, locale: true },
      })
      if (payer) return payer
    }
    const owner = await this.prisma.organisationMember.findFirst({
      where: { organisationId: orgId, role: 'OWNER' },
      select: { user: { select: { name: true, email: true, phone: true, locale: true } } },
    })
    return owner?.user ?? null
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

    // Mobile money (NotchPay) : paiement ponctuel, accès à durée fixe.
    if (dto.method === 'MOBILE_MONEY') {
      return this.createNotchpaySubscriptionCheckout({
        orgId,
        user,
        org,
        plan,
        billingMonths,
        totalUsd,
      })
    }

    const customerId = await this.getOrCreateCustomer(
      orgId,
      org.subscription?.stripeCustomerId,
      user,
    )

    const stripe = this.stripe.getClient()
    const lang = resolveCheckoutLang(user.locale)
    const product = subscriptionProductText(plan, billingMonths, lang)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      locale: lang,
      allow_promotion_codes: true,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            product_data: {
              name: product.name,
              description: product.description,
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
        autoRenew: true,
        payerUserId: userId,
        stripeCustomerId: customerId,
        status: org.subscription?.status === 'ACTIVE' ? org.subscription.status : 'INCOMPLETE',
      },
      create: {
        organisationId: orgId,
        plan,
        billingMonths,
        monthlyCredits: def.monthlyCredits,
        provider: 'STRIPE',
        payerUserId: userId,
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
        description: paymentLineSubscription(plan, billingMonths, lang),
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

    // Mobile money (NotchPay) : achat ponctuel de crédits.
    if (dto.method === 'MOBILE_MONEY') {
      return this.createNotchpayCreditCheckout({ orgId, user, credits: dto.credits, priceUsd })
    }

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

    const lang = resolveCheckoutLang(user.locale)
    const stripe = this.stripe.getClient()
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      locale: lang,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            product_data: {
              name: creditProductName(dto.credits, lang),
            },
            unit_amount: Math.round(priceUsd * 100),
          },
        },
      ],
      success_url: this.buildReturnUrl(orgId, 'success'),
      cancel_url: this.buildReturnUrl(orgId, 'cancelled'),
      payment_intent_data: {
        description: creditPaymentDescription(dto.credits, lang),
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
        description: paymentLineCredits(dto.credits, lang),
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

  // ──────────────────── NotchPay (mobile money) ────────────────────

  /**
   * Souscription via NotchPay : paiement PONCTUEL couvrant `billingMonths` mois.
   * Aucun renouvellement automatique (`autoRenew = false`) — l'accès expire à
   * `currentPeriodEnd` et l'utilisateur est relancé par WhatsApp avant l'échéance.
   */
  private async createNotchpaySubscriptionCheckout(args: {
    orgId: string
    user: { id: string; email: string | null; name: string | null; locale: string | null }
    org: { subscription: { status: string } | null }
    plan: OrgPlan
    billingMonths: number
    totalUsd: number
  }): Promise<{ url: string }> {
    const { orgId, user, plan, billingMonths, totalUsd } = args
    const def = PLAN_CATALOG[plan]
    const lang = resolveCheckoutLang(user.locale)
    const paymentId = randomUUID()

    // Souscription INCOMPLETE (forfait inchangé tant que le paiement n'est pas confirmé).
    await this.prisma.subscription.upsert({
      where: { organisationId: orgId },
      update: {
        plan,
        billingMonths,
        monthlyCredits: def.monthlyCredits,
        provider: 'NOTCHPAY',
        autoRenew: false,
        payerUserId: user.id,
        status: args.org.subscription?.status === 'ACTIVE' ? 'ACTIVE' : 'INCOMPLETE',
      },
      create: {
        organisationId: orgId,
        plan,
        billingMonths,
        monthlyCredits: def.monthlyCredits,
        provider: 'NOTCHPAY',
        autoRenew: false,
        payerUserId: user.id,
        status: 'INCOMPLETE',
      },
    })

    const result = await this.notchpay.initializePayment({
      amount: this.notchpay.toProviderAmount(totalUsd),
      currency: this.notchpay.currency,
      email: user.email,
      phone: null,
      name: user.name,
      description: subscriptionProductText(plan, billingMonths, lang).description,
      reference: paymentId,
      callbackUrl: this.buildReturnUrl(orgId, 'success'),
    })

    await this.prisma.payment.create({
      data: {
        id: paymentId,
        organisationId: orgId,
        kind: PaymentKind.SUBSCRIPTION,
        provider: 'NOTCHPAY',
        status: PaymentStatus.PENDING,
        amount: totalUsd,
        currency: 'USD',
        description: paymentLineSubscription(plan, billingMonths, lang, true),
        notchpayReference: result.reference,
      },
    })

    return { url: result.authorizationUrl }
  }

  /** Achat ponctuel de crédits via NotchPay (mobile money). */
  private async createNotchpayCreditCheckout(args: {
    orgId: string
    user: { id: string; email: string | null; name: string | null; locale: string | null }
    credits: number
    priceUsd: number
  }): Promise<{ url: string }> {
    const { orgId, user, credits, priceUsd } = args
    const lang = resolveCheckoutLang(user.locale)
    const paymentId = randomUUID()

    const result = await this.notchpay.initializePayment({
      amount: this.notchpay.toProviderAmount(priceUsd),
      currency: this.notchpay.currency,
      email: user.email,
      phone: null,
      name: user.name,
      description: creditPaymentDescription(credits, lang),
      reference: paymentId,
      callbackUrl: this.buildReturnUrl(orgId, 'success'),
    })

    await this.prisma.payment.create({
      data: {
        id: paymentId,
        organisationId: orgId,
        kind: PaymentKind.CREDIT_PURCHASE,
        provider: 'NOTCHPAY',
        status: PaymentStatus.PENDING,
        amount: priceUsd,
        currency: 'USD',
        creditsPurchased: credits,
        description: paymentLineCredits(credits, lang, true),
        notchpayReference: result.reference,
      },
    })

    return { url: result.authorizationUrl }
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
    let card: { brand?: string; last4?: string } = {}
    if (stripeSubId) {
      try {
        const stripeSub = await this.stripe
          .getClient(mode)
          .subscriptions.retrieve(stripeSubId, { expand: ['default_payment_method'] })
        period = this.extractPeriod(stripeSub)
        card = this.extractCard(stripeSub)
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
          cardBrand: card.brand,
          cardLast4: card.last4,
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
          cardBrand: card.brand,
          cardLast4: card.last4,
        },
      }),
      this.prisma.organisation.update({ where: { id: orgId }, data: { plan } }),
      this.prisma.payment.updateMany({
        where: { stripeCheckoutSessionId: session.id },
        data: {
          status: PaymentStatus.COMPLETED,
          stripePaymentIntentId: (session.payment_intent as string) ?? undefined,
          cardBrand: card.brand,
          cardLast4: card.last4,
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
        const payer = sub.payerUserId
          ? await this.prisma.user.findUnique({
              where: { id: sub.payerUserId },
              select: { locale: true },
            })
          : null
        const lang = resolveCheckoutLang(payer?.locale)
        await this.prisma.payment.create({
          data: {
            organisationId: sub.organisationId,
            subscriptionId: sub.id,
            kind: PaymentKind.SUBSCRIPTION,
            status: PaymentStatus.COMPLETED,
            amount: (invoice.amount_paid ?? 0) / 100,
            currency: (invoice.currency ?? 'usd').toUpperCase(),
            description: paymentLineRenewal(sub.plan, lang),
            stripeInvoiceId: invoice.id,
            cardBrand: sub.cardBrand,
            cardLast4: sub.cardLast4,
            mobileNumber: sub.mobileNumber,
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

    // Échec de paiement (dunning Stripe épuisé) → flux C ; sinon départ volontaire → flux B.
    const reason =
      stripeSub.cancellation_details?.reason === 'payment_failure' ? 'payment_failure' : 'voluntary'
    this.events.emit('subscription.ended', {
      organisationId: sub.organisationId,
      subscriptionId: sub.id,
      reason,
    })
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

      // Snapshot du moyen de paiement, depuis l'abonnement de l'org.
      const sub = await tx.subscription.findUnique({
        where: { organisationId: payment.organisationId },
        select: { provider: true, cardBrand: true, cardLast4: true, mobileNumber: true },
      })
      const methodSnapshot =
        payment.provider === 'STRIPE'
          ? { cardBrand: sub?.cardBrand ?? undefined, cardLast4: sub?.cardLast4 ?? undefined }
          : { mobileNumber: sub?.mobileNumber ?? undefined }

      // Bascule atomique PENDING → COMPLETED : seul le gagnant de la course
      // (count === 1) procède au crédit.
      const flipped = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING },
        data: {
          status: PaymentStatus.COMPLETED,
          stripePaymentIntentId: args.paymentIntentId ?? payment.stripePaymentIntentId ?? undefined,
          ...methodSnapshot,
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

  // ──────────────── Webhook NotchPay (mobile money) ────────────────

  /**
   * Traite un webhook NotchPay (déjà vérifié côté contrôleur). On ne réagit
   * qu'aux paiements aboutis ; la ligne Payment (retrouvée par sa référence)
   * sert d'ancre d'idempotence pour ne créditer/activer qu'une seule fois.
   */
  async handleNotchpayWebhook(payload: {
    event?: string
    data?: {
      reference?: string
      status?: string
      customer?: { phone?: string | null } | string | null
    }
  }): Promise<void> {
    const reference = payload.data?.reference
    const status = payload.data?.status ?? ''
    const isComplete = payload.event === 'payment.complete' || status === 'complete'
    if (!reference || !isComplete) {
      this.logger.debug(`NotchPay webhook ignoré (event=${payload.event}, status=${status})`)
      return
    }

    const payment = await this.prisma.payment.findUnique({
      where: { notchpayReference: reference },
    })
    if (!payment) {
      this.logger.warn(`NotchPay webhook: aucune ligne Payment pour la référence ${reference}`)
      return
    }
    if (payment.status === PaymentStatus.COMPLETED) return

    if (payment.kind === PaymentKind.CREDIT_PURCHASE) {
      await this.applyCreditPurchase({ paymentId: payment.id })
      return
    }
    const customer = payload.data?.customer
    const mobilePhone =
      customer && typeof customer === 'object' ? (customer.phone ?? undefined) : undefined
    await this.activateOneShotSubscription(payment.id, mobilePhone)
  }

  /**
   * Active un forfait acheté en ONE-SHOT (NotchPay) : accès à durée fixe
   * (`billingMonths`), sans renouvellement automatique. Atomique et
   * exactement-une-fois via la transition PENDING → COMPLETED de la ligne Payment.
   */
  private async activateOneShotSubscription(
    paymentId: string,
    mobilePhone?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId } })
      if (!payment || payment.status === PaymentStatus.COMPLETED) return

      const flipped = await tx.payment.updateMany({
        where: { id: paymentId, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.COMPLETED },
      })
      if (flipped.count !== 1) return

      const sub = await tx.subscription.findUnique({
        where: { organisationId: payment.organisationId },
      })
      const plan = sub?.plan ?? OrgPlan.PRO
      const billingMonths = sub?.billingMonths ?? 1
      const def = PLAN_CATALOG[plan]
      const now = new Date()
      const periodEnd = new Date(now)
      periodEnd.setMonth(periodEnd.getMonth() + billingMonths)

      // Numéro mobile utilisé : celui de la transaction si fourni, sinon celui
      // du payeur (pour le récap "moyen de paiement").
      let mobileNumber = mobilePhone
      if (!mobileNumber && sub?.payerUserId) {
        const payer = await tx.user.findUnique({
          where: { id: sub.payerUserId },
          select: { phone: true },
        })
        mobileNumber = payer?.phone ?? undefined
      }

      await tx.subscription.upsert({
        where: { organisationId: payment.organisationId },
        update: {
          plan,
          billingMonths,
          monthlyCredits: def.monthlyCredits,
          provider: 'NOTCHPAY',
          status: SubscriptionStatus.ACTIVE,
          autoRenew: false,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          mobileNumber,
        },
        create: {
          organisationId: payment.organisationId,
          plan,
          billingMonths,
          monthlyCredits: def.monthlyCredits,
          provider: 'NOTCHPAY',
          status: SubscriptionStatus.ACTIVE,
          autoRenew: false,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          mobileNumber,
        },
      })
      await tx.organisation.update({ where: { id: payment.organisationId }, data: { plan } })
      await tx.payment.update({
        where: { id: paymentId },
        data: { subscriptionId: sub?.id, mobileNumber },
      })
    })
    this.logger.log(`Forfait mobile money activé (payment ${paymentId})`)
  }

  // ──────────────── Expiration des accès non renouvelés ────────────────

  /**
   * Fait expirer les souscriptions à durée fixe (NotchPay, ou Stripe annulées)
   * dont la période est terminée : retour au forfait FREE + émission d'un
   * événement `subscription.expired` (consommé par le service de notifications).
   * À appeler périodiquement (cron quotidien).
   */
  async expireSubscriptions(now: Date = new Date()): Promise<{ expired: number }> {
    const due = await this.prisma.subscription.findMany({
      where: {
        autoRenew: false,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: { not: null, lt: now },
      },
      select: { id: true, organisationId: true, plan: true },
    })

    for (const sub of due) {
      await this.prisma.$transaction([
        this.prisma.subscription.update({
          where: { id: sub.id },
          data: { status: SubscriptionStatus.EXPIRED },
        }),
        this.prisma.organisation.update({
          where: { id: sub.organisationId },
          data: { plan: OrgPlan.FREE },
        }),
      ])
      // Notification de fin d'abonnement (WhatsApp). Non-renouvellement mobile
      // → enquête de départ (flux B).
      this.events.emit('subscription.ended', {
        organisationId: sub.organisationId,
        subscriptionId: sub.id,
        reason: 'period_ended',
      })
    }

    if (due.length > 0) this.logger.log(`${due.length} souscription(s) expirée(s)`)
    return { expired: due.length }
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

  /** Marque + 4 derniers chiffres de la carte (default_payment_method étendu). */
  private extractCard(stripeSub: unknown): { brand?: string; last4?: string } {
    const sub = stripeSub as {
      default_payment_method?: { card?: { brand?: string; last4?: string } } | string | null
    }
    const pm = sub.default_payment_method
    if (pm && typeof pm === 'object' && pm.card) {
      return { brand: pm.card.brand, last4: pm.card.last4 }
    }
    return {}
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
    // Retour vers la page Souscriptions de l'org (orgSlug = id). Le paramètre
    // `payment` y déclenche l'écran de succès / le retour après annulation.
    if (outcome === 'success') return `${base}/app/${orgId}/plan?payment=success`
    if (outcome === 'cancelled') return `${base}/app/${orgId}/plan?payment=cancelled`
    return `${base}/app/${orgId}/plan`
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
      select: { id: true, email: true, name: true, locale: true },
    })
    if (!user) throw new NotFoundException('Utilisateur introuvable')
    return { org, user }
  }
}
