import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Descriptions } from 'antd'
import { StatusTag } from '@app/components/shared/status-tag'
import { formatPrice } from '@app/lib/format'
import { resolveCategory } from '@app/lib/product-categories'
import { CATALOG_STATUS_CONFIG, type CatalogArticle } from '@app/components/whatsapp/mock-data'

interface ArticleDescriptionCardProps {
  article: CatalogArticle
  actions?: ReactNode
}

export function ArticleDescriptionCard({ article, actions }: ArticleDescriptionCardProps) {
  const { t } = useTranslation()
  const { t: tCat } = useTranslation('categories')
  const statusConfig = CATALOG_STATUS_CONFIG[article.status]
  return (
    <div className="catalog-card">
      <div className="catalog-card__header">
        <img src={article.imageUrl} alt={article.name} className="catalog-article-image" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-text-primary">{article.name}</div>
          <div className="truncate text-xs text-text-muted">{article.description}</div>
        </div>
        {actions}
      </div>
      <Descriptions
        bordered
        column={1}
        size="small"
        className="ticket-list-card-bordered catalog-card__details"
      >
        <Descriptions.Item label={t('catalog.content_id')}>
          <span className="text-xs text-text-muted">{article.contentId}</span>
        </Descriptions.Item>
        <Descriptions.Item label={t('catalog.status')}>
          <StatusTag label={t(statusConfig.labelKey)} color={statusConfig.color} />
        </Descriptions.Item>
        <Descriptions.Item label={t('catalog.category')}>
          <span className="text-text-secondary">{resolveCategory(article.category, tCat)}</span>
        </Descriptions.Item>
        {article.collection && (
          <Descriptions.Item label={t('catalog.collection')}>
            <span className="text-text-secondary">{article.collection}</span>
          </Descriptions.Item>
        )}
        <Descriptions.Item label={t('catalog.price')}>
          <span className="font-medium">{formatPrice(article.price, article.currency)}</span>
        </Descriptions.Item>
        <Descriptions.Item label={t('catalog.stock')}>
          <span className="text-text-secondary">
            {t('catalog.unit_count', { count: article.stock })}
          </span>
        </Descriptions.Item>
      </Descriptions>
    </div>
  )
}
