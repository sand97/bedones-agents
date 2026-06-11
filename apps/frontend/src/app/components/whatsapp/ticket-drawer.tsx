import { useState, useMemo } from 'react'
import { Button, Drawer, Tag, Tooltip } from 'antd'
import { ArrowLeft, Pencil, User, MessageSquare } from 'lucide-react'
import dayjs from 'dayjs'
import type { TicketActivity, TicketItem, TicketStatus } from './mock-data'
import { TICKET_STATUS_CONFIG } from './mock-data'
import { ArticleListItem } from '@app/components/catalog/article-list-item'
import type { DrawerPromotionOption, RealTicket, TicketMetadata } from './ticket-drawer/types'
import { ActivityItem } from './ticket-drawer/activity-timeline'
import { formatPrice, PRIORITY_CONFIG, PROVIDER_CONFIG } from './ticket-drawer/ticket-config'

export type { RealTicket } from './ticket-drawer/types'

interface TicketDrawerProps {
  ticket: RealTicket | null
  allTickets?: RealTicket[]
  open: boolean
  onClose: () => void
  onSwitchTicket?: (ticket: RealTicket) => void
  /** Called when user clicks "Modifier le ticket" */
  onEdit?: () => void
  /** Available promotions to compute discounted prices */
  promotionOptions?: DrawerPromotionOption[]
}

/* ── Main drawer ── */

export function TicketDrawer({
  ticket,
  allTickets: _allTickets = [],
  open,
  onClose,
  onSwitchTicket: _onSwitchTicket,
  onEdit,
  promotionOptions,
}: TicketDrawerProps) {
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>({})

  // Compute active promotions from metadata + available promotions
  const activePromos = useMemo(() => {
    if (!ticket || !promotionOptions) return []
    const meta = (ticket.metadata ?? {}) as TicketMetadata
    const promoIds = meta.promotionIds ?? []
    if (promoIds.length === 0) return []
    return promotionOptions
      .filter((p) => promoIds.includes(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        type: p.discountType === 'PERCENTAGE' ? ('percent' as const) : ('fixed' as const),
        value: p.discountValue,
        productIds: p.productIds,
      }))
  }, [ticket, promotionOptions])

  if (!ticket) return null

  // Support both real API shape (status object) and mock shape (status string)
  const statusConfig = (() => {
    if (typeof ticket.status === 'object' && ticket.status) {
      return { label: ticket.status.name, color: ticket.status.color }
    }
    const statusKey = ticket.status as TicketStatus | undefined
    if (statusKey && statusKey in TICKET_STATUS_CONFIG) {
      return TICKET_STATUS_CONFIG[statusKey]
    }
    return { label: 'N/A', color: '#999' }
  })()

  // Normalize activities: API uses `createdAt`, mock uses `timestamp`
  const rawActivities = (ticket.activities ||
    (ticket as Record<string, unknown>).activity ||
    []) as Array<TicketActivity & { createdAt?: string }>
  const sortedActivity: TicketActivity[] = rawActivities
    .map((a) => ({
      ...a,
      timestamp: a.timestamp || a.createdAt || '',
    }))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  // Extract items from metadata or from ticket.items (mock)
  const meta = (ticket.metadata ?? {}) as TicketMetadata
  const metaArticles = meta.articles ?? []
  const items: TicketItem[] =
    ticket.items && ticket.items.length > 0
      ? ticket.items
      : metaArticles.map((a) => ({
          id: a.id,
          title: a.name,
          description: a.description || '',
          imageUrl: a.imageUrl || '',
          unitPrice: a.price,
          quantity: a.quantity,
          currency: a.currency,
        }))

  const charges = meta.charges ?? []
  const priorityConfig = PRIORITY_CONFIG[ticket.priority ?? '']
  const providerConfig = PROVIDER_CONFIG[ticket.provider ?? '']

  const getItemQuantity = (item: TicketItem) => itemQuantities[item.id] ?? item.quantity

  const handleQuantityChange = (id: string, quantity: number) => {
    if (quantity < 0) return
    setItemQuantities((prev) => ({ ...prev, [id]: quantity }))
  }

  const getDiscountedPrice = (price: number, articleId?: string) => {
    let discounted = price
    for (const promo of activePromos) {
      if (promo.value <= 0) continue
      if (promo.productIds && promo.productIds.length > 0 && articleId) {
        if (!promo.productIds.includes(articleId)) continue
      }
      if (promo.type === 'percent') {
        discounted -= discounted * (promo.value / 100)
      } else {
        discounted -= promo.value
      }
    }
    return Math.max(0, Math.round(discounted))
  }

  const hasActivePromos = activePromos.length > 0
  const totalPrice = items.reduce((sum, item) => sum + item.unitPrice * getItemQuantity(item), 0)
  const totalDiscounted = items.reduce(
    (sum, item) => sum + getDiscountedPrice(item.unitPrice, item.id) * getItemQuantity(item),
    0,
  )
  const chargesTotal = charges.reduce((sum, c) => sum + (c.amount || 0), 0)
  const grandTotal = hasActivePromos
    ? totalDiscounted + chargesTotal
    : (meta.grandTotal ?? totalPrice + chargesTotal)
  const currency = items[0]?.currency ?? 'FCFA'

  return (
    <Drawer
      open={open}
      onClose={onClose}
      footer={[
        <Button
          key="edit"
          type="default"
          block
          icon={<Pencil size={14} />}
          className="flex items-center justify-center gap-2"
          onClick={onEdit}
        >
          Modifier le ticket
        </Button>,
      ]}
      placement="right"
      width={460}
      closable={false}
      styles={{
        header: { display: 'none' },
        body: { padding: 0 },
      }}
    >
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
          <Button
            type="text"
            onClick={onClose}
            icon={<ArrowLeft size={18} />}
            className="flex-shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Tooltip title={ticket.title} placement="bottom">
                <span className="truncate text-base font-semibold text-text-primary cursor-default">
                  {ticket.title}
                </span>
              </Tooltip>
              <span
                className="flex-shrink-0 rounded-full px-2 py-0.5 text-sm font-semibold text-white"
                style={{ background: statusConfig.color }}
              >
                {statusConfig.label}
              </span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Info row: priority, contact, platform, date */}
          <div className="border-b border-border-subtle px-4 py-4">
            <div className="flex flex-wrap gap-3">
              {priorityConfig && (
                <Tag
                  bordered={false}
                  style={{
                    background: priorityConfig.color,
                    color: '#fff',
                    borderRadius: 9999,
                    fontWeight: 600,
                  }}
                >
                  {priorityConfig.label}
                </Tag>
              )}
              {ticket.contactName && (
                <div className="flex items-center gap-1.5 text-sm text-text-secondary">
                  <User size={14} className="text-text-muted" />
                  <span>{ticket.contactName}</span>
                </div>
              )}
              {providerConfig && (
                <div className="flex items-center gap-1.5 text-sm text-text-secondary">
                  <MessageSquare size={14} className="text-text-muted" />
                  <span>{providerConfig.label}</span>
                </div>
              )}
            </div>
            <div className="mt-2 text-xs text-text-muted">
              {dayjs(ticket.createdAt).format('DD MMMM YYYY [à] HH:mm')}
            </div>
          </div>

          {/* Description */}
          {ticket.description && (
            <div className="border-b border-border-subtle px-4 py-4">
              <div className="mb-2 text-xs text-text-muted">Description</div>
              <div className="text-sm font-normal text-text-primary leading-relaxed">
                {ticket.description}
              </div>
            </div>
          )}

          {/* Promotions */}
          {hasActivePromos && (
            <div className="border-b border-border-subtle px-4 py-4">
              <div className="mb-2 text-xs text-text-muted">Promotions</div>
              <div className="flex flex-wrap gap-2">
                {activePromos.map((promo) => (
                  <Tag key={promo.id} bordered={false} color="orange">
                    {promo.name} (
                    {promo.type === 'percent'
                      ? `-${promo.value}%`
                      : `-${formatPrice(promo.value, 'FCFA')}`}
                    )
                  </Tag>
                ))}
              </div>
            </div>
          )}

          {/* Products */}
          {items.length > 0 && (
            <div className="border-b border-border-subtle px-4 py-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs text-text-muted">Articles ({items.length})</div>
                <div className="text-sm font-semibold text-text-primary">
                  {hasActivePromos && totalDiscounted < totalPrice ? (
                    <>
                      {formatPrice(totalDiscounted, currency)}
                      <span className="ml-2 text-xs text-text-muted font-normal line-through">
                        {formatPrice(totalPrice, currency)}
                      </span>
                    </>
                  ) : (
                    formatPrice(totalPrice, currency)
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {items.map((item) => {
                  const qty = getItemQuantity(item)
                  const original = item.unitPrice * qty
                  const discounted = getDiscountedPrice(item.unitPrice, item.id) * qty
                  return (
                    <ArticleListItem
                      key={item.id}
                      id={item.id}
                      title={item.title}
                      description={item.description}
                      imageUrl={item.imageUrl}
                      unitPrice={item.unitPrice}
                      quantity={qty}
                      currency={item.currency}
                      discountedTotal={
                        hasActivePromos && discounted < original ? discounted : undefined
                      }
                      onQuantityChange={handleQuantityChange}
                      variant="detailed"
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* Charges */}
          {charges.length > 0 && (
            <div className="border-b border-border-subtle px-4 py-4">
              <div className="mb-3 text-xs text-text-muted">Charges additionnelles</div>
              <div className="flex flex-col gap-2">
                {charges.map((charge) => (
                  <div
                    key={charge.id}
                    className="flex items-center justify-between text-sm text-text-secondary"
                  >
                    <span>{charge.reason}</span>
                    <span className="font-medium text-text-primary">
                      {formatPrice(charge.amount, 'FCFA')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Total */}
          {(items.length > 0 || charges.length > 0) && (
            <div className="border-b border-border-subtle px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text-primary">Total</span>
                <span className="text-sm font-semibold text-text-primary">
                  {formatPrice(grandTotal, currency)}
                </span>
              </div>
            </div>
          )}

          {/* Activity */}
          <div className="px-4 py-4">
            <div className="mb-4 text-xs text-text-muted">Activité</div>
            {sortedActivity.length > 0 ? (
              <div className="ticket-activity-timeline">
                {sortedActivity.map((act) => (
                  <ActivityItem key={act.id} activity={act} />
                ))}
              </div>
            ) : (
              <div className="text-sm text-text-muted">Aucune activité</div>
            )}
          </div>
        </div>
      </div>
    </Drawer>
  )
}
