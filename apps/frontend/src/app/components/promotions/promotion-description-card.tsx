import { Button, Descriptions, Tag, Tooltip } from 'antd'
import { Pencil, Trash2 } from 'lucide-react'
import { StatusTag } from '@app/components/shared/status-tag'
import { formatPrice, formatDate } from '@app/lib/format'
import {
  PROMOTION_STATUS_CONFIG,
  MOCK_CATALOG_ARTICLES,
  type PromotionFull,
} from '@app/components/whatsapp/mock-data'

interface PromotionDescriptionCardProps {
  promo: PromotionFull
  onEdit: () => void
  onDelete: () => void
}

export function PromotionDescriptionCard({
  promo,
  onEdit,
  onDelete,
}: PromotionDescriptionCardProps) {
  const statusConfig = PROMOTION_STATUS_CONFIG[promo.status]

  const eligibilityLabel =
    promo.eligibility === 'all'
      ? 'Tous les produits'
      : `${promo.eligibleProductIds.length} produit${promo.eligibleProductIds.length > 1 ? 's' : ''}`

  const eligibleNames =
    promo.eligibility === 'specific'
      ? promo.eligibleProductIds
          .map((id) => MOCK_CATALOG_ARTICLES.find((a) => a.id === id)?.name)
          .filter(Boolean)
          .join(', ')
      : undefined

  return (
    <div className="catalog-card">
      <div className="catalog-card__header">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-text-primary">{promo.name}</div>
          <div className="truncate font-mono text-xs text-text-muted">#{promo.code}</div>
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
        <Descriptions.Item label="Réduction">
          <span className="font-medium">
            {promo.type === 'percent'
              ? `-${promo.value}%`
              : `-${formatPrice(promo.value, promo.currency)}`}
          </span>
        </Descriptions.Item>
        <Descriptions.Item label="Produits">
          {eligibleNames ? (
            <Tooltip title={eligibleNames}>
              <span>{eligibilityLabel}</span>
            </Tooltip>
          ) : (
            <span>{eligibilityLabel}</span>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Cumulable">
          <Tag bordered={false} color={promo.stackable ? 'green' : 'default'}>
            {promo.stackable ? 'Oui' : 'Non'}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Période">
          <span className="text-text-secondary">
            {formatDate(promo.startDate)} — {formatDate(promo.endDate)}
          </span>
        </Descriptions.Item>
        <Descriptions.Item label="Actions">
          <div className="flex items-center gap-2">
            <Button type="default" size="small" icon={<Pencil size={14} />} onClick={onEdit}>
              Modifier
            </Button>
            <Button size="small" danger icon={<Trash2 size={14} />} onClick={onDelete}>
              Supprimer
            </Button>
          </div>
        </Descriptions.Item>
      </Descriptions>
    </div>
  )
}
