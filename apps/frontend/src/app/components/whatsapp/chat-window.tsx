import { useMemo, useRef, useEffect, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, Popover, Button, Spin, Tooltip, message as antdMessage } from 'antd'
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
  Smile,
  Sparkles,
  BotOff,
} from 'lucide-react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { DoubleCheckIcon, SingleCheckIcon, OptionsIcon } from '@app/components/icons/social-icons'
import { $api } from '@app/lib/api/$api'
import { getAvatarColor } from '@app/lib/avatar-color'
import type { Conversation, Message } from './mock-data'
import { TicketCard } from './ticket-card'
import { TicketDrawer, type RealTicket } from './ticket-drawer'
import { ChatInput } from './chat-input'
import { FeedbackModal, type FeedbackSubmitResult, type FeedbackTurn } from './feedback-modal'

type ChatProvider = 'whatsapp' | 'instagram-dm' | 'messenger' | 'tiktok'

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
  onTyping?: () => void
  onRetry?: (messageId: string) => void
  hasCatalog?: boolean
  onProductClick?: () => void
  onCatalogClick?: () => void
  onTemplateClick?: () => void
  onTikTokMessageClick?: () => void
}

function formatTime(timestamp: string): string {
  return dayjs(timestamp).format('HH:mm')
}

/* ── Linkified text ──
   Detects URLs in plain message text and renders them as clickable links.
   Long URLs (and any unbreakable token) wrap via the `chat-text` class so
   they don't widen the bubble beyond its max-width. */

const URL_SPLIT_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi
const URL_MATCH_REGEX = /^(https?:\/\/|www\.)/i

function LinkifiedText({ text, className }: { text: string; className?: string }) {
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

function groupMessagesByDate(
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

/* ── Lazy video player ──
   Avoids pre-buffering: shows a placeholder with a play button. The <video>
   element is mounted only on click, so the network request happens at user
   intent rather than at render time. */

function LazyVideo({ src, onPlay }: { src?: string; onPlay?: () => void }) {
  const [active, setActive] = useState(false)

  if (!active) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => setActive(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setActive(true)
          }
        }}
        aria-label="Lire la vidéo"
        className="chat-video-placeholder"
      >
        <span className="chat-video-placeholder__play">
          <Play size={20} />
        </span>
      </div>
    )
  }

  return (
    <video
      src={src}
      controls
      autoPlay
      preload="auto"
      className="w-full rounded-control aspect-video bg-bg-muted"
      onLoadedMetadata={onPlay}
    />
  )
}

/* ── Audio message player ── */

function AudioPlayer({
  audioUrl,
  timestamp,
  isOutgoing,
  isSending,
  isError,
  isRead,
  isAi,
  deliveryStatus,
  provider,
  onRetry,
}: {
  audioUrl?: string
  timestamp?: string
  isOutgoing?: boolean
  isSending?: boolean
  isError?: boolean
  isRead?: boolean
  isAi?: boolean
  deliveryStatus?: 'sent' | 'delivered' | 'read'
  provider?: ChatProvider
  onRetry?: () => void
}) {
  const { t } = useTranslation()
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
            <span>
              {timestamp}
              {isOutgoing && isAi && ` ${t('chat.by_ai')}`}
            </span>
            {isOutgoing && isSending && <Spin size="small" />}
            {isOutgoing && !isSending && (
              <DeliveryCheck
                deliveryStatus={deliveryStatus}
                provider={provider}
                isRead={!!isRead}
              />
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

/* ── Reaction picker ── */

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢'] as const

function ReactionPicker({
  onPick,
  children,
}: {
  onPick: (emoji: string) => void
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover
      content={
        <div className="flex items-center gap-1">
          {REACTION_EMOJIS.map((emoji) => (
            <Button
              key={emoji}
              type="text"
              shape="circle"
              size="large"
              onClick={() => {
                onPick(emoji)
                setOpen(false)
              }}
              className="!text-xl !leading-none"
            >
              {emoji}
            </Button>
          ))}
        </div>
      }
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="top"
      arrow={false}
    >
      {children}
    </Popover>
  )
}

/* ── Message bubble ── */

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function formatProductPrice(price?: number | null, currency?: string | null): string {
  if (price == null) return ''
  const rounded = Math.round(price * 100) / 100
  const formatted = rounded.toLocaleString('fr-FR', {
    minimumFractionDigits: rounded % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
  return currency ? `${formatted} ${currency}` : formatted
}

/** Delivery status check marks for WhatsApp outgoing messages */
function DeliveryCheck({
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

function MessageBubble({
  message,
  position,
  provider,
  onScrollToMessage,
  onRetry,
  onReply,
  onReact,
  onImprove,
  onMediaLoad,
  windowClosed = false,
}: {
  message: Message
  position: 'first' | 'middle' | 'last' | 'single'
  provider?: ChatProvider
  onScrollToMessage?: (id: string) => void
  onRetry?: (messageId: string) => void
  onReply?: (message: Message) => void
  onReact?: (message: Message, emoji: string) => void
  onImprove?: (message: Message) => void
  onMediaLoad?: () => void
  windowClosed?: boolean
}) {
  const { t } = useTranslation()
  const isOutgoing = message.from === 'business'
  const isSending = message.status === 'sending'
  const isError = message.status === 'error'
  const windowClosedTooltip = windowClosed
    ? t(
        provider === 'tiktok'
          ? 'chat.window_closed_tooltip_tiktok'
          : 'chat.window_closed_tooltip_whatsapp',
      )
    : null
  const hasMedia =
    message.type === 'image' ||
    message.type === 'video' ||
    (message.type === 'catalog' && !!message.catalogItem && !message.catalogItems?.length)

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
            isAi={message.isAi}
            deliveryStatus={message.deliveryStatus}
            provider={provider}
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
                  <span>
                    {formatTime(message.timestamp)}
                    {isOutgoing && message.isAi && ` ${t('chat.by_ai')}`}
                  </span>
                  {isOutgoing && isSending && <Spin size="small" />}
                  {isOutgoing && !isSending && (
                    <DeliveryCheck
                      deliveryStatus={message.deliveryStatus}
                      provider={provider}
                      isRead={message.isRead}
                    />
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
                className="relative z-1 max-h-64 w-full rounded-xl object-cover"
                onLoad={onMediaLoad}
              />
            </div>
            {message.imageCaption && <LinkifiedText text={message.imageCaption} className="mt-2" />}
          </div>
        )

      case 'video':
        return (
          <div>
            <LazyVideo src={message.videoUrl || message.videoThumbnail} onPlay={onMediaLoad} />
            {message.text && <LinkifiedText text={message.text} className="mt-2" />}
          </div>
        )

      case 'catalog':
      case 'catalog_message': {
        const items = message.catalogItems
        const header = message.catalogHeader
        const footer = message.catalogFooter
        const body = message.text

        if (items && items.length > 0) {
          return (
            <div className="flex w-[18rem] flex-col gap-2 py-0.5">
              {header && <div className="text-sm font-semibold text-text-primary">{header}</div>}
              {body && <p className="m-0 whitespace-pre-wrap text-sm text-text-primary">{body}</p>}
              <div className="flex flex-col gap-1.5">
                {items.map((item, idx) => (
                  <div
                    key={`${item.retailerId ?? idx}`}
                    className="flex items-center gap-3 rounded-lg bg-bg-subtle p-2"
                  >
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name ?? item.retailerId ?? ''}
                        className="h-12 w-12 flex-shrink-0 rounded-control object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-control bg-bg-muted text-text-muted">
                        <ShoppingBag size={18} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <Tooltip title={item.retailerId} placement="top">
                        <div className="truncate text-sm font-semibold text-text-primary">
                          {item.name || item.retailerId}
                        </div>
                      </Tooltip>
                      <div className="text-xs text-text-muted">
                        {formatProductPrice(item.price, item.currency)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {footer && <div className="text-xs text-text-muted">{footer}</div>}
            </div>
          )
        }

        // Legacy single-item layout (kept for pre-existing mocks)
        if (message.catalogItem) {
          return (
            <div className="overflow-hidden rounded-lg">
              <img src={message.catalogItem.imageUrl} alt="" className="h-32 w-full object-cover" />
              <div className="p-2 pt-4">
                <div className="text-sm font-semibold text-text-primary">
                  {message.catalogItem.title}
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
        }

        // Fallback (no metadata and no legacy item) — show whatever text/body we have
        return (
          <div className="py-0.5 text-sm text-text-primary">
            {body ||
              (message.type === 'catalog_message'
                ? t('chat.catalog_sent')
                : t('chat.products_sent'))}
          </div>
        )
      }

      case 'order': {
        const order = message.order
        if (!order) {
          return <p className="m-0 text-sm text-text-primary">{message.text || ''}</p>
        }
        return (
          <div className="flex w-[18rem] flex-col gap-2 py-0.5">
            <div className="text-sm font-semibold text-text-primary">{t('chat.order_title')}</div>
            {order.text && (
              <p className="m-0 whitespace-pre-wrap text-sm text-text-primary">{order.text}</p>
            )}
            <div className="flex flex-col gap-1.5">
              {order.items.map((item, idx) => (
                <div
                  key={`${item.retailerId ?? idx}`}
                  className="flex items-center gap-3 rounded-lg bg-bg-subtle p-2"
                >
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name ?? item.retailerId ?? ''}
                      className="h-12 w-12 flex-shrink-0 rounded-control object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-control bg-bg-muted text-text-muted">
                      <ShoppingBag size={18} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <Tooltip title={item.retailerId} placement="top">
                      <div className="truncate text-sm font-semibold text-text-primary">
                        {item.name || item.retailerId}
                      </div>
                    </Tooltip>
                    <div className="text-xs text-text-muted">
                      {t('chat.order_qty', { count: item.quantity })} ·{' '}
                      {formatProductPrice(item.itemPrice, item.currency)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-border-subtle pt-2 text-sm">
              <span className="text-text-muted">{t('chat.order_total')}</span>
              <span className="font-semibold text-text-primary">
                {formatProductPrice(order.total, order.currency)}
              </span>
            </div>
          </div>
        )
      }

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
        return message.text ? <LinkifiedText text={message.text} /> : null
    }
  }

  return (
    <div
      id={`msg-${message.id}`}
      className={`group flex items-center gap-1 ${isOutgoing ? 'justify-end' : 'justify-start'} chat-message-row`}
      data-from={message.from}
    >
      {/* Action buttons — left of outgoing messages (AI improve + Reply) */}
      {isOutgoing && message.isAi && onImprove && !isSending && !isError && (
        <Tooltip title={t('chat.improve_tooltip')} placement="top">
          <Button
            variant="text"
            size="small"
            shape="circle"
            icon={<Sparkles size={14} />}
            onClick={() => onImprove(message)}
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          />
        </Tooltip>
      )}
      {isOutgoing &&
        onReact &&
        !isSending &&
        !isError &&
        (windowClosed ? (
          <Tooltip title={windowClosedTooltip} placement="top">
            <Button
              variant="text"
              size="small"
              shape="circle"
              icon={<Smile size={14} />}
              disabled
              className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </Tooltip>
        ) : (
          <ReactionPicker onPick={(emoji) => onReact(message, emoji)}>
            <Tooltip title={t('chat.react_tooltip')} placement="top">
              <Button
                variant="text"
                size="small"
                shape="circle"
                icon={<Smile size={14} />}
                className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </Tooltip>
          </ReactionPicker>
        ))}
      {isOutgoing && onReply && !isSending && !isError && (
        <Tooltip
          title={windowClosed ? windowClosedTooltip : t('chat.reply_tooltip')}
          placement="top"
        >
          <Button
            variant="text"
            size="small"
            shape="circle"
            icon={<Reply size={14} />}
            onClick={() => onReply(message)}
            disabled={windowClosed}
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          />
        </Tooltip>
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
                <span>
                  {formatTime(message.timestamp)}
                  {isOutgoing && message.isAi && ` ${t('chat.by_ai')}`}
                </span>
                {isOutgoing && isSending && <Spin size="small" className="ml-0.5" />}
                {isOutgoing && !isSending && (
                  <DeliveryCheck
                    deliveryStatus={message.deliveryStatus}
                    provider={provider}
                    isRead={message.isRead}
                  />
                )}
              </span>
            )}
          </div>
        )}
      </div>
      {/* Reply + reaction buttons — right of incoming messages */}
      {!isOutgoing && onReply && !isSending && !isError && (
        <Tooltip
          title={windowClosed ? windowClosedTooltip : t('chat.reply_tooltip')}
          placement="top"
        >
          <Button
            variant="text"
            size="small"
            shape="circle"
            icon={<Reply size={14} />}
            onClick={() => onReply(message)}
            disabled={windowClosed}
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          />
        </Tooltip>
      )}
      {!isOutgoing &&
        onReact &&
        !isSending &&
        !isError &&
        (windowClosed ? (
          <Tooltip title={windowClosedTooltip} placement="top">
            <Button
              variant="text"
              size="small"
              shape="circle"
              icon={<Smile size={14} />}
              disabled
              className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </Tooltip>
        ) : (
          <ReactionPicker onPick={(emoji) => onReact(message, emoji)}>
            <Tooltip title={t('chat.react_tooltip')} placement="top">
              <Button
                variant="text"
                size="small"
                shape="circle"
                icon={<Smile size={14} />}
                className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </Tooltip>
          </ReactionPicker>
        ))}
    </div>
  )
}

/* ── Chat header with copy-phone option ── */

function ChatHeader({ conversation }: { conversation: Conversation }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const agentStatusQuery = $api.useQuery(
    'get',
    '/messaging/conversations/{conversationId}/agent-status',
    { params: { path: { conversationId: conversation.id } } },
  )

  const setOverrideMutation = $api.useMutation(
    'put',
    '/messaging/conversations/{conversationId}/agent-override',
  )

  const agentStatus = agentStatusQuery.data
  const agent = agentStatus?.agent ?? null
  const isAgentReady =
    !!agent && agent.score >= 80 && agent.status !== 'DRAFT' && agent.status !== 'CONFIGURING'
  const isActive = agentStatus?.isActive === true
  const hasHeaderActions = Boolean(
    conversation.contact.phone || conversation.contact.username || isAgentReady,
  )

  const handleCopy = async () => {
    await navigator.clipboard.writeText(
      conversation.contact.phone || conversation.contact.username || '',
    )
    setCopied(true)
    setTimeout(() => {
      setCopied(false)
      setOptionsOpen(false)
    }, 1200)
  }

  const handleToggleAgent = async () => {
    const next: 'FORCE_ON' | 'FORCE_OFF' = isActive ? 'FORCE_OFF' : 'FORCE_ON'
    try {
      const result = await setOverrideMutation.mutateAsync({
        params: { path: { conversationId: conversation.id } },
        body: { override: next },
      })
      queryClient.setQueryData(
        [
          'get',
          '/messaging/conversations/{conversationId}/agent-status',
          { params: { path: { conversationId: conversation.id } } },
        ],
        result,
      )
      antdMessage.success(
        next === 'FORCE_ON' ? t('chat.agent_activated') : t('chat.agent_deactivated'),
      )
    } catch {
      antdMessage.error(t('chat.agent_toggle_error'))
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-2.5">
      <Avatar
        src={conversation.contact.avatarUrl}
        size={36}
        className="flex-shrink-0"
        style={{
          backgroundColor: getAvatarColor(conversation.contact.id || conversation.contact.name),
        }}
      >
        {conversation.contact.name[0]}
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-text-primary">{conversation.contact.name}</div>
        {conversation.contact.username && (
          <div className="text-xs text-text-muted">{conversation.contact.username}</div>
        )}
        {!conversation.contact.username && conversation.contact.phone && (
          <div className="text-xs text-text-muted">{conversation.contact.phone}</div>
        )}
      </div>

      {hasHeaderActions && (
        <Popover
          content={
            <div className="w-56">
              {(conversation.contact.phone || conversation.contact.username) && (
                <Button
                  type="text"
                  block
                  onClick={handleCopy}
                  icon={
                    copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />
                  }
                  className="py-2.5!"
                >
                  {copied
                    ? t('common.copied')
                    : conversation.contact.phone
                      ? t('chat.copy_phone', { phone: conversation.contact.phone })
                      : conversation.contact.username}
                </Button>
              )}
              {isAgentReady && (
                <Button
                  type="text"
                  block
                  onClick={handleToggleAgent}
                  loading={setOverrideMutation.isPending}
                  icon={isActive ? <BotOff size={14} /> : <Sparkles size={14} />}
                  className="py-2.5!"
                >
                  {isActive ? t('chat.deactivate_agent') : t('chat.activate_agent')}
                </Button>
              )}
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
      )}
    </div>
  )
}

/* ── Main component ── */

export function ChatWindow({
  conversation,
  provider = 'whatsapp',
  onSend,
  onUploadAndSend,
  onTyping,
  onRetry,
  hasCatalog,
  onProductClick,
  onCatalogClick,
  onTemplateClick,
  onTikTokMessageClick,
}: ChatWindowProps) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { conv?: string; ticket?: string }
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState<Message | null>(null)

  const feedbackMutation = $api.useMutation('post', '/agent/feedback/{messageId}')
  const reactionMutation = $api.useMutation('post', '/messaging/send-reaction')

  const handleReact = useCallback(
    async (message: Message, emoji: string) => {
      // Strip the optimistic prefix — backend only knows real message IDs.
      if (message.id.startsWith('optimistic-')) return
      try {
        await reactionMutation.mutateAsync({
          body: { messageId: message.id, emoji },
        })
      } catch (err) {
        antdMessage.error(err instanceof Error ? err.message : t('chat.react_error'))
      }
    },
    [reactionMutation, t],
  )

  const handleFeedbackSubmit = useCallback(
    async (params: {
      originalMessage: Message
      conversation: FeedbackTurn[]
    }): Promise<FeedbackSubmitResult> => {
      const result = await feedbackMutation.mutateAsync({
        params: { path: { messageId: params.originalMessage.id } },
        body: {
          conversation: params.conversation.map((c) => ({ from: c.from, text: c.text })),
        },
      })
      return {
        question: result.mode === 'clarify' ? result.question : undefined,
        successMessage: result.mode === 'complete' ? result.successMessage : undefined,
      }
    },
    [feedbackMutation],
  )

  // Clear reply when conversation changes
  useEffect(() => {
    setReplyTo(null)
    setFeedbackMessage(null)
  }, [conversation.id])

  const tickets = conversation.tickets ?? []

  const drawerTicket = useMemo(
    () => tickets.find((t) => t.id === search.ticket) || null,
    [tickets, search.ticket],
  )

  const openTicket = useCallback(
    (ticket: { id: string }) => {
      navigate({ search: { conv: search.conv, ticket: ticket.id } as never })
    },
    [navigate, search.conv],
  )

  const closeTicket = useCallback(() => {
    navigate({ search: { conv: search.conv } as never })
  }, [navigate, search.conv])

  const groups = useMemo(
    () => groupMessagesByDate(conversation.messages, t),
    [conversation.messages, t],
  )

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

  // Customer-service window. WhatsApp closes after 24h since the last inbound
  // message; TikTok Business Messaging closes after 48h.
  const windowClosed = useMemo(() => {
    if (provider !== 'whatsapp' && provider !== 'tiktok') return false
    const lastInbound = [...conversation.messages].reverse().find((msg) => msg.from === 'customer')
    if (!lastInbound) return false
    const limitHours = provider === 'tiktok' ? 48 : 24
    return dayjs().diff(dayjs(lastInbound.timestamp), 'hour', true) > limitHours
  }, [conversation.messages, provider])

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
                  provider={provider}
                  onScrollToMessage={scrollToMessage}
                  onRetry={onRetry}
                  onReply={provider !== 'instagram-dm' ? setReplyTo : undefined}
                  onReact={provider === 'whatsapp' ? handleReact : undefined}
                  onImprove={setFeedbackMessage}
                  onMediaLoad={scrollToBottom}
                  windowClosed={windowClosed}
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
        onTyping={onTyping}
        provider={provider}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        hasCatalog={hasCatalog}
        onProductClick={onProductClick}
        onCatalogClick={onCatalogClick}
        onTemplateClick={onTemplateClick}
        onTikTokMessageClick={onTikTokMessageClick}
        windowClosed={windowClosed}
      />

      {/* Ticket drawer */}
      <TicketDrawer
        ticket={drawerTicket as RealTicket | null}
        allTickets={tickets as unknown as RealTicket[]}
        open={!!drawerTicket}
        onClose={closeTicket}
        onSwitchTicket={openTicket}
      />

      {/* Feedback / Improve-with-AI modal */}
      <FeedbackModal
        open={!!feedbackMessage}
        onClose={() => setFeedbackMessage(null)}
        originalMessage={feedbackMessage}
        onSubmit={handleFeedbackSubmit}
      />
    </div>
  )
}
