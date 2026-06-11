import type {
  NotifMember,
  NotificationPreferenceRow,
  NotificationType,
  SocialProvider,
} from '../notification-preferences-api'

export const NETWORK_LABEL: Record<SocialProvider, string> = {
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  WHATSAPP: 'WhatsApp',
}

const TONES = ['#7c3aed', '#0ea5e9', '#f59e0b', '#10b981', '#ec4899', '#111b21']

export function toneFor(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return TONES[Math.abs(h) % TONES.length]
}

export function initialsOf(name: string) {
  const parts = name.replace(/^@/, '').match(/\b[\p{L}]/gu) || ['•']
  return parts.slice(0, 2).join('').toUpperCase()
}

function defaultEnabled(type: NotificationType) {
  return !type.endsWith('_AI_SUGGESTION') && !type.endsWith('_DAILY_SUMMARY')
}

export type PendingMap = Record<string, boolean>

export const pendingKey = (userId: string, socialAccountId: string, type: NotificationType) =>
  `${userId}|${socialAccountId}|${type}`

function effectiveEnabled(
  preferences: NotificationPreferenceRow[],
  pending: PendingMap,
  userId: string,
  socialAccountId: string,
  type: NotificationType,
) {
  const k = pendingKey(userId, socialAccountId, type)
  if (k in pending) return pending[k]
  const row = preferences.find(
    (p) => p.userId === userId && p.socialAccountId === socialAccountId && p.type === type,
  )
  return row ? row.enabled : defaultEnabled(type)
}

export function aggregateStatus(
  preferences: NotificationPreferenceRow[],
  pending: PendingMap,
  members: NotifMember[],
  socialAccountId: string,
  type: NotificationType,
): 'on' | 'off' | 'mixed' {
  let on = 0
  let off = 0
  for (const m of members) {
    if (effectiveEnabled(preferences, pending, m.id, socialAccountId, type)) on++
    else off++
  }
  if (on === members.length) return 'on'
  if (off === members.length) return 'off'
  return 'mixed'
}

export function splitByStatus(
  preferences: NotificationPreferenceRow[],
  pending: PendingMap,
  members: NotifMember[],
  socialAccountId: string,
  type: NotificationType,
) {
  const onUsers: NotifMember[] = []
  const offUsers: NotifMember[] = []
  for (const m of members) {
    if (effectiveEnabled(preferences, pending, m.id, socialAccountId, type)) onUsers.push(m)
    else offUsers.push(m)
  }
  return { onUsers, offUsers }
}
