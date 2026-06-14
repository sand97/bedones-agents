import { OrgPlan, PaymentKind } from '../../../generated/prisma/client'
import { planLabel } from '../plans.config'

export interface InvoiceLineItem {
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export interface InvoiceData {
  invoiceNumber: string
  issueDate: string
  dueDate: string
  seller: { name: string; address: string; email: string; taxId: string }
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

// Émetteur (Bedones). Surchargeable par env pour s'adapter à l'entité légale.
const SELLER = {
  name: process.env.INVOICE_SELLER_NAME ?? 'Bedones SAS',
  address: process.env.INVOICE_SELLER_ADDRESS ?? 'Akwa, Douala, Cameroun',
  email: process.env.INVOICE_SELLER_EMAIL ?? 'facturation@bedones.com',
  taxId: process.env.INVOICE_SELLER_TAX_ID ?? '',
}

export function formatMoney(amount: number, currency: string): string {
  return `${amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
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

/** Construit les données de facture à partir d'un paiement réel et de son contexte. */
export function buildInvoiceData(args: {
  payment: PaymentForInvoice
  orgName: string
  recipient: { name: string | null; email: string | null; phone: string | null }
  subscription: SubscriptionForInvoice
}): InvoiceData {
  const { payment, orgName, recipient, subscription } = args
  const year = payment.createdAt.getFullYear()
  const shortId = payment.id.replace(/-/g, '').slice(0, 8).toUpperCase()

  const items: InvoiceLineItem[] =
    payment.kind === PaymentKind.SUBSCRIPTION
      ? [
          {
            description: subscription
              ? `Forfait ${planLabel(subscription.plan)} — ${subscription.billingMonths} mois`
              : (payment.description ?? 'Abonnement'),
            quantity: 1,
            unitPrice: payment.amount,
            total: payment.amount,
          },
        ]
      : [
          {
            description: `Achat de ${payment.creditsPurchased ?? 0} crédits supplémentaires`,
            quantity: 1,
            unitPrice: payment.amount,
            total: payment.amount,
          },
        ]

  // Résumé du moyen de paiement.
  let paymentMethod = 'Paiement en ligne'
  if (subscription?.cardLast4) {
    paymentMethod = `Carte ${subscription.cardBrand ?? ''} •••• ${subscription.cardLast4}`.trim()
  } else if (subscription?.mobileNumber) {
    paymentMethod = `Mobile money — ${subscription.mobileNumber}`
  }

  return {
    invoiceNumber: `BED-${year}-${shortId}`,
    issueDate: formatDate(payment.createdAt),
    dueDate: formatDate(payment.createdAt),
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
    notes: 'Merci pour votre confiance. Cette facture est générée automatiquement par Bedones.',
  }
}
