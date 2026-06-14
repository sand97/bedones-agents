// Données bidon pour comparer les 3 générateurs de PDF de facture
// (pdfmake / Puppeteer / Gotenberg). Endpoints de démo temporaires — à supprimer
// une fois l'outil retenu.

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

export const DEMO_INVOICE: InvoiceData = {
  invoiceNumber: 'BED-2026-000142',
  issueDate: '14 juin 2026',
  dueDate: '14 juillet 2026',
  seller: {
    name: 'Bedones SAS',
    address: 'Akwa, Douala, Cameroun',
    email: 'facturation@bedones.com',
    taxId: 'M061234567890X',
  },
  client: {
    name: 'Brice Guenkam',
    org: 'Boutique Le Bon Prix',
    email: 'brice@lebonprix.cm',
    phone: '+237 6 57 88 86 90',
  },
  currency: 'USD',
  items: [
    {
      description: 'Forfait Pro — 6 mois (1000 crédits/mois)',
      quantity: 1,
      unitPrice: 48,
      total: 48,
    },
    {
      description: 'Crédits supplémentaires (pack de 1000)',
      quantity: 2,
      unitPrice: 10,
      total: 20,
    },
  ],
  subtotal: 68,
  taxRate: 0,
  taxAmount: 0,
  total: 68,
  paymentMethod: 'Carte Visa •••• 4242',
  notes: 'Merci pour votre confiance. Cette facture est générée automatiquement.',
}

export function formatMoney(amount: number, currency: string): string {
  return `${amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}
