import { Button, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Pencil, Trash2 } from 'lucide-react'
import { StatusTag } from '@app/components/shared/status-tag'
import { formatPrice, formatDate } from '@app/lib/format'
import {
  PROMOTION_STATUS_CONFIG,
  MOCK_CATALOG_ARTICLES,
  type PromotionFull,
  type PromotionStatus,
} from '@app/components/whatsapp/mock-data'

interface PromotionColumnCallbacks {
  onEdit: (promo: PromotionFull) => void
  onDelete: (promo: PromotionFull) => void
}

export function getPromotionColumns({
  onEdit,
  onDelete,
}: PromotionColumnCallbacks): ColumnsType<PromotionFull> {
  return [
    {
      title: 'Nom',
      key: 'name',
      ellipsis: true,
      minWidth: 200,
      render: (_: unknown, record: PromotionFull) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-text-primary">{record.name}</div>
          <div className="truncate font-mono text-xs text-text-muted">#{record.code}</div>
        </div>
      ),
    },
    {
      title: 'Réduction',
      key: 'value',
      width: 140,
      render: (_: unknown, record: PromotionFull) => (
        <span className="text-sm font-medium text-text-primary">
          {record.type === 'percent'
            ? `-${record.value}%`
            : `-${formatPrice(record.value, record.currency)}`}
        </span>
      ),
    },
    {
      title: 'Produits',
      key: 'eligibility',
      width: 140,
      render: (_: unknown, record: PromotionFull) => {
        if (record.eligibility === 'all') {
          return <span className="text-sm text-text-secondary">Tous les produits</span>
        }
        const names = record.eligibleProductIds
          .map((id) => MOCK_CATALOG_ARTICLES.find((a) => a.id === id)?.name)
          .filter(Boolean)
        return (
          <Tooltip title={names.join(', ')}>
            <span className="text-sm text-text-secondary">
              {record.eligibleProductIds.length} produit
              {record.eligibleProductIds.length > 1 ? 's' : ''}
            </span>
          </Tooltip>
        )
      },
    },
    {
      title: 'Cumulable',
      key: 'stackable',
      width: 100,
      render: (_: unknown, record: PromotionFull) => (
        <Tag bordered={false} color={record.stackable ? 'green' : 'default'}>
          {record.stackable ? 'Oui' : 'Non'}
        </Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: PromotionStatus) => {
        const config = PROMOTION_STATUS_CONFIG[status]
        return <StatusTag label={config.label} color={config.color} />
      },
    },
    {
      title: 'Période',
      key: 'period',
      minWidth: 260,
      render: (_: unknown, record: PromotionFull) => (
        <span className="whitespace-nowrap text-sm text-text-secondary">
          {formatDate(record.startDate)} — {formatDate(record.endDate)}
        </span>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 230,
      render: (_: unknown, record: PromotionFull) => (
        <div className="flex items-center justify-end gap-2">
          <Button size="small" icon={<Pencil size={14} />} onClick={() => onEdit(record)}>
            Modifier
          </Button>
          <Button size="small" danger icon={<Trash2 size={14} />} onClick={() => onDelete(record)}>
            Supprimer
          </Button>
        </div>
      ),
    },
  ]
}
