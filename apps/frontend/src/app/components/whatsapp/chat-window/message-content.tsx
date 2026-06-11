import { useTranslation } from 'react-i18next'
import { Button, Spin, Tooltip } from 'antd'
import { ShoppingBag, ImageIcon, FileText, RotateCcw } from 'lucide-react'
import type { Message } from '../mock-data'
import {
  DeliveryCheck,
  LinkifiedText,
  formatFileSize,
  formatProductPrice,
  formatTime,
  type ChatProvider,
} from './chat-message-utils'
import { LazyVideo, AudioPlayer } from './media-players'

export function MessageContent({
  message,
  isOutgoing,
  isSending,
  isError,
  provider,
  onRetry,
  onMediaLoad,
}: {
  message: Message
  isOutgoing: boolean
  isSending: boolean
  isError: boolean
  provider?: ChatProvider
  onRetry?: (messageId: string) => void
  onMediaLoad?: () => void
}) {
  const { t } = useTranslation()

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
