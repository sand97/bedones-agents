import { useTranslation } from 'react-i18next'
import { Button, Descriptions, Tag, Tooltip } from 'antd'
import { Pencil, Trash2 } from 'lucide-react'
import { StatusTag } from '@app/components/shared/status-tag'
import { formatPrice, formatDate } from '@app/lib/format'
import type { PromotionItem } from '@app/lib/api/agent-api'

interface PromotionDescriptionCardProps {
  promo: PromotionItem
  onEdit: () => void
  onDelete: () => void
}

export function PromotionDescriptionCard({
  promo,
  onEdit,
  onDelete,
}: PromotionDescriptionCardProps) {
  const { t } = useTranslation()

  const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    DRAFT: { label: t('promotions.status_draft'), color: '#8b5cf6' },
    ACTIVE: { label: t('promotions.status_active'), color: '#22c55e' },
    PAUSED: { label: t('promotions.status_paused'), color: '#f59e0b' },
    EXPIRED: { label: t('promotions.status_expired'), color: '#ef4444' },
  }

  const statusConfig = STATUS_CONFIG[promo.status]

  const hasProducts = promo.products.length > 0
  const eligibilityLabel = hasProducts
    ? t('promotions.product_count', { count: promo.products.length })
    : t('promotions.eligibility_all')

  const eligibleNames = hasProducts
    ? promo.products
        .map((p) => p.product.name)
        .filter(Boolean)
        .join(', ')
    : undefined

  return (
    <div className="catalog-card">
      <div className="catalog-card__header">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-text-primary">{promo.name}</div>
          {promo.code && (
            <div className="truncate font-mono text-xs text-text-muted">#{promo.code}</div>
          )}
        </div>
      </div>
      <Descriptions
        bordered
        column={1}
        size="small"
        className="ticket-list-card-bordered catalog-card__details"
      >
        <Descriptions.Item label={t('promotions.status')}>
          {statusConfig ? (
            <StatusTag label={statusConfig.label} color={statusConfig.color} />
          ) : null}
        </Descriptions.Item>
        <Descriptions.Item label={t('promotions.discount')}>
          <span className="font-medium">
            {promo.discountType === 'PERCENTAGE'
              ? `-${promo.discountValue}%`
              : `-${formatPrice(promo.discountValue, 'FCFA')}`}
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
            {promo.startDate ? formatDate(promo.startDate) : '—'} —{' '}
            {promo.endDate ? formatDate(promo.endDate) : '—'}
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
