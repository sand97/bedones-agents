import { Popover, Tooltip } from 'antd'
import { Minus, Plus, Trash2 } from 'lucide-react'

interface ArticleListItemProps {
  id: string
  title: string
  description?: string
  imageUrl: string
  unitPrice: number
  quantity: number
  currency: string
  /** Show discounted price alongside original */
  discountedTotal?: number
  /** Tooltip content for discount breakdown */
  discountTooltip?: string
  onQuantityChange: (id: string, quantity: number) => void
  /** When true, shows a larger image and description (drawer style) */
  variant?: 'compact' | 'detailed'
}

function formatPrice(price: number, currency: string) {
  return `${price.toLocaleString('fr-FR')} ${currency}`
}

export function ArticleListItem({
  id,
  title,
  description,
  imageUrl,
  unitPrice,
  quantity,
  currency,
  discountedTotal,
  discountTooltip,
  onQuantityChange,
  variant = 'compact',
}: ArticleListItemProps) {
  const total = unitPrice * quantity
  const isDetailed = variant === 'detailed'
  const imgSize = isDetailed ? 80 : 56
  const isDiscounted = discountedTotal !== undefined && discountedTotal < total

  return (
    <div className="ticket-product-item">
      <Popover
        content={
          <img
            src={imageUrl}
            alt={title}
            className="rounded-lg"
            style={{ maxWidth: 280, maxHeight: 280, objectFit: 'contain' }}
          />
        }
        trigger="click"
        placement="right"
        overlayInnerStyle={{ padding: 4 }}
      >
        <img
          src={imageUrl}
          alt={title}
          className="ticket-product-image cursor-pointer"
          style={{ width: imgSize, height: imgSize }}
        />
      </Popover>
      <div className="flex-1 min-w-0">
        <div className="truncate font-semibold text-text-primary text-sm">{title}</div>
        {description && (
          <div className="text-xs text-text-muted mt-0.5 line-clamp-1">{description}</div>
        )}
        <div className="flex items-center justify-between">
          <div>
            {isDiscounted ? (
              <Tooltip title={discountTooltip}>
                <span>
                  <span className="text-xs font-semibold text-text-primary">
                    {formatPrice(discountedTotal, currency)}
                  </span>
                  <span className="ml-2 text-xs text-text-muted line-through">
                    {formatPrice(total, currency)}
                  </span>
                </span>
              </Tooltip>
            ) : (
              <>
                <span className="text-xs font-semibold text-text-primary">
                  {formatPrice(total, currency)}
                </span>
                {isDetailed && quantity > 1 && (
                  <div className="text-xs text-text-muted">
                    {formatPrice(unitPrice, currency)} / unité
                  </div>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-0">
            {quantity === 1 ? (
              <button
                type="button"
                className="ticket-product-qty-btn ticket-product-qty-btn--delete"
                onClick={() => onQuantityChange(id, 0)}
              >
                <Trash2 size={isDetailed ? 14 : 12} />
              </button>
            ) : (
              <button
                type="button"
                className="ticket-product-qty-btn"
                onClick={() => onQuantityChange(id, quantity - 1)}
              >
                <Minus size={isDetailed ? 14 : 12} />
              </button>
            )}
            <span className="ticket-product-qty-value">{quantity}</span>
            <button
              type="button"
              className="ticket-product-qty-btn"
              onClick={() => onQuantityChange(id, quantity + 1)}
            >
              <Plus size={isDetailed ? 14 : 12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
