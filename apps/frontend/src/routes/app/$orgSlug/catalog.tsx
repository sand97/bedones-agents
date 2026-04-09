import { useState, useMemo } from 'react'
import { createFileRoute, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Table, Input, Button, Spin, Dropdown, Modal } from 'antd'
import {
  Search,
  ChevronDown,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  ShoppingBag,
} from 'lucide-react'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { CatalogEmpty } from '@app/components/catalog/catalog-empty'
import { TablePagination } from '@app/components/shared/table-pagination'
import { FilterPopover } from '@app/components/shared/filter-popover'
import { ProductModal } from '@app/components/catalog/product-modal'
import { CollectionModal } from '@app/components/catalog/collection-modal'
import { CollectionList } from '@app/components/catalog/collection-list'
import { ArticleDescriptionCard } from '@app/components/catalog/article-description-card'
import { useCatalogColumns } from '@app/components/catalog/catalog-columns'
import { AccountSwitcher } from '@app/components/social/account-switcher'
import { useLayout } from '@app/contexts/layout-context'
import { catalogApi } from '@app/lib/api/agent-api'
import { setAuthRedirect, buildFacebookOAuthUrl } from '@app/lib/auth-redirect'
import type { Product, Collection } from '@app/lib/api/agent-api'

export const Route = createFileRoute('/app/$orgSlug/catalog')({
  component: CatalogPage,
})

const DEFAULT_LIMIT = 20

const STATUS_FILTER_OPTIONS = [
  { key: 'approved', label: 'status_published', color: '#52c41a' },
  { key: 'pending', label: 'status_draft', color: '#faad14' },
  { key: 'rejected', label: 'status_archived', color: '#ff4d4f' },
]

type ViewTab = 'articles' | 'collections'

function CatalogPage() {
  const { t } = useTranslation()
  const { orgSlug } = useParams({ strict: false }) as { orgSlug: string }
  const { isDesktop } = useLayout()
  const catalogColumns = useCatalogColumns()
  const queryClient = useQueryClient()

  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [cursorStack, setCursorStack] = useState<string[]>([])
  const [afterCursor, setAfterCursor] = useState<string | undefined>(undefined)
  const [pageSize, setPageSize] = useState(DEFAULT_LIMIT)
  const [activeTab, setActiveTab] = useState<ViewTab>('articles')

  const currentPage = cursorStack.length + 1

  // Product CRUD state
  const [createProductOpen, setCreateProductOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | undefined>(undefined)

  // Collection CRUD state
  const [collectionModalOpen, setCollectionModalOpen] = useState(false)
  const [editCollection, setEditCollection] = useState<Collection | undefined>(undefined)

  // ─── Queries ───

  const catalogsQuery = useQuery({
    queryKey: ['catalogs', orgSlug],
    queryFn: () => catalogApi.list(orgSlug),
    staleTime: 5 * 60 * 1000,
  })

  const catalogs = catalogsQuery.data || []
  const selectedCatalog = useMemo(
    () => catalogs.find((c) => c.id === selectedCatalogId) ?? catalogs[0] ?? null,
    [catalogs, selectedCatalogId],
  )

  const productsQuery = useQuery({
    queryKey: [
      'catalog-products',
      selectedCatalog?.id,
      searchText,
      selectedStatuses,
      afterCursor,
      pageSize,
    ],
    queryFn: () =>
      selectedCatalog
        ? catalogApi.getProducts(selectedCatalog.id, {
            search: searchText || undefined,
            status: selectedStatuses.length === 1 ? selectedStatuses[0] : undefined,
            after: afterCursor,
            limit: pageSize,
          })
        : Promise.resolve({ products: [], total: 0, hasMore: false }),
    enabled: !!selectedCatalog,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  })

  const collectionsQuery = useQuery({
    queryKey: ['catalog-collections', selectedCatalog?.id],
    queryFn: () =>
      selectedCatalog ? catalogApi.listCollections(selectedCatalog.id) : Promise.resolve([]),
    enabled: !!selectedCatalog && activeTab === 'collections',
    staleTime: 5 * 60 * 1000,
  })

  const products = productsQuery.data?.products || []
  const totalProducts = productsQuery.data?.total || 0

  // Filter client-side for multi-status + categories
  const filteredProducts = useMemo(() => {
    let result = products

    if (selectedStatuses.length > 1) {
      result = result.filter((p) => selectedStatuses.includes(p.status))
    }

    if (selectedCategories.length > 0) {
      result = result.filter((p) => p.category && selectedCategories.includes(p.category))
    }

    return result
  }, [products, selectedStatuses, selectedCategories])

  const allCategories = useMemo(() => {
    const cats = products.map((p) => p.category).filter((c): c is string => !!c && !/^\d+$/.test(c))
    return [...new Set(cats)].sort()
  }, [products])

  const categoryFilterOptions = useMemo(
    () => allCategories.map((cat) => ({ key: cat, label: cat })),
    [allCategories],
  )

  // ─── Mutations ───

  // Product mutations
  const createProductMutation = useMutation({
    mutationFn: (data: Parameters<typeof catalogApi.createProduct>[1]) =>
      selectedCatalog ? catalogApi.createProduct(selectedCatalog.id, data) : Promise.reject(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-products', selectedCatalog?.id] })
      setCreateProductOpen(false)
    },
  })

  const updateProductMutation = useMutation({
    mutationFn: ({
      productId,
      data,
    }: {
      productId: string
      data: Parameters<typeof catalogApi.updateProduct>[2]
    }) =>
      selectedCatalog
        ? catalogApi.updateProduct(selectedCatalog.id, productId, data)
        : Promise.reject(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-products', selectedCatalog?.id] })
      setEditProduct(undefined)
    },
  })

  const deleteProductMutation = useMutation({
    mutationFn: (productId: string) =>
      selectedCatalog ? catalogApi.deleteProduct(selectedCatalog.id, productId) : Promise.reject(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-products', selectedCatalog?.id] })
    },
  })

  // Collection mutations
  const createCollectionMutation = useMutation({
    mutationFn: (data: { name: string }) =>
      selectedCatalog ? catalogApi.createCollection(selectedCatalog.id, data) : Promise.reject(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-collections', selectedCatalog?.id] })
      setCollectionModalOpen(false)
    },
  })

  const updateCollectionMutation = useMutation({
    mutationFn: ({ collectionId, data }: { collectionId: string; data: { name?: string } }) =>
      selectedCatalog
        ? catalogApi.updateCollection(selectedCatalog.id, collectionId, data)
        : Promise.reject(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-collections', selectedCatalog?.id] })
      setEditCollection(undefined)
      setCollectionModalOpen(false)
    },
  })

  const deleteCollectionMutation = useMutation({
    mutationFn: (collectionId: string) =>
      selectedCatalog
        ? catalogApi.deleteCollection(selectedCatalog.id, collectionId)
        : Promise.reject(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-collections', selectedCatalog?.id] })
    },
  })

  // ─── Handlers ───

  const resetPagination = () => {
    setCursorStack([])
    setAfterCursor(undefined)
  }

  const toggleStatus = (status: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    )
    resetPagination()
  }

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    )
    resetPagination()
  }

  const handleDeleteProduct = (productId: string) => {
    Modal.confirm({
      title: t('catalog.delete_article'),
      content: t('catalog.delete_article_confirm'),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => {
        deleteProductMutation.mutate(productId)
      },
    })
  }

  const handleConnectCatalog = () => {
    setAuthRedirect({
      intent: 'connect_pages',
      orgId: orgSlug,
      provider: 'facebook',
      pageId: 'catalog',
      scopes: ['catalog_management', 'commerce_account_manage_orders'],
    })
    const configId = import.meta.env.VITE_CATALOGUE_CONFIGGURATION_ID
    window.location.href = buildFacebookOAuthUrl(configId)
  }

  const statusButtonLabel =
    selectedStatuses.length > 0 ? `Status (${selectedStatuses.length})` : 'Status'

  const categoryButtonLabel =
    selectedCategories.length > 0
      ? t('catalog.category_with_count', { count: selectedCategories.length })
      : t('catalog.category')

  // Translate status filter labels
  const translatedStatusOptions = STATUS_FILTER_OPTIONS.map((o) => ({
    ...o,
    label: t(`catalog.${o.label}`),
  }))

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
                  onClick: () => product && setEditProduct(product),
                },
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

  // ─── Empty state ───

  if (!catalogsQuery.isLoading && catalogs.length === 0) {
    return (
      <div className="flex min-h-screen flex-col">
        <DashboardHeader title={t('catalog.title')} />
        <CatalogEmpty onConnect={handleConnectCatalog} />
      </div>
    )
  }

  // Map products to the format expected by catalogColumns
  const tableData = filteredProducts.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description || '',
    imageUrl: p.imageUrl || '',
    price: p.price ?? 0,
    currency: p.currency || 'XAF',
    category: p.category && !/^\d+$/.test(p.category) ? p.category : t('catalog.uncategorized'),
    stock: typeof p.inventory === 'number' ? p.inventory : 0,
    status: (p.status === 'approved'
      ? 'active'
      : p.status === 'pending'
        ? 'draft'
        : 'out_of_stock') as 'active' | 'draft' | 'out_of_stock',
  }))

  // AccountSwitcher data
  const switcherAccounts = catalogs.map((c) => ({ id: c.id, name: c.name }))
  const currentSwitcherAccount = selectedCatalog
    ? { id: selectedCatalog.id, name: selectedCatalog.name }
    : switcherAccounts[0]

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        title={t('catalog.title')}
        action={
          currentSwitcherAccount && (
            <AccountSwitcher
              accounts={switcherAccounts}
              currentAccount={currentSwitcherAccount}
              connectLabel={t('common.add')}
              icon={<ShoppingBag size={16} strokeWidth={1.5} />}
              onSwitch={(account) => {
                setSelectedCatalogId(account.id)
                resetPagination()
              }}
              onConnect={handleConnectCatalog}
            />
          )
        }
      />

      <div className="flex-1 p-4 pb-16 lg:p-6 lg:pb-16">
        {/* Tab filter buttons */}
        <div className="mb-4 flex items-center gap-2">
          <Button
            type={activeTab === 'articles' ? 'primary' : 'default'}
            size="small"
            onClick={() => setActiveTab('articles')}
            className="comments-filter-btn"
          >
            {t('catalog.articles')}
          </Button>
          <Button
            type={activeTab === 'collections' ? 'primary' : 'default'}
            size="small"
            onClick={() => setActiveTab('collections')}
            className="comments-filter-btn"
          >
            {t('catalog.collections')}
          </Button>
        </div>

        {activeTab === 'articles' ? (
          <>
            <div className="tickets-filters">
              <Input
                placeholder={t('catalog.search_placeholder')}
                prefix={<Search size={16} className="text-text-muted" />}
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value)
                  resetPagination()
                }}
                allowClear
                className="tickets-filter-input"
              />
              <FilterPopover
                title={t('catalog.filter_status')}
                options={translatedStatusOptions}
                selected={selectedStatuses}
                onToggle={toggleStatus}
              >
                <button type="button" className="tickets-status-trigger">
                  <span>{statusButtonLabel}</span>
                  <ChevronDown size={14} className="text-text-muted" />
                </button>
              </FilterPopover>
              <FilterPopover
                title={t('catalog.filter_category')}
                options={categoryFilterOptions}
                selected={selectedCategories}
                onToggle={toggleCategory}
              >
                <button type="button" className="tickets-status-trigger">
                  <span>{categoryButtonLabel}</span>
                  <ChevronDown size={14} className="text-text-muted" />
                </button>
              </FilterPopover>

              <div className="ml-auto">
                <Button onClick={() => setCreateProductOpen(true)} icon={<Plus size={14} />}>
                  {t('catalog.add_article')}
                </Button>
              </div>
            </div>

            {productsQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Spin />
              </div>
            ) : isDesktop ? (
              <Table
                dataSource={tableData}
                columns={columnsWithActions}
                rowKey="id"
                bordered
                pagination={false}
                className="tickets-table"
                size="middle"
              />
            ) : (
              <div className="flex flex-col gap-3">
                {tableData.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-sm text-text-muted">
                    {t('catalog.no_articles')}
                  </div>
                ) : (
                  tableData.map((article) => (
                    <ArticleDescriptionCard key={article.id} article={article} />
                  ))
                )}
              </div>
            )}

            <TablePagination
              current={currentPage}
              pageSize={pageSize}
              total={totalProducts}
              hasMore={productsQuery.data?.hasMore}
              onChange={(page, newPageSize) => {
                if (newPageSize !== pageSize) {
                  setPageSize(newPageSize)
                  resetPagination()
                  return
                }
                if (page > currentPage && productsQuery.data?.cursors?.after) {
                  setCursorStack((prev) => [...prev, afterCursor ?? ''])
                  setAfterCursor(productsQuery.data.cursors.after)
                } else if (page < currentPage) {
                  setCursorStack((prev) => {
                    const next = [...prev]
                    const prevCursor = next.pop()
                    setAfterCursor(prevCursor || undefined)
                    return next
                  })
                }
              }}
              itemLabel="article"
            />
          </>
        ) : (
          <CollectionList
            collections={collectionsQuery.data || []}
            loading={collectionsQuery.isLoading}
            onAdd={() => {
              setEditCollection(undefined)
              setCollectionModalOpen(true)
            }}
            onEdit={(collection) => {
              setEditCollection(collection)
              setCollectionModalOpen(true)
            }}
            onDelete={(collection) => deleteCollectionMutation.mutate(collection.id)}
          />
        )}
      </div>

      <ProductModal
        open={createProductOpen || !!editProduct}
        onClose={() => {
          setCreateProductOpen(false)
          setEditProduct(undefined)
        }}
        onSubmit={(values) => {
          if (editProduct) {
            updateProductMutation.mutate({ productId: editProduct.id, data: values })
          } else {
            createProductMutation.mutate(values)
          }
        }}
        product={editProduct}
        loading={createProductMutation.isPending || updateProductMutation.isPending}
      />

      <CollectionModal
        open={collectionModalOpen}
        onClose={() => {
          setCollectionModalOpen(false)
          setEditCollection(undefined)
        }}
        onSubmit={(values) => {
          if (editCollection) {
            updateCollectionMutation.mutate({ collectionId: editCollection.id, data: values })
          } else {
            createCollectionMutation.mutate(values)
          }
        }}
        collection={editCollection}
        loading={createCollectionMutation.isPending || updateCollectionMutation.isPending}
      />
    </div>
  )
}
