import { Table, Button, Skeleton, Dropdown } from 'antd'
import { MoreHorizontal, Pencil, Trash2, Sparkles, Link2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ArticleDescriptionCard } from '@app/components/catalog/article-description-card'
import { useCatalogColumns } from '@app/components/catalog/catalog-columns'
import { CatalogSocialEmpty } from '@app/components/catalog/catalog-social-empty'
import type { CatalogArticle } from '@app/components/whatsapp/mock-data'
import { useLayout } from '@app/contexts/layout-context'
import type { Product } from '@app/lib/api/agent-api'

interface CatalogProductsViewProps {
  products: Product[]
  tableData: CatalogArticle[]
  productsQuery: {
    isError: boolean
    error: unknown
    isLoading: boolean
    isFetching: boolean
  }
  handleConnectCatalog: () => void
  handleDeleteProduct: (productId: string) => void
  setModalProductConfig: (config: { isOpen: boolean; initialProduct?: Product }) => void
  setContextDetailFor: (product: Product | null) => void
  setLinkedPostsFor: (
    value: { kind: 'product' | 'collection'; id: string; name?: string } | null,
  ) => void
}

export function CatalogProductsView({
  products,
  tableData,
  productsQuery,
  handleConnectCatalog,
  handleDeleteProduct,
  setModalProductConfig,
  setContextDetailFor,
  setLinkedPostsFor,
}: CatalogProductsViewProps) {
  const { t } = useTranslation()
  const { isDesktop } = useLayout()
  const catalogColumns = useCatalogColumns()

  // Add actions column to table columns
  const columnsWithActions = [
    ...catalogColumns,
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_: unknown, record: { id: string }) => {
        const product = products.find((p) => p.id === record.id)
        return (
          <Dropdown
            menu={{
              items: [
                {
                  key: 'edit',
                  label: t('catalog.edit_article'),
                  icon: <Pencil size={14} />,
                  onClick: () =>
                    product && setModalProductConfig({ isOpen: true, initialProduct: product }),
                },
                {
                  key: 'context',
                  label: 'Voir le contexte',
                  icon: <Sparkles size={14} />,
                  onClick: () => product && setContextDetailFor(product),
                },
                {
                  key: 'linked-posts',
                  label: 'Posts liés',
                  icon: <Link2 size={14} />,
                  onClick: () =>
                    product &&
                    setLinkedPostsFor({
                      kind: 'product',
                      id: product.id,
                      name: product.name,
                    }),
                },
                { type: 'divider' as const },
                {
                  key: 'delete',
                  label: t('catalog.delete_article'),
                  icon: <Trash2 size={14} />,
                  danger: true,
                  onClick: () => handleDeleteProduct(record.id),
                },
              ],
            }}
            trigger={['click']}
          >
            <Button type="text" icon={<MoreHorizontal size={16} />} size="small" />
          </Dropdown>
        )
      },
    },
  ]

  return productsQuery.isError ? (
    <CatalogSocialEmpty error={productsQuery.error} onReconnect={handleConnectCatalog} />
  ) : isDesktop ? (
    productsQuery.isLoading ? (
      <Table
        dataSource={[]}
        columns={columnsWithActions}
        rowKey="id"
        bordered
        pagination={false}
        className="tickets-table"
        size="middle"
        locale={{ emptyText: ' ' }}
        loading={{ spinning: true }}
      />
    ) : (
      <Table
        dataSource={tableData}
        columns={columnsWithActions}
        rowKey="id"
        bordered
        pagination={false}
        className="tickets-table"
        size="middle"
        loading={productsQuery.isFetching}
      />
    )
  ) : productsQuery.isLoading ? (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="catalog-card">
          <div className="catalog-card__header">
            <Skeleton.Avatar shape="square" size={44} active />
            <div className="min-w-0 flex-1">
              <Skeleton title={{ width: '60%' }} paragraph={{ rows: 1, width: '40%' }} active />
            </div>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <div
      className="flex flex-col gap-3"
      style={productsQuery.isFetching ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
    >
      {tableData.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-sm text-text-muted">
          {t('catalog.no_articles')}
        </div>
      ) : (
        tableData.map((article) => {
          const product = products.find((p) => p.id === article.id)
          return (
            <ArticleDescriptionCard
              key={article.id}
              article={article}
              actions={
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: 'edit',
                        label: t('catalog.edit_article'),
                        icon: <Pencil size={14} />,
                        onClick: () =>
                          product &&
                          setModalProductConfig({ isOpen: true, initialProduct: product }),
                      },
                      {
                        key: 'context',
                        label: 'Voir le contexte',
                        icon: <Sparkles size={14} />,
                        onClick: () => product && setContextDetailFor(product),
                      },
                      {
                        key: 'linked-posts',
                        label: 'Posts liés',
                        icon: <Link2 size={14} />,
                        onClick: () =>
                          product &&
                          setLinkedPostsFor({
                            kind: 'product',
                            id: product.id,
                            name: product.name,
                          }),
                      },
                      { type: 'divider' as const },
                      {
                        key: 'delete',
                        label: t('catalog.delete_article'),
                        icon: <Trash2 size={14} />,
                        danger: true,
                        onClick: () => handleDeleteProduct(article.id),
                      },
                    ],
                  }}
                  trigger={['click']}
                >
                  <Button type="text" icon={<MoreHorizontal size={16} />} size="small" />
                </Dropdown>
              }
            />
          )
        })
      )}
    </div>
  )
}
