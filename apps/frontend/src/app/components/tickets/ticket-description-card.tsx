import { Button, Descriptions, Tag } from 'antd'
import { Eye } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StatusTag } from '@app/components/shared/status-tag'
import { formatDateTime } from '@app/lib/format'
import { ContactCell } from './contact-cell'
import type { Ticket } from '@app/lib/api/agent-api'

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  LOW: { label: 'Basse', color: '#52c41a' },
  MEDIUM: { label: 'Moyenne', color: '#faad14' },
  HIGH: { label: 'Haute', color: '#fa8c16' },
  URGENT: { label: 'Urgente', color: '#f5222d' },
}

interface TicketDescriptionCardProps {
  entry: Ticket
  onViewDetails: () => void
}

export function TicketDescriptionCard({ entry, onViewDetails }: TicketDescriptionCardProps) {
  const { t } = useTranslation()
  const priorityConfig = PRIORITY_CONFIG[entry.priority] ?? { label: entry.priority, color: '#888' }

  return (
    <div className="catalog-card">
      <div className="catalog-card__header">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-text-primary">{entry.title}</div>
          <div className="truncate text-xs text-text-muted">{entry.description}</div>
        </div>
      </div>
      <Descriptions
        bordered
        column={1}
        size="small"
        className="ticket-list-card-bordered catalog-card__details"
      >
        <Descriptions.Item label={t('tickets.filter_status')}>
          {entry.status ? (
            <StatusTag label={entry.status.name} color={entry.status.color} />
          ) : (
            <span className="text-text-muted">N/A</span>
          )}
        </Descriptions.Item>
        <Descriptions.Item label={t('tickets.priority')}>
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
        </Descriptions.Item>
        <Descriptions.Item label={t('tickets.created_at')}>
          <span className="text-text-secondary">{formatDateTime(entry.createdAt)}</span>
        </Descriptions.Item>
        <Descriptions.Item label={t('tickets.contact')}>
          <ContactCell ticket={entry} />
        </Descriptions.Item>
        <Descriptions.Item label="">
          <Button type="default" size="small" icon={<Eye size={15} />} onClick={onViewDetails}>
            {t('tickets.details')}
          </Button>
        </Descriptions.Item>
      </Descriptions>
    </div>
  )
}
