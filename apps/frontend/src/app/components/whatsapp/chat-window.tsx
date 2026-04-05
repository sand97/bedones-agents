import { useMemo, useRef, useEffect, useCallback, useState } from 'react'
import { Avatar, Popover, Button, Spin } from 'antd'
import {
  Play,
  Pause,
  ShoppingBag,
  ImageIcon,
  Copy,
  Check,
  FileText,
  RotateCcw,
  Reply,
} from 'lucide-react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { DoubleCheckIcon, OptionsIcon } from '@app/components/icons/social-icons'
import type { Conversation, Message, Ticket } from './mock-data'
import { TicketCard } from './ticket-card'
import { TicketDrawer } from './ticket-drawer'
import { ChatInput } from './chat-input'

type ChatProvider = 'whatsapp' | 'instagram-dm' | 'messenger'

interface ChatWindowProps {
  conversation: Conversation
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
  onRetry?: (messageId: string) => void
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

function AudioPlayer({
  audioUrl,
  timestamp,
  isOutgoing,
  isSending,
  isError,
  isRead,
  onRetry,
}: {
  audioUrl?: string
  timestamp?: string
  isOutgoing?: boolean
  isSending?: boolean
  isError?: boolean
  isRead?: boolean
  onRetry?: () => void
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTimeUpdate = () => {
      if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100)
    }
    const onLoadedMetadata = () => setDuration(audio.duration)
    const onEnded = () => {
      setPlaying(false)
      setProgress(0)
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('ended', onEnded)
    }
  }, [])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
    } else {
      audio.play()
    }
    setPlaying(!playing)
  }

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60)
    const secs = Math.floor(s % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex flex-col gap-1">
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}
      <div className="flex items-center gap-3">
        <Button
          type="text"
          shape="circle"
          onClick={togglePlay}
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
      <div className="flex items-center justify-between pl-13 text-[10px] text-text-muted">
        <span>{duration > 0 ? formatDuration(duration) : '0:00'}</span>
        {isError ? (
          <Button
            type={'text'}
            danger
            size="small"
            iconPosition={'end'}
            onClick={onRetry}
            icon={<RotateCcw size={10} />}
          >
            Non envoyé · Réessayer
          </Button>
        ) : (
          <span className="flex items-center gap-1">
            {timestamp}
            {isOutgoing && isSending && <Spin size="small" />}
            {isOutgoing && !isSending && isRead && (
              <DoubleCheckIcon width={14} height={14} className="text-text-muted" />
            )}
          </span>
        )}
      </div>
    </div>
  )
}

/* ── Reply context preview ── */

function ReplyContextBubble({
  replyTo,
  onClick,
}: {
  replyTo: Message['replyTo']
  isOutgoing?: boolean
  onClick?: () => void
}) {
  if (!replyTo) return null

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      className="chat-reply-context mb-1 cursor-pointer"
    >
      <div className="font-semibold text-text-primary">
        {replyTo.from === 'business' ? 'Vous' : 'Client'}
      </div>
      <div className="truncate">{replyTo.text}</div>
    </div>
  )
}

/* ── Message bubble ── */

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function MessageBubble({
  message,
  position,
  onScrollToMessage,
  onRetry,
  onReply,
  onMediaLoad,
}: {
  message: Message
  position: 'first' | 'middle' | 'last' | 'single'
  onScrollToMessage?: (id: string) => void
  onRetry?: (messageId: string) => void
  onReply?: (message: Message) => void
  onMediaLoad?: () => void
}) {
  const isOutgoing = message.from === 'business'
  const isSending = message.status === 'sending'
  const isError = message.status === 'error'
  const hasMedia =
    message.type === 'image' || message.type === 'video' || message.type === 'catalog'

  const bubbleClasses = [
    'chat-bubble',
    isOutgoing ? 'chat-bubble--outgoing' : 'chat-bubble--incoming',
    hasMedia || message.replyTo ? 'chat-bubble--media' : '',
    message.type === 'video' ? 'chat-bubble--video' : '',
    message.type === 'audio' ? 'chat-bubble--audio' : '',
    isSending ? 'opacity-70' : '',
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
        return (
          <AudioPlayer
            audioUrl={message.audioUrl}
            timestamp={formatTime(message.timestamp)}
            isOutgoing={isOutgoing}
            isSending={isSending}
            isError={isError}
            isRead={message.isRead}
            onRetry={() => onRetry?.(message.localId || message.id)}
          />
        )

      case 'file':
        return (
          <div className="flex flex-col gap-1">
            <a
              href={message.fileUrl || message.mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 no-underline"
            >
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500">
                <FileText size={16} />
              </div>
              <div className="min-w-0 flex-1 truncate text-sm text-text-primary">
                {message.fileName || 'Document'}
              </div>
            </a>
            <div className="flex items-center justify-between pl-11 text-[10px] text-text-muted">
              <span>
                {message.fileSize != null && message.fileSize > 0
                  ? formatFileSize(message.fileSize)
                  : ''}
              </span>
              {isError ? (
                <Button
                  type={'text'}
                  danger
                  size="small"
                  onClick={() => onRetry?.(message.localId || message.id)}
                  icon={<RotateCcw size={10} />}
                  iconPosition={'end'}
                >
                  Non envoyé · Réessayer
                </Button>
              ) : (
                <span className="flex items-center gap-1">
                  {formatTime(message.timestamp)}
                  {isOutgoing && isSending && <Spin size="small" />}
                  {isOutgoing && !isSending && message.isRead && (
                    <DoubleCheckIcon width={14} height={14} className="text-text-muted" />
                  )}
                </span>
              )}
            </div>
          </div>
        )

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
                onLoad={onMediaLoad}
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
            <video
              src={message.videoUrl || message.videoThumbnail}
              controls
              preload="metadata"
              className="w-full rounded-control aspect-video bg-bg-muted"
              onLoadedMetadata={onMediaLoad}
            />
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
      className={`group flex items-center gap-1 ${isOutgoing ? 'justify-end' : 'justify-start'} chat-message-row`}
      data-from={message.from}
    >
      {/* Reply button — left of outgoing messages */}
      {isOutgoing && onReply && !isSending && !isError && (
        <Button
          variant="text"
          size="small"
          shape="circle"
          icon={<Reply size={14} />}
          onClick={() => onReply(message)}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        />
      )}
      <div className={bubbleClasses}>
        {message.replyTo && (
          <ReplyContextBubble
            replyTo={message.replyTo}
            isOutgoing={isOutgoing}
            onClick={handleContextClick}
          />
        )}
        {renderContent()}
        {message.reactions && message.reactions.length > 0 && (
          <div className="chat-reactions">
            {message.reactions.map((r, i) => (
              <span key={i} className="chat-reaction">
                {r.emoji}
              </span>
            ))}
          </div>
        )}
        {message.type !== 'audio' && message.type !== 'file' && (
          <div className="mt-1 flex items-center justify-end gap-1 pl-11 text-[10px] text-text-muted">
            {isError ? (
              <Button
                type={'text'}
                danger
                size="small"
                onClick={() => onRetry?.(message.localId || message.id)}
                icon={<RotateCcw size={10} />}
                iconPosition={'end'}
              >
                Non envoyé · Réessayer
              </Button>
            ) : (
              <span className="flex items-center gap-1">
                {formatTime(message.timestamp)}
                {isOutgoing && isSending && <Spin size="small" className="ml-0.5" />}
                {isOutgoing && !isSending && message.isRead && (
                  <DoubleCheckIcon width={14} height={14} className="text-text-muted" />
                )}
              </span>
            )}
          </div>
        )}
      </div>
      {/* Reply button — right of incoming messages */}
      {!isOutgoing && onReply && !isSending && !isError && (
        <Button
          variant="text"
          size="small"
          shape="circle"
          icon={<Reply size={14} />}
          onClick={() => onReply(message)}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        />
      )}
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

export function ChatWindow({
  conversation,
  provider = 'whatsapp',
  onSend,
  onUploadAndSend,
  onRetry,
}: ChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { conv?: string; ticket?: string }
  const [replyTo, setReplyTo] = useState<Message | null>(null)

  // Clear reply when conversation changes
  useEffect(() => {
    setReplyTo(null)
  }, [conversation.id])

  const tickets = conversation.tickets ?? []

  const drawerTicket = useMemo(
    () => tickets.find((t) => t.id === search.ticket) || null,
    [tickets, search.ticket],
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

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    })
  }, [])

  // Scroll to bottom on conversation change or new messages
  const messageCount = conversation.messages.length
  useEffect(() => {
    scrollToBottom()
  }, [conversation.id, messageCount, scrollToBottom])

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
    const active = tickets.filter((t) => t.status !== 'resolved' && t.status !== 'cancelled')
    return active.length > 0 ? active[active.length - 1] : null
  }, [tickets])

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
      <div ref={scrollRef} className="flex-1 overflow-y-auto pt-2 pb-10">
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
                  onRetry={onRetry}
                  onReply={provider !== 'instagram-dm' ? setReplyTo : undefined}
                  onMediaLoad={scrollToBottom}
                />
              )
            })}
          </div>
        ))}
      </div>

      {/* Input area */}
      <ChatInput
        onSend={
          onSend
            ? (msg) => {
                const rid = replyTo?.id
                setReplyTo(null)
                return onSend(msg, undefined, rid)
              }
            : undefined
        }
        onUploadAndSend={
          onUploadAndSend
            ? (file, type) => {
                const rid = replyTo?.id
                setReplyTo(null)
                return onUploadAndSend(file, type as 'image' | 'video' | 'audio' | 'file', rid)
              }
            : undefined
        }
        provider={provider}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      />

      {/* Ticket drawer */}
      <TicketDrawer
        ticket={drawerTicket}
        allTickets={tickets}
        open={!!drawerTicket}
        onClose={closeTicket}
        onSwitchTicket={openTicket}
      />
    </div>
  )
}
