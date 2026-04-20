import { MessageCircle, MessageSquare, Bot } from 'lucide-react'

export type Period = 'week' | 'month' | 'year'

export interface TimeSeriesPoint {
  label: string
  messages: number
  commentaires: number
  credits: number
}

export const PERIOD_CONFIG: Record<Period, { label: string; bucket: 'day' | 'week' | 'month' }> = {
  week: { label: 'Semaine', bucket: 'day' },
  month: { label: 'Mois', bucket: 'week' },
  year: { label: 'Année', bucket: 'month' },
}

export const SERIES_CONFIG = [
  { key: 'messages' as const, label: 'Messages', color: '#6366f1' },
  { key: 'commentaires' as const, label: 'Commentaires', color: '#f59e0b' },
  { key: 'credits' as const, label: 'Crédits IA', color: '#10b981' },
]

export const STAT_CARD_ICONS = {
  comments: MessageCircle,
  messages: MessageSquare,
  aiResponses: Bot,
} as const

export const STAT_CARD_LABELS = {
  comments: 'Commentaires',
  messages: 'Messages',
  aiResponses: 'Réponses IA',
} as const

export const MESSAGE_NETWORK_DISPLAY: Record<string, { name: string; color: string }> = {
  WHATSAPP: { name: 'WhatsApp', color: 'var(--color-brand-whatsapp)' },
  INSTAGRAM: { name: 'Instagram', color: 'var(--color-brand-instagram)' },
  FACEBOOK: { name: 'Messenger', color: 'var(--color-brand-messenger)' },
}

export const COMMENT_NETWORK_DISPLAY: Record<string, { name: string; color: string }> = {
  FACEBOOK: { name: 'Facebook', color: 'var(--color-brand-facebook)' },
  INSTAGRAM: { name: 'Instagram', color: 'var(--color-brand-instagram)' },
  TIKTOK: { name: 'TikTok', color: 'var(--color-brand-tiktok)' },
}

export const TOOLTIP_LABELS: Record<string, string> = {
  messages: 'Messages',
  commentaires: 'Commentaires',
  credits: 'Crédits IA',
}
