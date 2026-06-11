import { useTranslation } from 'react-i18next'
import { Button, Popover } from 'antd'
import { Eye } from 'lucide-react'
import dayjs from 'dayjs'
import type { TicketActivity, TicketActivityDiff } from '@app/components/whatsapp/mock-data'
import { TICKET_STATUS_CONFIG } from '@app/components/whatsapp/mock-data'

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

export function ActivityItem({ activity }: { activity: TicketActivity }) {
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
            <Button type="default" icon={<Eye size={14} />} className="mt-1.5">
              {t('tickets.view_diff')}
            </Button>
          </DiffPopover>
          <div className="text-xs text-text-muted mt-1">{time}</div>
        </div>
      </div>
    )
  }

  return null
}
