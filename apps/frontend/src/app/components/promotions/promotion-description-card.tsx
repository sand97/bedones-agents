import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const statusConfig = PROMOTION_STATUS_CONFIG[promo.status]

  const eligibilityLabel =
    promo.eligibility === 'all'
      ? t('promotions.eligibility_all')
      : t('promotions.product_count', { count: promo.eligibleProductIds.length })

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
        <Descriptions.Item label={t('promotions.status')}>
          <StatusTag label={statusConfig.label} color={statusConfig.color} />
        </Descriptions.Item>
        <Descriptions.Item label={t('promotions.discount')}>
          <span className="font-medium">
            {promo.type === 'percent'
              ? `-${promo.value}%`
              : `-${formatPrice(promo.value, promo.currency)}`}
          </span>
        </Descriptions.Item>
        <Descriptions.Item label={t('promotions.products')}>
          {eligibleNames ? (
            <Tooltip title={eligibleNames}>
              <span>{eligibilityLabel}</span>
            </Tooltip>
          ) : (
            <span>{eligibilityLabel}</span>
          )}
        </Descriptions.Item>
        <Descriptions.Item label={t('promotions.stackable')}>
          <Tag bordered={false} color={promo.stackable ? 'green' : 'default'}>
            {promo.stackable ? t('promotions.yes') : t('promotions.no')}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label={t('promotions.period')}>
          <span className="text-text-secondary">
            {formatDate(promo.startDate)} — {formatDate(promo.endDate)}
          </span>
        </Descriptions.Item>
        <Descriptions.Item label={t('promotions.actions')}>
          <div className="flex items-center gap-2">
            <Button type="default" size="small" icon={<Pencil size={14} />} onClick={onEdit}>
              {t('promotions.edit')}
            </Button>
            <Button size="small" danger icon={<Trash2 size={14} />} onClick={onDelete}>
              {t('promotions.delete')}
            </Button>
          </div>
        </Descriptions.Item>
      </Descriptions>
    </div>
  )
}
