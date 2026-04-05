import type { ReactNode } from 'react'
import { useState, useMemo } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Button, Popover, Checkbox } from 'antd'
import { MessageCircle } from 'lucide-react'
import { ConversationList } from './conversation-list'
import { ChatWindow } from './chat-window'
import { SocialSetup } from '@app/components/social/social-setup'
import {
  WhatsAppIcon,
  InstagramIcon,
  MessengerIcon,
  LabelBadgeIcon,
} from '@app/components/icons/social-icons'
import { ConversationListSkeleton, ChatWindowSkeleton } from './chat-skeleton'
import type { Conversation } from './mock-data'
import { AVAILABLE_LABELS } from './mock-data'

type ChatProvider = 'whatsapp' | 'instagram-dm' | 'messenger'

const PROVIDER_EMPTY_STATE: Record<
  ChatProvider,
  { icon: ReactNode; color: string; noConvTitle: string; selectTitle: string; selectDesc: string }
> = {
  whatsapp: {
    icon: <WhatsAppIcon width={40} height={40} />,
    color: 'var(--color-brand-whatsapp)',
    noConvTitle: 'Aucune conversation',
    selectTitle: 'Sélectionnez une conversation',
    selectDesc: 'Choisissez un contact dans la liste pour voir ses messages WhatsApp',
  },
  'instagram-dm': {
    icon: <InstagramIcon width={40} height={40} />,
    color: 'var(--color-brand-instagram)',
    noConvTitle: 'Aucun message reçu',
    selectTitle: 'Sélectionnez une conversation',
    selectDesc: 'Choisissez un contact dans la liste pour voir ses messages Instagram',
  },
  messenger: {
    icon: <MessengerIcon width={40} height={40} />,
    color: 'var(--color-brand-messenger)',
    noConvTitle: 'Aucun message reçu',
    selectTitle: 'Sélectionnez une conversation',
    selectDesc: 'Choisissez un contact dans la liste pour voir ses messages Messenger',
  },
}

interface ChatLayoutProps {
  conversations: Conversation[]
  loading?: boolean
  provider?: ChatProvider
  onSend?: (
    message: string,
    media?: { url: string; type: 'image' | 'video' | 'audio' | 'file' },
    replyToId?: string,
  ) => Promise<void>
  onUploadAndSend?: (
    file: File,
    type: 'image' | 'video' | 'audio' | 'file',
    replyToId?: string,
  ) => Promise<void>
  onSelectConversation?: (convId: string) => void
  onSync?: () => void
  syncing?: boolean
  onRetry?: (messageId: string) => void
}

/* ── Labels filter popover ── */

function LabelsFilterPopover({
  selectedLabelIds,
  onToggle,
  children,
}: {
  selectedLabelIds: string[]
  onToggle: (labelId: string) => void
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover
      content={
        <div className="flex w-48 flex-col gap-0.5">
          <div className="px-3 py-2 text-xs font-semibold text-text-muted">Filtrer par label</div>
          {AVAILABLE_LABELS.map((label) => (
            <Button
              key={label.id}
              type="text"
              block
              onClick={() => onToggle(label.id)}
              className="py-2!"
            >
              <Checkbox checked={selectedLabelIds.includes(label.id)} />
              <LabelBadgeIcon
                width={12}
                height={12}
                style={{ color: label.color }}
                className="flex-shrink-0"
              />
              <span className="flex-1 truncate">{label.name}</span>
            </Button>
          ))}
        </div>
      }
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomLeft"
      overlayClassName="org-switcher-popover"
      arrow={false}
    >
      {children}
    </Popover>
  )
}

export function ChatLayout({
  conversations,
  loading = false,
  provider = 'whatsapp',
  onSend,
  onUploadAndSend,
  onSelectConversation,
  onSync: _onSync,
  syncing: _syncing,
  onRetry,
}: ChatLayoutProps) {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { conv?: string }
  const providerConfig = PROVIDER_EMPTY_STATE[provider]
  const selectedConvId = search.conv
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([])

  const selectedConversation = conversations.find((c) => c.id === selectedConvId)

  const selectConversation = (conv: Conversation) => {
    if (onSelectConversation) {
      onSelectConversation(conv.id)
    } else {
      navigate({ search: { conv: conv.id } as never })
    }
  }

  const toggleLabel = (labelId: string) => {
    setSelectedLabelIds((prev) =>
      prev.includes(labelId) ? prev.filter((id) => id !== labelId) : [...prev, labelId],
    )
  }

  const filteredConversations = useMemo(() => {
    let result = conversations
    if (filter === 'unread') {
      result = result.filter((c) => c.unreadCount > 0)
    }
    if (selectedLabelIds.length > 0) {
      result = result.filter((c) => c.labels.some((l) => selectedLabelIds.includes(l.id)))
    }
    return result
  }, [conversations, filter, selectedLabelIds])

  if (loading) {
    return (
      <div className="chat-split">
        <div className="chat-split__left">
          <ConversationListSkeleton />
        </div>
        <div className="chat-split__right chat-split__right--visible">
          <ChatWindowSkeleton />
        </div>
      </div>
    )
  }

  return (
    <div className="chat-split">
      {/* Left: conversation list */}
      <div
        className={`chat-split__left ${selectedConversation ? 'chat-split__left--hidden-mobile' : ''}`}
      >
        {/* Filter bar */}
        <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3.5">
          <Button
            type={filter === 'all' ? 'primary' : 'default'}
            size="small"
            onClick={() => setFilter('all')}
            className="comments-filter-btn"
          >
            Tout
          </Button>
          <Button
            type={filter === 'unread' ? 'primary' : 'default'}
            size="small"
            onClick={() => setFilter('unread')}
            className="comments-filter-btn"
          >
            Non lus
          </Button>
          <LabelsFilterPopover selectedLabelIds={selectedLabelIds} onToggle={toggleLabel}>
            <Button
              type={selectedLabelIds.length > 0 ? 'primary' : 'default'}
              size="small"
              className="comments-filter-btn"
            >
              Labels{selectedLabelIds.length > 0 ? ` (${selectedLabelIds.length})` : ''}
            </Button>
          </LabelsFilterPopover>
        </div>

        <div className="flex-1 overflow-y-auto">
          <ConversationList
            conversations={filteredConversations}
            selectedId={selectedConvId}
            onSelect={selectConversation}
          />
        </div>
      </div>

      {/* Right: chat window */}
      <div
        className={`chat-split__right ${selectedConversation ? 'chat-split__right--visible' : ''}`}
      >
        {selectedConversation ? (
          <ChatWindow
            conversation={selectedConversation}
            provider={provider}
            onSend={onSend}
            onUploadAndSend={onUploadAndSend}
            onRetry={onRetry}
          />
        ) : conversations.length === 0 ? (
          <SocialSetup
            icon={<MessageCircle size={40} strokeWidth={1.5} />}
            color={providerConfig.color}
            title={providerConfig.noConvTitle}
            description="Les conversations apparaîtront ici dès qu'un message sera reçu"
          />
        ) : (
          <SocialSetup
            icon={providerConfig.icon}
            color={providerConfig.color}
            title={providerConfig.selectTitle}
            description={providerConfig.selectDesc}
          />
        )}
      </div>
    </div>
  )
}
