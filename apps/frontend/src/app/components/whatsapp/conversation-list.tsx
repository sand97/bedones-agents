import { Avatar, Badge } from 'antd'
import dayjs from 'dayjs'
import { LabelBadgeIcon } from '@app/components/icons/social-icons'
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
            <Avatar src={conv.contact.avatarUrl} size={44} className="flex-shrink-0">
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
                {conv.lastMessage}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
