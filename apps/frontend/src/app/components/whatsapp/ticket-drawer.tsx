import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Drawer, Popover, Tag, Tooltip } from 'antd'
import { ArrowLeft, Pencil, User, Phone, MessageSquare } from 'lucide-react'
import dayjs from 'dayjs'
import type { TicketActivity, TicketActivityDiff, TicketItem } from './mock-data'
import { TICKET_STATUS_CONFIG } from './mock-data'
import { ArticleListItem } from '@app/components/catalog/article-list-item'

/** Metadata shape stored in the ticket */
interface TicketMetadata {
  articles?: Array<{
    id: string
    name: string
    price: number
    currency: string
    quantity: number
    imageUrl?: string
    description?: string
  }>
  charges?: Array<{
    id: string
    reason: string
    amount: number
  }>
  promotionIds?: string[]
  subtotal?: number
  chargesTotal?: number
  grandTotal?: number
}

/** Real API ticket shape (activities use createdAt, status is an object) */
interface RealTicket {
  id: string
  title: string
  description?: string
  status?: { id: string; name: string; color: string } | null
  priority?: string
  contactName?: string
  contactId?: string
  provider?: string
  conversationId?: string
  createdAt: string
  metadata?: TicketMetadata | null
  activities?: Array<{
    id: string
    type: string
    author: string
    fromStatus?: string | null
    toStatus?: string | null
    diff?: TicketActivityDiff | null
    createdAt: string
  }>
  items?: TicketItem[]
  [key: string]: unknown
}

interface TicketDrawerProps {
  ticket: RealTicket | null
  allTickets?: RealTicket[]
  open: boolean
  onClose: () => void
  onSwitchTicket?: (ticket: RealTicket) => void
  /** Called when user clicks "Modifier le ticket" */
  onEdit?: () => void
}

/* ── Diff popover (before / after) ── */

function DiffPopover({ diff, children }: { diff: TicketActivityDiff; children: React.ReactNode }) {
  const { t } = useTranslation()

  return (
    <Popover
      trigger="click"
      placement="left"
      overlayClassName="org-switcher-popover"
      arrow={false}
      content={
        <div className="flex w-72 flex-col gap-3 p-1">
          <div className="rounded-control border border-red-100 bg-red-50/50 p-3">
            <div className="mb-1.5 text-sm font-semibold text-red-500">{t('tickets.before')}</div>
            <div className="text-sm font-normal text-text-secondary leading-relaxed">
              {diff.before}
            </div>
          </div>
          <div className="rounded-control border border-green-100 bg-green-50/50 p-3">
            <div className="mb-1.5 text-sm font-semibold text-green-600">{t('tickets.after')}</div>
            <div className="text-sm font-normal text-text-secondary leading-relaxed">
              {diff.after}
            </div>
          </div>
        </div>
      }
    >
      {children}
    </Popover>
  )
}

/* ── Activity timeline ── */

function ActivityItem({ activity }: { activity: TicketActivity }) {
  const { t } = useTranslation()
  if (activity.type === 'created') {
    const time = dayjs(activity.timestamp).format(t('format.date_time'))
    return (
      <div className="ticket-activity-item">
        <div className="ticket-activity-dot ticket-activity-dot--default" />
        <div className="ticket-activity-line" />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-text-primary">
            <span className="font-semibold">{activity.author}</span> {t('tickets.created_ticket')}
          </div>
          <div className="text-xs text-text-muted mt-0.5">{time}</div>
        </div>
      </div>
    )
  }

  if (activity.type === 'status_change' && activity.fromStatus && activity.toStatus) {
    // Support real status names (not mock config keys)
    const toConfig = TICKET_STATUS_CONFIG[activity.toStatus]
    const toColor = toConfig?.color ?? '#666'
    const toLabel = toConfig?.label ?? activity.toStatus
    const time = dayjs(activity.timestamp).format(t('format.date_time'))

    return (
      <div className="ticket-activity-item">
        <div className="ticket-activity-dot" style={{ background: toColor }} />
        <div className="ticket-activity-line" />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-text-primary">
            <span className="font-semibold">{activity.author}</span> {t('tickets.status_changed')}{' '}
            <span
              className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold text-white align-middle"
              style={{ background: toColor }}
            >
              {toLabel}
            </span>
          </div>
          <div className="text-xs text-text-muted mt-0.5">{time}</div>
        </div>
      </div>
    )
  }

  if (activity.type === 'description_change' && activity.diff) {
    const time = dayjs(activity.timestamp).format(t('format.date_time'))

    return (
      <div className="ticket-activity-item">
        <div className="ticket-activity-dot ticket-activity-dot--default" />
        <div className="ticket-activity-line" />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-text-primary">
            <span className="font-semibold">{activity.author}</span>{' '}
            {t('tickets.description_changed')}
          </div>
          <DiffPopover diff={activity.diff}>
            <Button
              type="text"
              block
              className="mt-1.5 h-auto! p-3! text-left! rounded-lg! border border-border-subtle!"
            >
              <span className="text-sm text-text-secondary leading-relaxed line-clamp-3">
                {activity.diff.before}
              </span>
              <div className="mt-1.5 text-xs text-text-muted">Voir avant / après</div>
            </Button>
          </DiffPopover>
          <div className="text-xs text-text-muted mt-1">{time}</div>
        </div>
      </div>
    )
  }

  return null
}

/* ── Format helper ── */

function formatPrice(price: number, currency: string) {
  return `${price.toLocaleString('fr-FR')} ${currency}`
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  LOW: { label: 'Basse', color: '#52c41a' },
  MEDIUM: { label: 'Moyenne', color: '#faad14' },
  HIGH: { label: 'Haute', color: '#fa8c16' },
  URGENT: { label: 'Urgente', color: '#f5222d' },
}

const PROVIDER_CONFIG: Record<string, { label: string }> = {
  WHATSAPP: { label: 'WhatsApp' },
  INSTAGRAM: { label: 'Instagram' },
  FACEBOOK: { label: 'Facebook' },
  TIKTOK: { label: 'TikTok' },
}

/* ── Main drawer ── */

export function TicketDrawer({
  ticket,
  allTickets: _allTickets = [],
  open,
  onClose,
  onSwitchTicket: _onSwitchTicket,
  onEdit,
}: TicketDrawerProps) {
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>({})

  if (!ticket) return null

  // Support both real API shape (status object) and mock shape (status string)
  const statusConfig =
    typeof ticket.status === 'object' && ticket.status
      ? { label: ticket.status.name, color: ticket.status.color }
      : TICKET_STATUS_CONFIG[(ticket as Record<string, unknown>).status as string] || {
          label: 'N/A',
          color: '#999',
        }

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

  const totalPrice = items.reduce((sum, item) => sum + item.unitPrice * getItemQuantity(item), 0)
  const chargesTotal = charges.reduce((sum, c) => sum + (c.amount || 0), 0)
  const grandTotal = meta.grandTotal ?? totalPrice + chargesTotal
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
              {ticket.contactId && (
                <div className="flex items-center gap-1.5 text-sm text-text-secondary">
                  <Phone size={14} className="text-text-muted" />
                  <span className="text-xs">{ticket.contactId}</span>
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

          {/* Products */}
          {items.length > 0 && (
            <div className="border-b border-border-subtle px-4 py-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs text-text-muted">Articles ({items.length})</div>
                <div className="text-sm font-semibold text-text-primary">
                  {formatPrice(totalPrice, currency)}
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {items.map((item) => (
                  <ArticleListItem
                    key={item.id}
                    id={item.id}
                    title={item.title}
                    description={item.description}
                    imageUrl={item.imageUrl}
                    unitPrice={item.unitPrice}
                    quantity={getItemQuantity(item)}
                    currency={item.currency}
                    onQuantityChange={handleQuantityChange}
                    variant="detailed"
                  />
                ))}
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
