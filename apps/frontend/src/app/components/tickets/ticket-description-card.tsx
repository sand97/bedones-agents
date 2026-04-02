import { Button, Descriptions } from 'antd'
import { Eye } from 'lucide-react'
import { StatusTag } from '@app/components/shared/status-tag'
import { formatPrice, formatDateTime } from '@app/lib/format'
import { ContactCell } from './contact-cell'
import { TICKET_STATUS_CONFIG, type TicketListEntry } from '@app/components/whatsapp/mock-data'

interface TicketDescriptionCardProps {
  entry: TicketListEntry
  onViewDetails: () => void
}

export function TicketDescriptionCard({ entry, onViewDetails }: TicketDescriptionCardProps) {
  const statusConfig = TICKET_STATUS_CONFIG[entry.status]
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
        <Descriptions.Item label="Status">
          <StatusTag label={statusConfig.label} color={statusConfig.color} />
        </Descriptions.Item>
        <Descriptions.Item label="Articles">
          <span className="font-medium">
            {entry.itemCount} article{entry.itemCount > 1 ? 's' : ''}
          </span>
          <span className="ml-2 text-xs text-text-muted">
            {formatPrice(entry.totalAmount, entry.currency)}
          </span>
        </Descriptions.Item>
        <Descriptions.Item label="Créé le">
          <span className="text-text-secondary">{formatDateTime(entry.createdAt)}</span>
        </Descriptions.Item>
        <Descriptions.Item label="Contact">
          <ContactCell entry={entry} />
        </Descriptions.Item>
        <Descriptions.Item label="Actions">
          <Button type="default" size="small" icon={<Eye size={15} />} onClick={onViewDetails}>
            Détails
          </Button>
        </Descriptions.Item>
      </Descriptions>
    </div>
  )
}
