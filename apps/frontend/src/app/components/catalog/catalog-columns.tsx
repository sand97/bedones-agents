import { useTranslation } from 'react-i18next'
import type { ColumnsType } from 'antd/es/table'
import { StatusTag } from '@app/components/shared/status-tag'
import { formatPrice } from '@app/lib/format'
import {
  CATALOG_STATUS_CONFIG,
  type CatalogArticle,
  type CatalogArticleStatus,
} from '@app/components/whatsapp/mock-data'

export function useCatalogColumns(): ColumnsType<CatalogArticle> {
  const { t } = useTranslation()

  return [
    {
      title: t('catalog.article'),
      key: 'article',
      ellipsis: true,
      render: (_: unknown, record: CatalogArticle) => (
        <div className="flex items-center gap-3">
          <img src={record.imageUrl} alt={record.name} className="catalog-article-image" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-text-primary">{record.name}</div>
            <div className="truncate text-xs text-text-muted">{record.description}</div>
          </div>
        </div>
      ),
    },
    {
      title: t('catalog.category'),
      dataIndex: 'category',
      key: 'category',
      width: 140,
      render: (cat: string) => <span className="text-sm text-text-secondary">{cat}</span>,
    },
    {
      title: t('catalog.collection'),
      dataIndex: 'collection',
      key: 'collection',
      width: 140,
      render: (col: string | undefined) => (
        <span className="text-sm text-text-secondary">{col || '—'}</span>
      ),
    },
    {
      title: t('catalog.price'),
      key: 'price',
      width: 140,
      render: (_: unknown, record: CatalogArticle) => (
        <span className="text-sm font-medium text-text-primary">
          {formatPrice(record.price, record.currency)}
        </span>
      ),
      sorter: (a: CatalogArticle, b: CatalogArticle) => a.price - b.price,
    },
    {
      title: t('catalog.stock'),
      dataIndex: 'stock',
      key: 'stock',
      width: 100,
      render: (stock: number | null | undefined) => (
        <span className="text-sm text-text-secondary">
          {stock != null ? t('catalog.unit_count', { count: stock }) : '—'}
        </span>
      ),
      sorter: (a: CatalogArticle, b: CatalogArticle) => (a.stock ?? 0) - (b.stock ?? 0),
    },
    {
      title: t('catalog.status'),
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: CatalogArticleStatus) => {
        const config = CATALOG_STATUS_CONFIG[status] ?? CATALOG_STATUS_CONFIG.draft
        return <StatusTag label={t(config.labelKey)} color={config.color} />
      },
    },
  ]
}
