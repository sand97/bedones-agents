import { useTranslation } from 'react-i18next'
import { Button, Descriptions, Tag, Tooltip } from 'antd'
import { Pencil, Trash2 } from 'lucide-react'
import { StatusTag } from '@app/components/shared/status-tag'
import { formatDate, formatPrice } from '@app/lib/format'
import type { LoyaltyBonus } from '@app/lib/api/loyalty-api'

interface Props {
  bonus: LoyaltyBonus
  onEdit: () => void
  onDelete: () => void
}

export function LoyaltyBonusDescriptionCard({ bonus, onEdit, onDelete }: Props) {
  const { t } = useTranslation()

  const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    DRAFT: { label: t('promotions.status_draft'), color: '#8b5cf6' },
    ACTIVE: { label: t('promotions.status_active'), color: '#22c55e' },
    PAUSED: { label: t('promotions.status_paused'), color: '#f59e0b' },
    EXPIRED: { label: t('promotions.status_expired'), color: '#ef4444' },
  }
  const statusConfig = STATUS_CONFIG[bonus.status]

  const targetParts: string[] = []
  if (bonus.targetSpend !== null && bonus.targetSpend !== undefined)
    targetParts.push(
      `${t('loyalty.target_spend_short')}: ${formatPrice(bonus.targetSpend, 'FCFA')}`,
    )
  if (bonus.targetOrderCount !== null && bonus.targetOrderCount !== undefined)
    targetParts.push(`${t('loyalty.target_orders_short')}: ${bonus.targetOrderCount}`)
  if (
    (bonus.targetProductsCount !== null && bonus.targetProductsCount !== undefined) ||
    bonus.triggerProducts.length > 0
  ) {
    targetParts.push(
      `${t('loyalty.target_products_short')}: ${bonus.targetProductsCount ?? bonus.triggerProducts.length}`,
    )
  }
  const targetsLabel = targetParts.length ? targetParts.join(' · ') : '—'

  let rewardLabel: React.ReactNode
  if (bonus.rewardType === 'CREDIT') {
    rewardLabel = formatPrice(bonus.rewardCredit ?? 0, 'FCFA')
  } else if (bonus.rewardType === 'PERCENT') {
    rewardLabel = `-${bonus.rewardPercent ?? 0}%`
  } else {
    const names = bonus.rewardProducts.map((p) => p.product.name).filter(Boolean)
    rewardLabel = (
      <Tooltip title={names.join(', ')}>
        <span>{t('loyalty.products_count', { count: bonus.rewardProducts.length })}</span>
      </Tooltip>
    )
  }

  return (
    <div className="catalog-card">
      <div className="catalog-card__header">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-text-primary">{bonus.name}</div>
          {bonus.description && (
            <div className="truncate text-xs text-text-muted">{bonus.description}</div>
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
        <Descriptions.Item label={t('loyalty.bonus_targets')}>
          <span className="text-text-secondary">{targetsLabel}</span>
        </Descriptions.Item>
        <Descriptions.Item label={t('loyalty.reward')}>
          <span className="font-medium">{rewardLabel}</span>
        </Descriptions.Item>
        <Descriptions.Item label={t('promotions.stackable')}>
          <Tag bordered={false} color={bonus.stackable ? 'green' : 'default'}>
            {bonus.stackable ? t('promotions.yes') : t('promotions.no')}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label={t('promotions.period')}>
          <span className="text-text-secondary">
            {bonus.startDate ? formatDate(bonus.startDate) : '—'} —{' '}
            {bonus.endDate ? formatDate(bonus.endDate) : '—'}
          </span>
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
