import { useTranslation } from 'react-i18next'
import { Tooltip } from 'antd'
import dayjs from 'dayjs'
import { DoubleCheckIcon, SingleCheckIcon } from '@app/components/icons/social-icons'
import type { Message } from '../mock-data'

export type ChatProvider = 'whatsapp' | 'instagram-dm' | 'messenger' | 'tiktok'

export function formatTime(timestamp: string): string {
  return dayjs(timestamp).format('HH:mm')
}

/* ── Linkified text ──
   Detects URLs in plain message text and renders them as clickable links.
   Long URLs (and any unbreakable token) wrap via the `chat-text` class so
   they don't widen the bubble beyond its max-width. */

const URL_SPLIT_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi
const URL_MATCH_REGEX = /^(https?:\/\/|www\.)/i

export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  // split() with a capturing group keeps the matched URLs in the result array,
  // alternating with the surrounding plain text.
  const parts = text.split(URL_SPLIT_REGEX)

  return (
    <p className={`chat-text m-0 text-sm text-text-primary ${className ?? ''}`}>
      {parts.map((part, i) => {
        if (!part) return null
        if (URL_MATCH_REGEX.test(part)) {
          const href = part.startsWith('http') ? part : `https://${part}`
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="chat-text-link"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </p>
  )
}

function formatDateLabel(timestamp: string, t: (key: string) => string): string {
  const date = dayjs(timestamp)
  const now = dayjs()

  if (date.isSame(now, 'day')) return t('date.today')
  if (date.isSame(now.subtract(1, 'day'), 'day')) return t('date.yesterday')
  return date.format('D MMMM')
}

export function groupMessagesByDate(
  messages: Message[],
  t: (key: string) => string,
): { date: string; messages: Message[] }[] {
  const groups: { date: string; messages: Message[] }[] = []

  for (const msg of messages) {
    const label = formatDateLabel(msg.timestamp, t)
    const last = groups[groups.length - 1]

    if (last && last.date === label) {
      last.messages.push(msg)
    } else {
      groups.push({ date: label, messages: [msg] })
    }
  }

  return groups
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

export function formatProductPrice(price?: number | null, currency?: string | null): string {
  if (price == null) return ''
  const rounded = Math.round(price * 100) / 100
  const formatted = rounded.toLocaleString('fr-FR', {
    minimumFractionDigits: rounded % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
  return currency ? `${formatted} ${currency}` : formatted
}

/** Delivery status check marks for WhatsApp outgoing messages */
export function DeliveryCheck({
  deliveryStatus,
  provider,
  isRead,
}: {
  deliveryStatus?: 'sent' | 'delivered' | 'read'
  provider?: ChatProvider
  isRead: boolean
}) {
  const { t } = useTranslation()
  // WhatsApp: use deliveryStatus for granular check marks
  if (provider === 'whatsapp' && deliveryStatus) {
    if (deliveryStatus === 'read') {
      return (
        <Tooltip title="Lu">
          <DoubleCheckIcon width={14} height={14} className="text-text-muted" />
        </Tooltip>
      )
    }
    if (deliveryStatus === 'delivered') {
      return (
        <Tooltip title={t('chat.delivered')}>
          <DoubleCheckIcon width={14} height={14} className="text-text-muted" />
        </Tooltip>
      )
    }
    return (
      <Tooltip title={t('chat.sent')}>
        <SingleCheckIcon width={14} height={14} className="text-text-muted" />
      </Tooltip>
    )
  }

  // Default: double check when read (Messenger/Instagram behavior)
  if (isRead) {
    return <DoubleCheckIcon width={14} height={14} className="text-text-muted" />
  }
  return null
}
