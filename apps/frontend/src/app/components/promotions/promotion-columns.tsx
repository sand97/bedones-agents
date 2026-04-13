import { useTranslation } from 'react-i18next'
import { Button, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Pencil, Trash2 } from 'lucide-react'
import { StatusTag } from '@app/components/shared/status-tag'
import { formatPrice, formatDate } from '@app/lib/format'
import type { PromotionItem } from '@app/lib/api/agent-api'

interface PromotionColumnCallbacks {
  onEdit: (promo: PromotionItem) => void
  onDelete: (promo: PromotionItem) => void
}

export function usePromotionColumns({
  onEdit,
  onDelete,
}: PromotionColumnCallbacks): ColumnsType<PromotionItem> {
  const { t } = useTranslation()

  const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    DRAFT: { label: t('promotions.status_draft'), color: '#8b5cf6' },
    ACTIVE: { label: t('promotions.status_active'), color: '#22c55e' },
    PAUSED: { label: t('promotions.status_paused'), color: '#f59e0b' },
    EXPIRED: { label: t('promotions.status_expired'), color: '#ef4444' },
  }

  return [
    {
      title: t('promotions.name'),
      key: 'name',
      ellipsis: true,
      minWidth: 200,
      render: (_: unknown, record: PromotionItem) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-text-primary">{record.name}</div>
          {record.code && (
            <div className="truncate font-mono text-xs text-text-muted">#{record.code}</div>
          )}
        </div>
      ),
    },
    {
      title: t('promotions.discount'),
      key: 'value',
      width: 140,
      render: (_: unknown, record: PromotionItem) => (
        <span className="text-sm font-medium text-text-primary">
          {record.discountType === 'PERCENTAGE'
            ? `-${record.discountValue}%`
            : `-${formatPrice(record.discountValue, 'FCFA')}`}
        </span>
      ),
    },
    {
      title: t('promotions.products'),
      key: 'eligibility',
      width: 140,
      render: (_: unknown, record: PromotionItem) => {
        if (record.products.length === 0) {
          return (
            <span className="text-sm text-text-secondary">{t('promotions.eligibility_all')}</span>
          )
        }
        const names = record.products.map((p) => p.product.name).filter(Boolean)
        return (
          <Tooltip title={names.join(', ')}>
            <span className="text-sm text-text-secondary">
              {t('promotions.product_count', { count: record.products.length })}
            </span>
          </Tooltip>
        )
      },
    },
    {
      title: t('promotions.stackable'),
      key: 'stackable',
      width: 100,
      render: (_: unknown, record: PromotionItem) => (
        <Tag bordered={false} color={record.stackable ? 'green' : 'default'}>
          {record.stackable ? t('promotions.yes') : t('promotions.no')}
        </Tag>
      ),
    },
    {
      title: t('promotions.status'),
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: PromotionItem['status']) => {
        const config = STATUS_CONFIG[status]
        return config ? <StatusTag label={config.label} color={config.color} /> : null
      },
    },
    {
      title: t('promotions.period'),
      key: 'period',
      minWidth: 260,
      render: (_: unknown, record: PromotionItem) => (
        <span className="whitespace-nowrap text-sm text-text-secondary">
          {record.startDate ? formatDate(record.startDate) : '—'} —{' '}
          {record.endDate ? formatDate(record.endDate) : '—'}
        </span>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 230,
      render: (_: unknown, record: PromotionItem) => (
        <div className="flex items-center justify-end gap-2">
          <Button size="small" icon={<Pencil size={14} />} onClick={() => onEdit(record)}>
            {t('promotions.edit')}
          </Button>
          <Button size="small" danger icon={<Trash2 size={14} />} onClick={() => onDelete(record)}>
            {t('promotions.delete')}
          </Button>
        </div>
      ),
    },
  ]
}
