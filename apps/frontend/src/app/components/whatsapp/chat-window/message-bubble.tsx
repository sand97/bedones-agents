import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Popover, Button, Spin, Tooltip } from 'antd'
import { RotateCcw, Reply, Smile, Sparkles } from 'lucide-react'
import type { Message } from '../mock-data'
import { DeliveryCheck, formatTime, type ChatProvider } from './chat-message-utils'
import { MessageContent } from './message-content'

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

export function MessageBubble({
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
        <MessageContent
          message={message}
          isOutgoing={isOutgoing}
          isSending={isSending}
          isError={isError}
          provider={provider}
          onRetry={onRetry}
          onMediaLoad={onMediaLoad}
        />
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
