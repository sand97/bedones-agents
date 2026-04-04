import { useMemo, useRef, useEffect, useCallback } from 'react'
import { Avatar, Popover, Button } from 'antd'
import { Play, Pause, ShoppingBag, ImageIcon, Film, Copy, Check } from 'lucide-react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useState } from 'react'
import { DoubleCheckIcon, OptionsIcon } from '@app/components/icons/social-icons'
import type { Conversation, Message, Ticket } from './mock-data'
import { TicketCard } from './ticket-card'
import { TicketDrawer } from './ticket-drawer'
import { ChatInput } from './chat-input'

interface ChatWindowProps {
  conversation: Conversation
  onSend?: (message: string) => Promise<void>
}

function formatTime(timestamp: string): string {
  return dayjs(timestamp).format('HH:mm')
}

function formatDateLabel(timestamp: string): string {
  const date = dayjs(timestamp)
  const now = dayjs()

  if (date.isSame(now, 'day')) return "Aujourd'hui"
  if (date.isSame(now.subtract(1, 'day'), 'day')) return 'Hier'
  return date.format('D MMMM')
}

function groupMessagesByDate(messages: Message[]): { date: string; messages: Message[] }[] {
  const groups: { date: string; messages: Message[] }[] = []

  for (const msg of messages) {
    const label = formatDateLabel(msg.timestamp)
    const last = groups[groups.length - 1]

    if (last && last.date === label) {
      last.messages.push(msg)
    } else {
      groups.push({ date: label, messages: [msg] })
    }
  }

  return groups
}

/* ── Audio message player ── */

function AudioPlayer({ duration }: { duration: number }) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!playing) return
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          setPlaying(false)
          return 0
        }
        return p + 100 / (duration * 10)
      })
    }, 100)
    return () => clearInterval(interval)
  }, [playing, duration])

  return (
    <div className="flex items-center gap-3">
      <Button
        type="text"
        shape="circle"
        onClick={() => setPlaying(!playing)}
        icon={playing ? <Pause size={14} /> : <Play size={14} />}
        className="flex-shrink-0 border border-text-primary text-text-primary!"
      />
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-bg-muted">
        <div
          className="h-full rounded-full bg-text-primary transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

/* ── Reply context preview ── */

function ReplyContextBubble({
  replyTo,
  isOutgoing,
  onClick,
}: {
  replyTo: Message['replyTo']
  isOutgoing: boolean
  onClick?: () => void
}) {
  if (!replyTo) return null

  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-1 w-full rounded-xl rounded-b-md border-l-2 px-2.5 py-1.5 text-xs text-left border-none cursor-pointer transition-colors ${
        isOutgoing
          ? 'border-l-text-primary/30 bg-text-primary/8 text-text-secondary hover:bg-text-primary/12'
          : 'border-l-text-primary/30 bg-bg-subtle text-text-secondary hover:bg-bg-muted'
      }`}
      style={{
        borderLeftWidth: 2,
        borderLeftStyle: 'solid',
        borderLeftColor: isOutgoing ? 'rgba(17,27,33,0.3)' : 'rgba(17,27,33,0.3)',
      }}
    >
      <div className="font-semibold text-text-primary">
        {replyTo.from === 'business' ? 'Vous' : 'Client'}
      </div>
      <div className="truncate">{replyTo.text}</div>
    </button>
  )
}

/* ── Message bubble ── */

function MessageBubble({
  message,
  position,
  onScrollToMessage,
}: {
  message: Message
  position: 'first' | 'middle' | 'last' | 'single'
  onScrollToMessage?: (id: string) => void
}) {
  const isOutgoing = message.from === 'business'
  const hasMedia =
    message.type === 'image' || message.type === 'video' || message.type === 'catalog'

  const bubbleClasses = [
    'chat-bubble',
    isOutgoing ? 'chat-bubble--outgoing' : 'chat-bubble--incoming',
    hasMedia || message.replyTo ? 'chat-bubble--media' : '',
    message.type === 'audio' ? 'chat-bubble--audio' : '',
    // Stacking classes
    isOutgoing ? `chat-bubble--outgoing-${position}` : `chat-bubble--incoming-${position}`,
  ]
    .filter(Boolean)
    .join(' ')

  const handleContextClick = () => {
    if (message.replyTo && onScrollToMessage) {
      onScrollToMessage(message.replyTo.id)
    }
  }

  const renderContent = () => {
    switch (message.type) {
      case 'audio':
        return <AudioPlayer duration={message.audioDuration || 0} />

      case 'image':
        return (
          <div>
            <div className="chat-media-container">
              <div className="chat-media-placeholder">
                <ImageIcon size={32} />
              </div>
              <img
                src={message.imageUrl}
                alt=""
                className="relative z-1 max-h-64 w-full rounded-control object-cover"
              />
            </div>
            {message.imageCaption && (
              <p className="m-0 mt-2 text-sm text-text-primary">{message.imageCaption}</p>
            )}
          </div>
        )

      case 'video':
        return (
          <div>
            <div className="chat-media-container">
              <div className="chat-media-placeholder">
                <Film size={32} />
              </div>
              <img
                src={message.videoThumbnail}
                alt=""
                className="relative z-1 max-h-48 w-full rounded-control object-cover"
              />
              <div className="absolute inset-0 z-2 flex items-center justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50">
                  <Play size={20} className="ml-1 text-white" fill="white" />
                </div>
              </div>
            </div>
            {message.text && <p className="m-0 mt-2 text-sm text-text-primary">{message.text}</p>}
          </div>
        )

      case 'catalog':
        if (!message.catalogItem) return null
        return (
          <div className="overflow-hidden rounded-lg">
            <img src={message.catalogItem.imageUrl} alt="" className="h-32 w-full object-cover" />
            <div className="p-2 pt-4">
              <div className="flex items-start gap-2">
                <ShoppingBag size={14} className="mt-0.5 flex-shrink-0 text-text-muted" />
                <div className="text-sm font-semibold text-text-primary">
                  {message.catalogItem.title}
                </div>
              </div>
              <div className="mt-0.5 text-xs text-text-muted">
                {message.catalogItem.description}
              </div>
              <div className="mt-1 text-sm font-bold text-text-primary">
                {message.catalogItem.price}
              </div>
            </div>
          </div>
        )

      case 'button':
        return (
          <div>
            {message.buttonHeader && (
              <div className="mb-1 text-xs font-semibold text-text-muted">
                {message.buttonHeader}
              </div>
            )}
            {message.text && <p className="m-0 mb-2 text-sm text-text-primary">{message.text}</p>}
            <div className="flex flex-col gap-1.5">
              {message.buttons?.map((btn) => (
                <Button key={btn.id} block className="text-center text-xs">
                  {btn.label}
                </Button>
              ))}
            </div>
          </div>
        )

      default:
        return message.text ? <p className="m-0 text-sm text-text-primary">{message.text}</p> : null
    }
  }

  return (
    <div
      id={`msg-${message.id}`}
      className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'} chat-message-row`}
      data-from={message.from}
    >
      <div className={bubbleClasses}>
        {message.replyTo && (
          <ReplyContextBubble
            replyTo={message.replyTo}
            isOutgoing={isOutgoing}
            onClick={handleContextClick}
          />
        )}
        {renderContent()}
        <div
          className={`pl-11 mt-1 flex items-center text-[10px] text-text-muted ${message.type === 'audio' ? 'justify-between' : 'justify-end gap-1'}`}
        >
          {message.type === 'audio' && message.audioDuration != null && (
            <span>
              {Math.floor(message.audioDuration / 60)}:
              {(message.audioDuration % 60).toString().padStart(2, '0')}
            </span>
          )}
          <span className="flex items-center gap-1">
            {formatTime(message.timestamp)}
            {isOutgoing && message.isRead && (
              <DoubleCheckIcon width={14} height={14} className="text-text-muted" />
            )}
          </span>
        </div>
      </div>
    </div>
  )
}

/* ── Chat header with copy-phone option ── */

function ChatHeader({ conversation }: { conversation: Conversation }) {
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(conversation.contact.phone)
    setCopied(true)
    setTimeout(() => {
      setCopied(false)
      setOptionsOpen(false)
    }, 1200)
  }

  return (
    <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-2.5">
      <Avatar src={conversation.contact.avatarUrl} size={36} className="flex-shrink-0">
        {conversation.contact.name[0]}
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-text-primary">{conversation.contact.name}</div>
        <div className="text-xs text-text-muted">{conversation.contact.phone}</div>
      </div>

      {/* Options menu */}
      <Popover
        content={
          <div className="w-56">
            <Button
              type="text"
              block
              onClick={handleCopy}
              icon={copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              className="py-2.5!"
            >
              {copied ? 'Copié !' : `Copier ${conversation.contact.phone}`}
            </Button>
          </div>
        }
        trigger="click"
        open={optionsOpen}
        onOpenChange={setOptionsOpen}
        placement="bottomRight"
        overlayClassName="org-switcher-popover"
        arrow={false}
      >
        <Button
          type="text"
          icon={<OptionsIcon width={18} height={18} />}
          className="flex-shrink-0"
        />
      </Popover>
    </div>
  )
}

/* ── Main component ── */

export function ChatWindow({ conversation, onSend }: ChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { conv?: string; ticket?: string }

  const drawerTicket = useMemo(
    () => conversation.tickets.find((t) => t.id === search.ticket) || null,
    [conversation.tickets, search.ticket],
  )

  const openTicket = useCallback(
    (ticket: Ticket) => {
      navigate({ search: { conv: search.conv, ticket: ticket.id } as never })
    },
    [navigate, search.conv],
  )

  const closeTicket = useCallback(() => {
    navigate({ search: { conv: search.conv } as never })
  }, [navigate, search.conv])

  const groups = useMemo(() => groupMessagesByDate(conversation.messages), [conversation.messages])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [conversation.id])

  const scrollToMessage = useCallback((messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('chat-message-highlight')
      setTimeout(() => el.classList.remove('chat-message-highlight'), 1500)
    }
  }, [])

  const allMessages = conversation.messages

  const getPosition = (
    index: number,
    messages: Message[],
  ): 'first' | 'middle' | 'last' | 'single' => {
    const current = messages[index]
    const prev = messages[index - 1]
    const next = messages[index + 1]
    const samePrev = prev && prev.from === current.from
    const sameNext = next && next.from === current.from

    if (samePrev && sameNext) return 'middle'
    if (samePrev) return 'last'
    if (sameNext) return 'first'
    return 'single'
  }

  // Tickets are only shown as sticky, not inline

  // Show the most recent active (non-resolved, non-cancelled) ticket pinned
  const activeTicket = useMemo(() => {
    const active = conversation.tickets.filter(
      (t) => t.status !== 'resolved' && t.status !== 'cancelled',
    )
    return active.length > 0 ? active[active.length - 1] : null
  }, [conversation.tickets])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ChatHeader conversation={conversation} />

      {/* Sticky pinned ticket — most recent active */}
      {activeTicket && (
        <div className="ticket-sticky-bar">
          <TicketCard ticket={activeTicket} onClick={openTicket} />
        </div>
      )}

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-2">
        {groups.map((group) => (
          <div key={group.date}>
            <div className="flex items-center justify-center py-3">
              <span className="rounded-full bg-bg-subtle px-3 py-1 text-xs text-text-muted">
                {group.date}
              </span>
            </div>
            {group.messages.map((msg) => {
              const globalIndex = allMessages.indexOf(msg)
              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  position={getPosition(globalIndex, allMessages)}
                  onScrollToMessage={scrollToMessage}
                />
              )
            })}
          </div>
        ))}
      </div>

      {/* Input area */}
      <ChatInput onSend={onSend} />

      {/* Ticket drawer */}
      <TicketDrawer
        ticket={drawerTicket}
        allTickets={conversation.tickets}
        open={!!drawerTicket}
        onClose={closeTicket}
        onSwitchTicket={openTicket}
      />
    </div>
  )
}
