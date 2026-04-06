import { useMemo } from 'react'
import { Button } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Eye } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StatusTag } from '@app/components/shared/status-tag'
import { formatPrice, formatDateTime } from '@app/lib/format'
import { ContactCell } from './contact-cell'
import {
  TICKET_STATUS_CONFIG,
  type TicketListEntry,
  type TicketStatus,
} from '@app/components/whatsapp/mock-data'

export function useTicketColumns(
  onViewDetails: (entry: TicketListEntry) => void,
): ColumnsType<TicketListEntry> {
  const { t } = useTranslation()
  return useMemo(
    () => [
      {
        title: 'Titre',
        key: 'title',
        ellipsis: true,
        render: (_: unknown, record: TicketListEntry) => (
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-text-primary">{record.title}</div>
            <div className="truncate text-xs text-text-muted">{record.description}</div>
          </div>
        ),
      },
      {
        title: 'Articles',
        key: 'items',
        width: 140,
        render: (_: unknown, record: TicketListEntry) => (
          <div>
            <div className="text-sm font-medium text-text-primary">
              {record.itemCount} article{record.itemCount > 1 ? 's' : ''}
            </div>
            <div className="text-xs text-text-muted">
              {formatPrice(record.totalAmount, record.currency)}
            </div>
          </div>
        ),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (status: TicketStatus) => {
          const config = TICKET_STATUS_CONFIG[status]
          return <StatusTag label={config.label} color={config.color} />
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
        sorter: (a: TicketListEntry, b: TicketListEntry) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        defaultSortOrder: 'descend',
      },
      {
        title: 'Contact',
        key: 'contact',
        width: 220,
        render: (_: unknown, record: TicketListEntry) => <ContactCell entry={record} />,
      },
      {
        title: '',
        key: 'actions',
        width: 132,
        render: (_: unknown, record: TicketListEntry) => (
          <div className="flex items-center justify-center">
            <Button size={'small'} icon={<Eye size={15} />} onClick={() => onViewDetails(record)}>
              Détails
            </Button>
          </div>
        ),
      },
    ],
    [t, onViewDetails],
  )
}
