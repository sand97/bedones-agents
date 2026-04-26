import { useTranslation } from 'react-i18next'
import { Button, Descriptions } from 'antd'
import { Trash2 } from 'lucide-react'
import { StatusTag } from '@app/components/shared/status-tag'
import { formatDate } from '@app/lib/format'
import type { LoyaltyCampaign } from '@app/lib/api/loyalty-api'

interface Props {
  campaign: LoyaltyCampaign
  onDelete: () => void
}

export function LoyaltyCampaignDescriptionCard({ campaign, onDelete }: Props) {
  const { t } = useTranslation()

  const STATUS_CONFIG: Record<LoyaltyCampaign['status'], { label: string; color: string }> = {
    DRAFT: { label: t('promotions.status_draft'), color: '#8b5cf6' },
    SCHEDULED: { label: t('loyalty.status_scheduled'), color: '#3b82f6' },
    RUNNING: { label: t('loyalty.status_running'), color: '#22c55e' },
    COMPLETED: { label: t('loyalty.status_completed'), color: '#64748b' },
    PAUSED: { label: t('promotions.status_paused'), color: '#f59e0b' },
  }
  const statusConfig = STATUS_CONFIG[campaign.status]

  const FREQ_LABEL: Record<LoyaltyCampaign['frequency'], string> = {
    ONCE: t('loyalty.frequency_once'),
    DAILY: t('loyalty.frequency_daily'),
    WEEKLY: t('loyalty.frequency_weekly'),
    MONTHLY: t('loyalty.frequency_monthly'),
  }

  return (
    <div className="catalog-card">
      <div className="catalog-card__header">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-text-primary">{campaign.name}</div>
          {campaign.bonus && (
            <div className="truncate text-xs text-text-muted">{campaign.bonus.name}</div>
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
        <Descriptions.Item label={t('loyalty.col_started')}>
          <span className="text-text-secondary">
            {campaign.startDate ? formatDate(campaign.startDate) : '—'}
          </span>
        </Descriptions.Item>
        <Descriptions.Item label={t('loyalty.col_ends')}>
          <span className="text-text-secondary">
            {campaign.endDate ? formatDate(campaign.endDate) : '—'}
          </span>
        </Descriptions.Item>
        <Descriptions.Item label={t('loyalty.col_frequency')}>
          {FREQ_LABEL[campaign.frequency]}
        </Descriptions.Item>
        <Descriptions.Item label={t('loyalty.col_delivered')}>
          <span className="font-medium">{campaign.deliveredCount ?? 0}</span>
        </Descriptions.Item>
        <Descriptions.Item label={t('loyalty.col_read')}>
          <span className="font-medium">{campaign.readCount ?? 0}</span>
        </Descriptions.Item>
        <Descriptions.Item label={t('loyalty.col_replied')}>
          <span className="font-medium">{campaign.repliedCount ?? 0}</span>
        </Descriptions.Item>
        <Descriptions.Item label={t('promotions.actions')}>
          <Button size="small" danger icon={<Trash2 size={14} />} onClick={onDelete}>
            {t('common.delete')}
          </Button>
        </Descriptions.Item>
      </Descriptions>
    </div>
  )
}
