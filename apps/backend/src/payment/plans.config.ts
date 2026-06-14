import { OrgPlan } from '../../generated/prisma/client'

// Source de vérité des forfaits côté backend. Reflète volontairement les
// constantes du frontend (apps/frontend/src/app/components/pricing/constants.tsx)
// pour que les prix affichés et les prix réellement facturés via Stripe restent
// alignés. Aucun price ID Stripe n'est codé en dur : les prix sont créés
// dynamiquement à la volée (price_data) à partir de ce catalogue.
export interface PlanDefinition {
  // Crédits de base inclus chaque mois par le forfait.
  monthlyCredits: number
  // Prix mensuel de référence en USD (avant remise de durée).
  monthlyPriceUsd: number
  // Tarif d'un crédit supplémentaire acheté ponctuellement (overage).
  overagePerCreditUsd: number
}

export const PLAN_CATALOG: Record<OrgPlan, PlanDefinition> = {
  FREE: { monthlyCredits: 200, monthlyPriceUsd: 0, overagePerCreditUsd: 0 },
  PRO: { monthlyCredits: 1000, monthlyPriceUsd: 10, overagePerCreditUsd: 0.01 },
  BUSINESS: { monthlyCredits: 3000, monthlyPriceUsd: 25, overagePerCreditUsd: 0.008 },
}

// Cadences de facturation autorisées et remise associée (cf. DURATION_DISCOUNT
// du frontend). 6 mois = -20 %, 12 mois = -25 %.
export const DURATION_DISCOUNT: Record<number, number> = {
  1: 0,
  6: 0.2,
  12: 0.25,
}

export const ALLOWED_BILLING_MONTHS = [1, 6, 12] as const
export type BillingMonths = (typeof ALLOWED_BILLING_MONTHS)[number]

// Palier d'achat de crédits supplémentaires (achat par multiple de 1000).
export const CREDIT_PURCHASE_STEP = 1000

// Forfaits réellement souscriptibles (FREE n'est pas payant).
export const PAID_PLANS: OrgPlan[] = [OrgPlan.PRO, OrgPlan.BUSINESS]

/**
 * Prix total récurrent facturé pour `billingMonths` mois d'un forfait, remise de
 * durée incluse. C'est ce montant qui est prélevé à chaque renouvellement de
 * l'abonnement Stripe (l'intervalle de renouvellement = billingMonths mois).
 */
export function getRecurringTotalUsd(plan: OrgPlan, billingMonths: number): number {
  const def = PLAN_CATALOG[plan]
  const discount = DURATION_DISCOUNT[billingMonths] ?? 0
  const total = def.monthlyPriceUsd * billingMonths * (1 - discount)
  return Math.round(total * 100) / 100
}

/** Prix d'un achat ponctuel de `credits` crédits au tarif overage du forfait. */
export function getCreditPurchasePriceUsd(plan: OrgPlan, credits: number): number {
  const def = PLAN_CATALOG[plan]
  return Math.round(credits * def.overagePerCreditUsd * 100) / 100
}

/** Convertit un enum OrgPlan en clé frontend ('free' | 'pro' | 'business'). */
export function planToApiKey(plan: OrgPlan): 'free' | 'pro' | 'business' {
  return plan.toLowerCase() as 'free' | 'pro' | 'business'
}

/** Libellé humain d'un forfait (pour descriptions Stripe / reçus). */
export function planLabel(plan: OrgPlan): string {
  switch (plan) {
    case OrgPlan.PRO:
      return 'Pro'
    case OrgPlan.BUSINESS:
      return 'Business'
    default:
      return 'Free'
  }
}

// ─── Localisation des libellés de paiement (langue de l'utilisateur, fallback EN) ───
export type CheckoutLang = 'fr' | 'en'

/** Langue des libellés/checkout : 'fr' si l'utilisateur est en français, sinon 'en'. */
export function resolveCheckoutLang(locale: string | null | undefined): CheckoutLang {
  return (locale ?? '').slice(0, 2).toLowerCase() === 'fr' ? 'fr' : 'en'
}

/** Nom + description du produit d'abonnement, localisés. */
export function subscriptionProductText(
  plan: OrgPlan,
  billingMonths: number,
  lang: CheckoutLang,
): { name: string; description: string } {
  const label = planLabel(plan)
  const credits = PLAN_CATALOG[plan].monthlyCredits
  if (lang === 'fr') {
    return {
      name: `Bedones ${label}`,
      description: `Forfait ${label} — ${credits} crédits/mois (${billingMonths} mois)`,
    }
  }
  return {
    name: `Bedones ${label}`,
    description: `${label} plan — ${credits} credits/month (${billingMonths} months)`,
  }
}

/** Nom du produit "crédits supplémentaires", localisé. */
export function creditProductName(credits: number, lang: CheckoutLang): string {
  const n = credits.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US')
  return lang === 'fr'
    ? `Bedones — ${n} crédits supplémentaires`
    : `Bedones — ${n} additional credits`
}

/** Description du paiement d'achat de crédits, localisée. */
export function creditPaymentDescription(credits: number, lang: CheckoutLang): string {
  return lang === 'fr'
    ? `Achat de ${credits} crédits Bedones`
    : `Purchase of ${credits} Bedones credits`
}

// ─── Libellés des lignes Payment (historique interne), localisés ───

export function paymentLineSubscription(
  plan: OrgPlan,
  billingMonths: number,
  lang: CheckoutLang,
  mobile = false,
): string {
  const label = planLabel(plan)
  const suffix = mobile ? ' — Mobile money' : ''
  return lang === 'fr'
    ? `Souscription ${label} (${billingMonths} mois)${suffix}`
    : `${label} subscription (${billingMonths} months)${suffix}`
}

export function paymentLineCredits(credits: number, lang: CheckoutLang, mobile = false): string {
  const suffix = mobile ? ' — Mobile money' : ''
  return lang === 'fr'
    ? `Achat de ${credits} crédits${suffix}`
    : `Purchase of ${credits} credits${suffix}`
}

export function paymentLineRenewal(plan: OrgPlan, lang: CheckoutLang): string {
  const label = planLabel(plan)
  return lang === 'fr' ? `Renouvellement forfait ${label}` : `${label} plan renewal`
}
