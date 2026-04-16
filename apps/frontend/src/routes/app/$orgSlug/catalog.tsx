import { useState, useMemo, useCallback } from 'react'
import { createFileRoute, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Table, Input, Button, Skeleton, Dropdown, Modal } from 'antd'
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
import { CatalogIndexingBanner } from '@app/components/catalog/catalog-indexing-banner'
import { CatalogEmpty } from '@app/components/catalog/catalog-empty'
import { TablePagination } from '@app/components/shared/table-pagination'
import { FilterPopover } from '@app/components/shared/filter-popover'
import { ProductModal } from '@app/components/catalog/product-modal'
import { CollectionFilterSelect } from '@app/components/catalog/collection-filter-select'
import { ArticleDescriptionCard } from '@app/components/catalog/article-description-card'
import { useCatalogColumns } from '@app/components/catalog/catalog-columns'
import type { CatalogArticle } from '@app/components/whatsapp/mock-data'
import { AccountSwitcher } from '@app/components/social/account-switcher'
import { useLayout } from '@app/contexts/layout-context'
import { catalogApi } from '@app/lib/api/agent-api'
import { setAuthRedirect, buildFacebookOAuthUrl } from '@app/lib/auth-redirect'
import type { Product } from '@app/lib/api/agent-api'

export const Route = createFileRoute('/app/$orgSlug/catalog')({
  component: CatalogPage,
  validateSearch: (search: Record<string, unknown>) => ({
    catalogId: (search.catalogId as string) || undefined,
    status: (search.status as string) || undefined,
    collection: (search.collection as string) || undefined,
    page: Number(search.page) || undefined,
  }),
})

const DEFAULT_LIMIT = 20

const STATUS_FILTER_OPTIONS = [
  { key: 'approved', label: 'status_published', color: '#52c41a' },
  { key: 'pending', label: 'status_draft', color: '#faad14' },
  { key: 'rejected', label: 'status_archived', color: '#ff4d4f' },
]

function CatalogPage() {
  const { t } = useTranslation()
  const { orgSlug } = useParams({ strict: false }) as { orgSlug: string }
  const search = useSearch({ from: '/app/$orgSlug/catalog' })
  const navigate = useNavigate()
  const { isDesktop } = useLayout()
  const catalogColumns = useCatalogColumns()
  const queryClient = useQueryClient()

  const [searchText, setSearchText] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(
    search.status ? [search.status] : [],
  )
  const [cursorStack, setCursorStack] = useState<string[]>([])
  const [afterCursor, setAfterCursor] = useState<string | undefined>(undefined)
  const [pageSize, setPageSize] = useState(DEFAULT_LIMIT)

  const currentPage = cursorStack.length + 1

  // Product modal state — single source of truth
  const [modalProductConfig, setModalProductConfig] = useState<{
    isOpen: boolean
    initialProduct?: Product
  }>({ isOpen: false })

  // URL params helpers
  const updateSearch = useCallback(
    (updates: Record<string, string | undefined>) => {
      navigate({
        search: (prev: Record<string, unknown>) =>
          ({
            ...prev,
            ...updates,
          }) as never,
        replace: true,
      })
    },
    [navigate],
  )

  const selectedCatalogId = search.catalogId || null
  const selectedCollectionId = search.collection || undefined

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
      selectedCollectionId,
      afterCursor,
      pageSize,
    ],
    queryFn: () =>
      selectedCatalog
        ? catalogApi.getProducts(selectedCatalog.id, {
            search: searchText || undefined,
            status: selectedStatuses.length === 1 ? selectedStatuses[0] : undefined,
            collectionId: selectedCollectionId,
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
    enabled: !!selectedCatalog,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  })

  const products = productsQuery.data?.products || []
  const totalProducts = productsQuery.data?.total || 0
  const collections = collectionsQuery.data || []

  // Filter client-side for multi-status
  const filteredProducts = useMemo(() => {
    let result = products

    if (selectedStatuses.length > 1) {
      result = result.filter((p) => selectedStatuses.includes(p.status))
    }

    return result
  }, [products, selectedStatuses])

  // ─── Mutations ───

  // Product mutations
  const createProductMutation = useMutation({
    mutationFn: (data: Parameters<typeof catalogApi.createProduct>[1]) =>
      selectedCatalog ? catalogApi.createProduct(selectedCatalog.id, data) : Promise.reject(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-products', selectedCatalog?.id] })
      setModalProductConfig({ isOpen: false })
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
      setModalProductConfig({ isOpen: false })
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
    },
  })

  const updateCollectionMutation = useMutation({
    mutationFn: ({ collectionId, data }: { collectionId: string; data: { name?: string } }) =>
      selectedCatalog
        ? catalogApi.updateCollection(selectedCatalog.id, collectionId, data)
        : Promise.reject(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-collections', selectedCatalog?.id] })
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
    updateSearch({ page: undefined })
  }

  const toggleStatus = (status: string) => {
    setSelectedStatuses((prev) => {
      const next = prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
      updateSearch({ status: next.length === 1 ? next[0] : undefined })
      return next
    })
    resetPagination()
  }

  const handleDeleteProduct = (productId: string) => {
    Modal.confirm({
      title: t('catalog.delete_article'),
      content: t('catalog.delete_article_confirm'),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => deleteProductMutation.mutateAsync(productId),
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
                  onClick: () =>
                    product && setModalProductConfig({ isOpen: true, initialProduct: product }),
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
  const tableData: CatalogArticle[] = filteredProducts.map((p) => ({
    id: p.id,
    contentId: p.retailerId || p.id,
    name: p.name,
    description: p.description || '',
    imageUrl: p.imageUrl || '',
    price: p.price ?? 0,
    currency: p.currency || 'XAF',
    category: p.category || t('catalog.uncategorized'),
    stock: typeof p.inventory === 'number' ? p.inventory : 0,
    collection: p.collectionName,
    createdAt: (p as unknown as { createdAt?: string }).createdAt || new Date().toISOString(),
    status: (p.status === 'approved'
      ? 'published'
      : p.status === 'pending'
        ? 'draft'
        : 'archived') as 'published' | 'draft' | 'archived',
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
        mobileTitle=" "
        action={
          currentSwitcherAccount && (
            <AccountSwitcher
              accounts={switcherAccounts}
              currentAccount={currentSwitcherAccount}
              connectLabel={t('common.add')}
              icon={<ShoppingBag size={16} strokeWidth={1.5} />}
              onSwitch={(account) => {
                updateSearch({ catalogId: account.id, collection: undefined })
                resetPagination()
              }}
              onConnect={handleConnectCatalog}
            />
          )
        }
      />

      <CatalogIndexingBanner catalogs={catalogs} />

      <div className="flex-1 p-4 pb-16 lg:p-6 lg:pb-16">
        <div className="tickets-filters catalog-filters">
          <div className="flex flex-1 items-center gap-3 lg:contents">
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
          </div>
          <div className="flex flex-1 items-center gap-3 lg:contents">
            <div className="flex-1 lg:flex-none">
              <CollectionFilterSelect
                collections={collections}
                selected={selectedCollectionId}
                onSelect={(id) => {
                  updateSearch({ collection: id })
                  resetPagination()
                }}
                loading={collectionsQuery.isLoading}
                onAdd={(name) => createCollectionMutation.mutate({ name })}
                onEdit={(collection, name) =>
                  updateCollectionMutation.mutate({
                    collectionId: collection.id,
                    data: { name },
                  })
                }
                onDelete={(collection) => deleteCollectionMutation.mutate(collection.id)}
                mutating={createCollectionMutation.isPending || updateCollectionMutation.isPending}
              />
            </div>
            <div className="flex-1 lg:ml-auto lg:flex-none">
              <Button
                onClick={() => setModalProductConfig({ isOpen: true })}
                icon={<Plus size={14} />}
                block={!isDesktop}
              >
                {t('catalog.add_article')}
              </Button>
            </div>
          </div>
        </div>

        {isDesktop ? (
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
                    <Skeleton
                      title={{ width: '60%' }}
                      paragraph={{ rows: 1, width: '40%' }}
                      active
                    />
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
              updateSearch({ page: String(page) })
            } else if (page < currentPage) {
              setCursorStack((prev) => {
                const next = [...prev]
                const prevCursor = next.pop()
                setAfterCursor(prevCursor || undefined)
                return next
              })
              updateSearch({ page: page > 1 ? String(page) : undefined })
            }
          }}
          itemLabel="article"
        />
      </div>

      <ProductModal
        collections={collections}
        open={modalProductConfig.isOpen}
        onClose={() => setModalProductConfig({ isOpen: false })}
        onSubmit={(values) => {
          const [firstImage, ...extraImages] = values.imageUrls ?? []
          const apiData = {
            name: values.name,
            description: values.description,
            imageUrl: firstImage,
            additionalImageUrls: extraImages,
            price: values.price != null ? String(values.price) : undefined,
            currency: values.currency,
            category: values.category,
            url: values.url,
            availability: values.availability,
            brand: values.brand,
            condition: values.condition,
            collectionId: values.collectionId,
          }
          const editing = modalProductConfig.initialProduct
          if (editing) {
            updateProductMutation.mutate({ productId: editing.id, data: apiData })
          } else {
            createProductMutation.mutate(apiData)
          }
        }}
        product={modalProductConfig.initialProduct}
        loading={createProductMutation.isPending || updateProductMutation.isPending}
      />
    </div>
  )
}
