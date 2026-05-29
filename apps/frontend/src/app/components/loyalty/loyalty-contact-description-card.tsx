import { useTranslation } from 'react-i18next'
import { Button, Descriptions } from 'antd'
import { Pencil, Trash2 } from 'lucide-react'
import { formatPrice } from '@app/lib/format'
import type { LoyaltyContact } from '@app/lib/api/loyalty-api'

interface Props {
  contact: LoyaltyContact
  onEdit: () => void
  onDelete: () => void
}

export function LoyaltyContactDescriptionCard({ contact, onEdit, onDelete }: Props) {
  const { t } = useTranslation()

  return (
    <div className="catalog-card">
      <div className="catalog-card__header">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-text-primary">{contact.name}</div>
          <div className="truncate font-mono text-xs text-text-muted">{contact.phone}</div>
        </div>
      </div>
      <Descriptions
        bordered
        column={1}
        size="small"
        className="ticket-list-card-bordered catalog-card__details"
      >
        <Descriptions.Item label={t('loyalty.contact_total_spent')}>
          <span className="font-medium">{formatPrice(contact.totalSpent || 0, 'FCFA')}</span>
        </Descriptions.Item>
        <Descriptions.Item label={t('loyalty.contact_order_count')}>
          {contact.orderCount}
        </Descriptions.Item>
        <Descriptions.Item label={t('promotions.actions')}>
          <div className="flex items-center gap-2">
            <Button type="default" size="small" icon={<Pencil size={14} />} onClick={onEdit}>
              {t('common.edit')}
            </Button>
            <Button size="small" danger icon={<Trash2 size={14} />} onClick={onDelete}>
              {t('common.delete')}
            </Button>
          </div>
        </Descriptions.Item>
      </Descriptions>
    </div>
  )
}
