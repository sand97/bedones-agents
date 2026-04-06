import { useTranslation } from 'react-i18next'
import { Descriptions } from 'antd'
import { StatusTag } from '@app/components/shared/status-tag'
import { formatPrice } from '@app/lib/format'
import { CATALOG_STATUS_CONFIG, type CatalogArticle } from '@app/components/whatsapp/mock-data'

export function ArticleDescriptionCard({ article }: { article: CatalogArticle }) {
  const { t } = useTranslation()
  const statusConfig = CATALOG_STATUS_CONFIG[article.status]
  return (
    <div className="catalog-card">
      <div className="catalog-card__header">
        <img src={article.imageUrl} alt={article.name} className="catalog-article-image" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-text-primary">{article.name}</div>
          <div className="truncate text-xs text-text-muted">{article.description}</div>
        </div>
      </div>
      <Descriptions
        bordered
        column={1}
        size="small"
        className="ticket-list-card-bordered catalog-card__details"
      >
        <Descriptions.Item label={t('catalog.status')}>
          <StatusTag label={statusConfig.label} color={statusConfig.color} />
        </Descriptions.Item>
        <Descriptions.Item label={t('catalog.category')}>
          <span className="text-text-secondary">{article.category}</span>
        </Descriptions.Item>
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
