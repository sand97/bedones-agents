/* ── Format helper ── */

export function formatPrice(price: number, currency: string) {
  return `${price.toLocaleString('fr-FR')} ${currency}`
}

export const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  LOW: { label: 'Basse', color: '#52c41a' },
  MEDIUM: { label: 'Moyenne', color: '#faad14' },
  HIGH: { label: 'Haute', color: '#fa8c16' },
  URGENT: { label: 'Urgente', color: '#f5222d' },
}

export const PROVIDER_CONFIG: Record<string, { label: string }> = {
  WHATSAPP: { label: 'WhatsApp' },
  INSTAGRAM: { label: 'Instagram' },
  FACEBOOK: { label: 'Facebook' },
  TIKTOK: { label: 'TikTok' },
}
