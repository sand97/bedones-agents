import { MessageCircle, MessageSquare, Bot } from 'lucide-react'

export type Period = 'week' | 'month' | 'year'

export interface TimeSeriesPoint {
  label: string
  messages: number
  commentaires: number
  credits: number
}

export const PERIOD_CONFIG: Record<Period, { label: string }> = {
  week: { label: 'Semaine' },
  month: { label: 'Mois' },
  year: { label: 'Année' },
}

export const SERIES_CONFIG = [
  { key: 'messages' as const, label: 'Messages', color: '#6366f1' },
  { key: 'commentaires' as const, label: 'Commentaires', color: '#f59e0b' },
  { key: 'credits' as const, label: 'Crédits IA', color: '#10b981' },
]

export const CREDIT_USAGE = {
  used: 7_420,
  total: 10_000,
  label: 'crédits IA',
}

export const STATS_BY_PERIOD: Record<
  Period,
  { label: string; value: number; change: number; icon: typeof MessageCircle }[]
> = {
  week: [
    { label: 'Commentaires', value: 342, change: 12, icon: MessageCircle },
    { label: 'Messages', value: 1_287, change: -5, icon: MessageSquare },
    { label: 'Réponses IA', value: 986, change: 18, icon: Bot },
  ],
  month: [
    { label: 'Commentaires', value: 1_480, change: 8, icon: MessageCircle },
    { label: 'Messages', value: 5_320, change: 3, icon: MessageSquare },
    { label: 'Réponses IA', value: 4_100, change: 15, icon: Bot },
  ],
  year: [
    { label: 'Commentaires', value: 18_200, change: 22, icon: MessageCircle },
    { label: 'Messages', value: 64_500, change: 14, icon: MessageSquare },
    { label: 'Réponses IA', value: 49_800, change: 31, icon: Bot },
  ],
}

export const TIME_SERIES: Record<Period, TimeSeriesPoint[]> = {
  week: [
    { label: 'Lun', messages: 180, commentaires: 42, credits: 120 },
    { label: 'Mar', messages: 210, commentaires: 58, credits: 145 },
    { label: 'Mer', messages: 165, commentaires: 35, credits: 98 },
    { label: 'Jeu', messages: 240, commentaires: 62, credits: 170 },
    { label: 'Ven', messages: 195, commentaires: 48, credits: 132 },
    { label: 'Sam', messages: 150, commentaires: 55, credits: 88 },
    { label: 'Dim', messages: 147, commentaires: 42, credits: 75 },
  ],
  month: [
    { label: 'S1', messages: 820, commentaires: 210, credits: 580 },
    { label: 'S2', messages: 950, commentaires: 280, credits: 670 },
    { label: 'S3', messages: 1_100, commentaires: 320, credits: 780 },
    { label: 'S4', messages: 1_287, commentaires: 342, credits: 860 },
  ],
  year: [
    { label: 'Jan', messages: 4_200, commentaires: 1_100, credits: 2_800 },
    { label: 'Fév', messages: 3_800, commentaires: 980, credits: 2_500 },
    { label: 'Mar', messages: 4_500, commentaires: 1_250, credits: 3_100 },
    { label: 'Avr', messages: 5_100, commentaires: 1_400, credits: 3_600 },
    { label: 'Mai', messages: 4_800, commentaires: 1_300, credits: 3_200 },
    { label: 'Jun', messages: 5_500, commentaires: 1_550, credits: 3_900 },
    { label: 'Jul', messages: 5_200, commentaires: 1_420, credits: 3_700 },
    { label: 'Aoû', messages: 4_600, commentaires: 1_200, credits: 3_000 },
    { label: 'Sep', messages: 5_800, commentaires: 1_600, credits: 4_100 },
    { label: 'Oct', messages: 6_200, commentaires: 1_750, credits: 4_500 },
    { label: 'Nov', messages: 5_900, commentaires: 1_650, credits: 4_200 },
    { label: 'Déc', messages: 5_320, commentaires: 1_480, credits: 3_800 },
  ],
}

export const MESSAGES_BY_NETWORK = [
  { name: 'WhatsApp', value: 520, color: 'var(--color-brand-whatsapp)' },
  { name: 'Instagram', value: 380, color: 'var(--color-brand-instagram)' },
  { name: 'Messenger', value: 287, color: 'var(--color-brand-messenger)' },
  { name: 'Facebook', value: 100, color: 'var(--color-brand-facebook)' },
]

export const COMMENTS_BY_NETWORK = [
  { name: 'Facebook', value: 156, color: 'var(--color-brand-facebook)' },
  { name: 'Instagram', value: 124, color: 'var(--color-brand-instagram)' },
  { name: 'TikTok', value: 62, color: 'var(--color-brand-tiktok)' },
]

export const TOOLTIP_LABELS: Record<string, string> = {
  messages: 'Messages',
  commentaires: 'Commentaires',
  credits: 'Crédits IA',
}
