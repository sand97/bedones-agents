import { OrgPlan, PaymentKind } from '../../../generated/prisma/client'
import { type CheckoutLang, planLabel } from '../plans.config'

export interface InvoiceLineItem {
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export interface InvoiceData {
  lang: CheckoutLang
  invoiceNumber: string
  issueDate: string
  dueDate: string
  seller: { name: string; address: string; email: string; phone: string; taxId: string }
  client: { name: string; org: string; email: string; phone: string }
  currency: string
  items: InvoiceLineItem[]
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  paymentMethod: string
  notes: string
}

// Libellés statiques de la facture, localisés (langue du destinataire, fallback EN).
export interface InvoiceLabels {
  invoice: string
  issuedOn: string
  due: string
  seller: string
  billedTo: string
  taxId: string
  colDescription: string
  colQty: string
  colUnit: string
  colTotal: string
  subtotal: string
  vat: string
  grandTotal: string
  paymentMethod: string
}

const LABELS: Record<CheckoutLang, InvoiceLabels> = {
  fr: {
    invoice: 'FACTURE',
    issuedOn: 'Émise le',
    due: 'Échéance',
    seller: 'ÉMETTEUR',
    billedTo: 'FACTURÉ À',
    taxId: 'NUI',
    colDescription: 'DESCRIPTION',
    colQty: 'QTÉ',
    colUnit: 'PRIX UNIT.',
    colTotal: 'TOTAL',
    subtotal: 'Sous-total',
    vat: 'TVA',
    grandTotal: 'Total',
    paymentMethod: 'Moyen de paiement :',
  },
  en: {
    invoice: 'INVOICE',
    issuedOn: 'Issued on',
    due: 'Due',
    seller: 'FROM',
    billedTo: 'BILL TO',
    taxId: 'Tax ID',
    colDescription: 'DESCRIPTION',
    colQty: 'QTY',
    colUnit: 'UNIT PRICE',
    colTotal: 'TOTAL',
    subtotal: 'Subtotal',
    vat: 'VAT',
    grandTotal: 'Total',
    paymentMethod: 'Payment method:',
  },
}

export function invoiceLabels(lang: CheckoutLang): InvoiceLabels {
  return LABELS[lang]
}

// Émetteur (Bedones). Surchargeable par env pour s'adapter à l'entité légale.
const SELLER = {
  name: process.env.INVOICE_SELLER_NAME ?? 'Bedones',
  address: process.env.INVOICE_SELLER_ADDRESS ?? 'Akwa, Douala, Cameroun',
  email: process.env.INVOICE_SELLER_EMAIL ?? 'contact@bedones.com',
  phone: process.env.INVOICE_SELLER_PHONE ?? '+237 6 90 07 28 84',
  taxId: process.env.INVOICE_SELLER_TAX_ID ?? 'P049818395574U',
}

export function formatMoney(amount: number, currency: string): string {
  return `${amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

function formatDate(d: Date, lang: CheckoutLang): string {
  return d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

interface PaymentForInvoice {
  id: string
  kind: PaymentKind
  amount: number
  currency: string
  creditsPurchased: number | null
  description: string | null
  createdAt: Date
}

type SubscriptionForInvoice = {
  plan: OrgPlan
  billingMonths: number
  cardBrand: string | null
  cardLast4: string | null
  mobileNumber: string | null
} | null

/** Construit les données de facture (localisées) à partir d'un paiement réel. */
export function buildInvoiceData(args: {
  lang: CheckoutLang
  payment: PaymentForInvoice
  orgName: string
  recipient: { name: string | null; email: string | null; phone: string | null }
  subscription: SubscriptionForInvoice
}): InvoiceData {
  const { lang, payment, orgName, recipient, subscription } = args
  const year = payment.createdAt.getFullYear()
  const shortId = payment.id.replace(/-/g, '').slice(0, 8).toUpperCase()
  const isFr = lang === 'fr'

  let itemDescription: string
  if (payment.kind === PaymentKind.SUBSCRIPTION) {
    const label = subscription ? planLabel(subscription.plan) : ''
    const months = subscription?.billingMonths ?? 0
    itemDescription = subscription
      ? isFr
        ? `Forfait ${label} — ${months} mois`
        : `${label} plan — ${months} months`
      : (payment.description ?? (isFr ? 'Abonnement' : 'Subscription'))
  } else {
    const n = payment.creditsPurchased ?? 0
    itemDescription = isFr
      ? `Achat de ${n} crédits supplémentaires`
      : `Purchase of ${n} additional credits`
  }

  const items: InvoiceLineItem[] = [
    { description: itemDescription, quantity: 1, unitPrice: payment.amount, total: payment.amount },
  ]

  // Résumé du moyen de paiement, localisé.
  let paymentMethod = isFr ? 'Paiement en ligne' : 'Online payment'
  if (subscription?.cardLast4) {
    const brand = subscription.cardBrand ?? ''
    paymentMethod = isFr
      ? `Carte ${brand} •••• ${subscription.cardLast4}`.replace('  ', ' ').trim()
      : `${brand} card •••• ${subscription.cardLast4}`.replace('  ', ' ').trim()
  } else if (subscription?.mobileNumber) {
    paymentMethod = `Mobile money — ${subscription.mobileNumber}`
  }

  return {
    lang,
    invoiceNumber: `BED-${year}-${shortId}`,
    issueDate: formatDate(payment.createdAt, lang),
    dueDate: formatDate(payment.createdAt, lang),
    seller: SELLER,
    client: {
      name: recipient.name ?? '',
      org: orgName,
      email: recipient.email ?? '',
      phone: recipient.phone ?? '',
    },
    currency: payment.currency,
    items,
    subtotal: payment.amount,
    taxRate: 0,
    taxAmount: 0,
    total: payment.amount,
    paymentMethod,
    notes: isFr
      ? 'Merci pour votre confiance. Cette facture est générée automatiquement par Bedones.'
      : 'Thank you for your trust. This invoice was generated automatically by Bedones.',
  }
}
