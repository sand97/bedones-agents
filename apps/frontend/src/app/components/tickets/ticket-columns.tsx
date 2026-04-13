import { useMemo } from 'react'
import { Button, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Eye, Pencil, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StatusTag } from '@app/components/shared/status-tag'
import { formatDateTime } from '@app/lib/format'
import { ContactCell } from './contact-cell'
import type { Ticket } from '@app/lib/api/agent-api'

interface TicketColumnsOptions {
  onViewDetails: (entry: Ticket) => void
  onEdit: (entry: Ticket) => void
  onDelete: (entry: Ticket) => void
}

export function useTicketColumns(
  onViewDetailsOrOptions: ((entry: Ticket) => void) | TicketColumnsOptions,
): ColumnsType<Ticket> {
  // Support both legacy single-callback and new options object
  const options: TicketColumnsOptions =
    typeof onViewDetailsOrOptions === 'function'
      ? { onViewDetails: onViewDetailsOrOptions, onEdit: () => {}, onDelete: () => {} }
      : onViewDetailsOrOptions
  const { onViewDetails, onEdit, onDelete } = options
  const { t } = useTranslation()

  const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
    LOW: { label: t('tickets.priority_low'), color: '#52c41a' },
    MEDIUM: { label: t('tickets.priority_medium'), color: '#faad14' },
    HIGH: { label: t('tickets.priority_high'), color: '#fa8c16' },
    URGENT: { label: t('tickets.priority_urgent'), color: '#f5222d' },
  }

  return useMemo(
    () => [
      {
        title: t('tickets.col_title'),
        key: 'title',
        ellipsis: true,
        render: (_: unknown, record: Ticket) => (
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-text-primary">{record.title}</div>
            <div className="truncate text-xs text-text-muted">{record.description}</div>
          </div>
        ),
      },
      {
        title: t('tickets.priority'),
        key: 'priority',
        width: 120,
        render: (_: unknown, record: Ticket) => {
          const config = PRIORITY_CONFIG[record.priority] ?? {
            label: record.priority,
            color: '#888',
          }
          return (
            <Tag
              bordered={false}
              style={{
                background: config.color,
                color: '#fff',
                borderRadius: 9999,
                fontWeight: 600,
              }}
            >
              {config.label}
            </Tag>
          )
        },
      },
      {
        title: t('tickets.filter_status'),
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (status: Ticket['status']) => {
          if (!status) return <span className="text-sm text-text-muted">N/A</span>
          return <StatusTag label={status.name} color={status.color} />
        },
      },
      {
        title: t('tickets.created_at'),
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 220,
        render: (date: string) => (
          <span className="text-sm text-text-secondary">{formatDateTime(date)}</span>
        ),
        sorter: (a: Ticket, b: Ticket) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        defaultSortOrder: 'descend',
      },
      {
        title: t('tickets.contact'),
        key: 'contact',
        width: 220,
        render: (_: unknown, record: Ticket) => <ContactCell ticket={record} />,
      },
      {
        title: '',
        key: 'actions',
        width: 120,
        render: (_: unknown, record: Ticket) => (
          <div className="flex items-center justify-center gap-1">
            <Tooltip title={t('tickets.details')}>
              <Button size="small" icon={<Eye size={15} />} onClick={() => onViewDetails(record)} />
            </Tooltip>
            <Tooltip title={t('common.edit')}>
              <Button size="small" icon={<Pencil size={14} />} onClick={() => onEdit(record)} />
            </Tooltip>
            <Tooltip title={t('common.delete')}>
              <Button
                size="small"
                danger
                icon={<Trash2 size={14} />}
                onClick={() => onDelete(record)}
              />
            </Tooltip>
          </div>
        ),
      },
    ],
    [t, onViewDetails, onEdit, onDelete],
  )
}
