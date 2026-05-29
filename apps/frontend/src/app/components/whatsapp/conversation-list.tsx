import {
  AppstoreOutlined,
  AudioOutlined,
  EnvironmentOutlined,
  FileOutlined,
  MessageOutlined,
  PaperClipOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  QuestionCircleOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  SmileOutlined,
  ThunderboltOutlined,
  UserOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import { Avatar, Badge } from 'antd'
import dayjs from 'dayjs'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LabelBadgeIcon } from '@app/components/icons/social-icons'
import { getAvatarColor } from '@app/lib/avatar-color'
import type { Conversation } from './mock-data'

interface ConversationListProps {
  conversations: Conversation[]
  selectedId?: string
  onSelect: (conversation: Conversation) => void
}

function formatLastMessageTime(timestamp: string): string {
  const date = dayjs(timestamp)
  const now = dayjs()

  if (date.isSame(now, 'day')) return date.format('HH:mm')
  if (date.isSame(now.subtract(1, 'day'), 'day')) return 'Hier'
  return date.format('DD/MM/YYYY')
}

type PreviewKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'file'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'order'
  | 'button'
  | 'interactive'
  | 'template'
  | 'product'
  | 'products'
  | 'catalog'
  | 'tiktok_post'
  | 'unsupported'
  | 'message'

const PREVIEW_ICONS: Record<PreviewKind, ReactNode> = {
  image: <PictureOutlined />,
  video: <VideoCameraOutlined />,
  audio: <AudioOutlined />,
  file: <PaperClipOutlined />,
  document: <FileOutlined />,
  sticker: <SmileOutlined />,
  location: <EnvironmentOutlined />,
  contact: <UserOutlined />,
  order: <ShoppingCartOutlined />,
  button: <ThunderboltOutlined />,
  interactive: <ThunderboltOutlined />,
  template: <MessageOutlined />,
  product: <ShoppingOutlined />,
  products: <ShoppingOutlined />,
  catalog: <AppstoreOutlined />,
  tiktok_post: <PlayCircleOutlined />,
  unsupported: <QuestionCircleOutlined />,
  message: <MessageOutlined />,
}

interface ParsedPreview {
  kind: PreviewKind
  count?: number
  emoji?: string
}

function parsePreviewToken(text: string): ParsedPreview | null {
  const match = /^\[([^\]]+)\]$/.exec(text.trim())
  if (!match) return null

  // Preserve case for the emoji payload; lowercase the rest.
  const innerRaw = match[1].trim()
  const raw = innerRaw.toLowerCase()
  if (!raw) return null

  // "[reaction:👍]" — emoji is kept as-is so it can be rendered next to the label.
  if (raw.startsWith('reaction:')) {
    const emoji = innerRaw.slice('reaction:'.length).trim()
    return { kind: 'message', emoji }
  }

  // "[3 products]"
  const productCount = /^(\d+)\s+products?$/.exec(raw)
  if (productCount) {
    return { kind: 'products', count: Number(productCount[1]) }
  }

  // "[template:NAME]"
  if (raw.startsWith('template:') || raw === 'template') {
    return { kind: 'template' }
  }

  if (raw === 'tiktok post') return { kind: 'tiktok_post' }
  if (raw === 'mark read' || raw === 'typing') return null

  const direct: PreviewKind | null = (() => {
    switch (raw) {
      case 'image':
        return 'image'
      case 'video':
        return 'video'
      case 'audio':
        return 'audio'
      case 'file':
        return 'file'
      case 'document':
        return 'document'
      case 'sticker':
        return 'sticker'
      case 'location':
        return 'location'
      case 'contact':
        return 'contact'
      case 'order':
        return 'order'
      case 'button':
        return 'button'
      case 'interactive':
        return 'interactive'
      case 'product':
        return 'product'
      case 'catalog':
        return 'catalog'
      case 'unsupported':
        return 'unsupported'
      default:
        return null
    }
  })()

  return { kind: direct ?? 'message' }
}

function MessagePreview({ text }: { text: string }) {
  const { t } = useTranslation()

  if (!text) return null

  const parsed = parsePreviewToken(text)
  if (!parsed) {
    return <>{text}</>
  }

  // Reaction: render the emoji itself in place of the icon, with a "reaction" label.
  if (parsed.emoji) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="inline-flex items-center">{parsed.emoji}</span>
        <span>{t('chat.preview_reaction')}</span>
      </span>
    )
  }

  const label =
    parsed.kind === 'products'
      ? t('chat.preview_products', { count: parsed.count ?? 0 })
      : t(`chat.preview_${parsed.kind}`)

  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex items-center text-text-muted">{PREVIEW_ICONS[parsed.kind]}</span>
      <span>{label}</span>
    </span>
  )
}

export function ConversationList({ conversations, selectedId, onSelect }: ConversationListProps) {
  const sorted = [...conversations].sort((a, b) => {
    if (a.unreadCount > 0 && b.unreadCount === 0) return -1
    if (a.unreadCount === 0 && b.unreadCount > 0) return 1
    return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
  })

  return (
    <div className="flex flex-col">
      {sorted.map((conv) => {
        const isSelected = conv.id === selectedId
        const hasUnread = conv.unreadCount > 0

        return (
          <button
            key={conv.id}
            type="button"
            onClick={() => onSelect(conv)}
            className={`chat-conv-item ${isSelected ? 'chat-conv-item--active' : ''}`}
          >
            <Avatar
              src={conv.contact.avatarUrl}
              size={44}
              className="flex-shrink-0"
              style={{ backgroundColor: getAvatarColor(conv.contact.id || conv.contact.name) }}
            >
              {conv.contact.name[0]}
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`truncate text-sm ${hasUnread ? 'font-semibold text-text-primary' : 'font-medium text-text-primary'}`}
                  >
                    {conv.contact.name}
                  </span>
                  {/* Label badges */}
                  <span className={'flex items-center pl-1'}>
                    {conv.labels.map((label) => (
                      <LabelBadgeIcon
                        key={label.id}
                        width={10}
                        height={10}
                        style={{ color: label.color }}
                        className="flex-shrink-0 -ml-1"
                      />
                    ))}
                  </span>
                  {hasUnread && (
                    <Badge
                      count={conv.unreadCount}
                      size="small"
                      color="#111b21"
                      className="flex-shrink-0"
                    />
                  )}
                </span>
                <span
                  className={`flex-shrink-0 text-xs ${hasUnread ? 'font-semibold text-text-primary' : 'text-text-muted'}`}
                >
                  {formatLastMessageTime(conv.lastMessageTime)}
                </span>
              </div>
              <span
                className={`truncate text-xs ${hasUnread ? 'font-medium text-text-primary' : 'text-text-muted'}`}
              >
                <MessagePreview text={conv.lastMessage} />
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
