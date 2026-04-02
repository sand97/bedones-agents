import { useState } from 'react'
import { Button, Drawer, Popover, Tooltip } from 'antd'
import { ArrowLeft, Pencil } from 'lucide-react'
import dayjs from 'dayjs'
import type { Ticket, TicketActivity, TicketActivityDiff, TicketItem } from './mock-data'
import { TICKET_STATUS_CONFIG } from './mock-data'
import { ArticleListItem } from '@app/components/catalog/article-list-item'

interface TicketDrawerProps {
  ticket: Ticket | null
  allTickets?: Ticket[]
  open: boolean
  onClose: () => void
  onSwitchTicket?: (ticket: Ticket) => void
}

/* ── Diff popover (before / after) ── */

function DiffPopover({ diff, children }: { diff: TicketActivityDiff; children: React.ReactNode }) {
  return (
    <Popover
      trigger="click"
      placement="left"
      overlayClassName="org-switcher-popover"
      arrow={false}
      content={
        <div className="flex w-72 flex-col gap-3 p-1">
          <div className="rounded-control border border-red-100 bg-red-50/50 p-3">
            <div className="mb-1.5 text-sm font-semibold text-red-500">Avant</div>
            <div className="text-sm font-normal text-text-secondary leading-relaxed">
              {diff.before}
            </div>
          </div>
          <div className="rounded-control border border-green-100 bg-green-50/50 p-3">
            <div className="mb-1.5 text-sm font-semibold text-green-600">Après</div>
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
  if (activity.type === 'created') {
    const time = dayjs(activity.timestamp).format('DD/MM à HH:mm')
    return (
      <div className="ticket-activity-item">
        <div className="ticket-activity-dot ticket-activity-dot--default" />
        <div className="ticket-activity-line" />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-text-primary">
            <span className="font-semibold">{activity.author}</span> a créé le ticket
          </div>
          <div className="text-xs text-text-muted mt-0.5">{time}</div>
        </div>
      </div>
    )
  }

  if (activity.type === 'status_change' && activity.fromStatus && activity.toStatus) {
    const to = TICKET_STATUS_CONFIG[activity.toStatus]
    const time = dayjs(activity.timestamp).format('DD/MM à HH:mm')

    return (
      <div className="ticket-activity-item">
        <div className="ticket-activity-dot" style={{ background: to.color }} />
        <div className="ticket-activity-line" />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-text-primary">
            <span className="font-semibold">{activity.author}</span> a passé le status à{' '}
            <span
              className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold text-white align-middle"
              style={{ background: to.color }}
            >
              {to.label}
            </span>
          </div>
          <div className="text-xs text-text-muted mt-0.5">{time}</div>
        </div>
      </div>
    )
  }

  if (activity.type === 'description_change' && activity.diff) {
    const time = dayjs(activity.timestamp).format('DD/MM à HH:mm')

    return (
      <div className="ticket-activity-item">
        <div className="ticket-activity-dot ticket-activity-dot--default" />
        <div className="ticket-activity-line" />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-text-primary">
            <span className="font-semibold">{activity.author}</span> a modifié la description
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

/* ── Main drawer ── */

export function TicketDrawer({
  ticket,
  allTickets = [],
  open,
  onClose,
  onSwitchTicket,
}: TicketDrawerProps) {
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>({})

  if (!ticket) return null

  const statusConfig = TICKET_STATUS_CONFIG[ticket.status]
  const sortedActivity = [...ticket.activity].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  )

  const getItemQuantity = (item: TicketItem) => itemQuantities[item.id] ?? item.quantity

  const handleQuantityChange = (id: string, quantity: number) => {
    if (quantity < 0) return
    setItemQuantities((prev) => ({ ...prev, [id]: quantity }))
  }

  const items = ticket.items ?? []
  const totalPrice = items.reduce((sum, item) => sum + item.unitPrice * getItemQuantity(item), 0)
  const currency = items[0]?.currency ?? 'FCFA'

  return (
    <Drawer
      open={open}
      onClose={onClose}
      footer={[
        <Button
          type="default"
          block
          icon={<Pencil size={14} />}
          className="flex items-center justify-center gap-2"
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
          {/* Description */}
          <div className="border-b border-border-subtle px-4 py-4">
            <div className="mb-2 text-xs text-text-muted">Description</div>
            <div className="text-sm font-normal text-text-primary leading-relaxed">
              {ticket.description}
            </div>
          </div>

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

          {/* Activity */}
          <div className="px-4 py-4">
            <div className="mb-4 text-xs text-text-muted">Activité</div>
            <div className="ticket-activity-timeline">
              {sortedActivity.map((act) => (
                <ActivityItem key={act.id} activity={act} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  )
}
