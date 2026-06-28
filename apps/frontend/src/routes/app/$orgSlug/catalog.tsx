import { useState, useMemo, useCallback, useEffect } from 'react'
import { createFileRoute, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { buildShareMeta } from '@app/lib/share-meta'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Table, Input, Button, Skeleton, Dropdown, Modal, App } from 'antd'
import {
  Search,
  ChevronDown,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  ShoppingBag,
  Sparkles,
  Link2,
  Wrench,
} from 'lucide-react'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { CatalogIndexingBanner } from '@app/components/catalog/catalog-indexing-banner'
import { CatalogSyncBanner } from '@app/components/catalog/catalog-sync-banner'
import { CatalogEmpty } from '@app/components/catalog/catalog-empty'
import { TablePagination } from '@app/components/shared/table-pagination'
import { FilterPopover } from '@app/components/shared/filter-popover'
import { ProductModal } from '@app/components/catalog/product-modal'
import { CollectionFilterSelect } from '@app/components/catalog/collection-filter-select'
import { ArticleDescriptionCard } from '@app/components/catalog/article-description-card'
import { useCatalogColumns } from '@app/components/catalog/catalog-columns'
import { CatalogToolsModal } from '@app/components/catalog/catalog-tools-modal'
import { ProductContextFlowModal } from '@app/components/catalog/product-context-flow-modal'
import { PostLinkFlowModal } from '@app/components/catalog/post-link-flow-modal'
import { ProductContextDetailModal } from '@app/components/catalog/product-context-detail-modal'
import { LinkedPostsModal } from '@app/components/catalog/linked-posts-modal'
import { SharedProductsModal } from '@app/components/catalog/shared-products-modal'
import type { PickerEntity } from '@app/components/catalog/product-collection-picker'
import type { CatalogArticle } from '@app/components/whatsapp/mock-data'
import { AccountSwitcher } from '@app/components/social/account-switcher'
import { useLayout } from '@app/contexts/layout-context'
import { catalogApi, getApiErrorMessage } from '@app/lib/api/agent-api'
import { setAuthRedirect, buildFacebookOAuthUrl } from '@app/lib/auth-redirect'
import type { Product, Collection, Catalog } from '@app/lib/api/agent-api'
import { CatalogSocialEmpty } from '@app/components/catalog/catalog-social-empty'
import {
  prependDirectListCache,
  prependListItemCache,
  removeDirectListCache,
  removeListItemCache,
  updateDirectListCache,
  updateListItemCache,
} from '@app/lib/query-cache'
import { getStoredSelection, setStoredSelection } from '@app/lib/selection-storage'
import { useDebouncedValue } from '@app/hooks/use-debounced-value'

const CATALOG_SELECTION_SCOPE = 'catalog-current'

export const Route = createFileRoute('/app/$orgSlug/catalog')({
  head: () =>
    buildShareMeta({
      title: 'Voir le catalogue',
      description: 'Cliquez pour voir les produits de ce catalogue',
      image: '/og/catalog.png',
    }),
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
  const { message } = App.useApp()
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

  // Debounce the search box so typing doesn't fire an API call per keystroke.
  const debouncedSearch = useDebouncedValue(searchText.trim(), 350)
  // When the (debounced) term changes, jump back to the first page so the
  // cursor we send matches the term being queried.
  useEffect(() => {
    setCursorStack([])
    setAfterCursor(undefined)
  }, [debouncedSearch])

  const currentPage = cursorStack.length + 1

  // Product modal state — single source of truth
  const [modalProductConfig, setModalProductConfig] = useState<{
    isOpen: boolean
    initialProduct?: Product
  }>({ isOpen: false })

  // Tools modal (hosts the quick-action flows + catalog disconnect)
  const [toolsModalOpen, setToolsModalOpen] = useState(false)
  // Quick action wizards
  const [contextFlowOpen, setContextFlowOpen] = useState(false)
  const [contextFlowEdit, setContextFlowEdit] = useState<{
    targets: PickerEntity[]
    currentContext: string
  } | null>(null)
  const [postLinkFlowOpen, setPostLinkFlowOpen] = useState(false)
  // Optional seed when the flow is opened from an article's "linked posts" modal:
  // pre-select that article and jump straight to page selection.
  const [postLinkSeed, setPostLinkSeed] = useState<
    { selected: PickerEntity[]; step: 'pick' | 'page' | 'posts' } | undefined
  >(undefined)
  // Per-product context / linked-posts modals
  const [contextDetailFor, setContextDetailFor] = useState<Product | null>(null)
  const [sharedProductsConfig, setSharedProductsConfig] = useState<{ ids: string[] } | null>(null)
  const [linkedPostsFor, setLinkedPostsFor] = useState<{
    kind: 'product' | 'collection'
    id: string
    name?: string
  } | null>(null)

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

  const selectedCollectionId = search.collection || undefined

  // ─── Queries ───

  const catalogsQuery = useQuery({
    queryKey: ['catalogs', orgSlug],
    queryFn: () => catalogApi.list(orgSlug),
    staleTime: 5 * 60 * 1000,
  })

  const catalogs = catalogsQuery.data || []

  // Selection priority: explicit URL param > last persisted choice for this org
  // > first available catalog. Mirrors the WhatsApp chat behaviour so the user
  // lands on the catalog they last worked on.
  const selectedCatalogId = useMemo(() => {
    if (search.catalogId) return search.catalogId
    const stored = getStoredSelection(CATALOG_SELECTION_SCOPE, orgSlug)
    if (stored && catalogs.some((c) => c.id === stored)) return stored
    return catalogs[0]?.id ?? null
  }, [search.catalogId, catalogs, orgSlug])

  const selectedCatalog = useMemo(
    () => catalogs.find((c) => c.id === selectedCatalogId) ?? catalogs[0] ?? null,
    [catalogs, selectedCatalogId],
  )

  useEffect(() => {
    if (selectedCatalog) setStoredSelection(CATALOG_SELECTION_SCOPE, orgSlug, selectedCatalog.id)
  }, [orgSlug, selectedCatalog])

  const productsQuery = useQuery({
    queryKey: [
      'catalog-products',
      selectedCatalog?.id,
      debouncedSearch,
      selectedStatuses,
      selectedCollectionId,
      afterCursor,
      pageSize,
    ],
    queryFn: () =>
      selectedCatalog
        ? catalogApi.getProducts(selectedCatalog.id, {
            search: debouncedSearch || undefined,
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
    mutationFn: async (data: Parameters<typeof catalogApi.createProduct>[1]) => {
      if (!selectedCatalog) throw new Error('No catalog selected')
      const result = await catalogApi.createProduct(selectedCatalog.id, data)
      return { result, data }
    },
    onSuccess: ({ result, data }) => {
      if (!selectedCatalog) return
      // Meta create returns only { id }. Construct an optimistic Product from the DTO.
      const optimistic: Product = {
        id: (result as unknown as { id: string }).id,
        name: data.name,
        retailerId: data.retailerId,
        description: data.description,
        imageUrl: data.imageUrl,
        additionalImageUrls: data.additionalImageUrls,
        price: data.price ? Number(data.price) : undefined,
        currency: data.currency,
        url: data.url,
        availability: data.availability,
        brand: data.brand,
        condition: data.condition,
        status: 'pending',
        needsIndexing: true,
        collectionId: data.collectionId,
      }
      prependListItemCache<Product, 'products'>(
        queryClient,
        ['catalog-products', selectedCatalog.id],
        'products',
        optimistic,
      )
      setModalProductConfig({ isOpen: false })
    },
    onError: (err) => {
      message.error(getApiErrorMessage(err, t('catalog.product_save_error')))
    },
  })

  const updateProductMutation = useMutation({
    mutationFn: async ({
      productId,
      data,
    }: {
      productId: string
      data: Parameters<typeof catalogApi.updateProduct>[2]
    }) => {
      if (!selectedCatalog) throw new Error('No catalog selected')
      await catalogApi.updateProduct(selectedCatalog.id, productId, data)
      return { productId, data }
    },
    onSuccess: ({ productId, data }) => {
      if (!selectedCatalog) return
      const patch: Partial<Product> & { id: string } = {
        id: productId,
        ...data,
        price: data.price ? Number(data.price) : undefined,
      }
      updateListItemCache<Product, 'products'>(
        queryClient,
        ['catalog-products', selectedCatalog.id],
        'products',
        patch,
      )
      setModalProductConfig({ isOpen: false })
    },
    onError: (err) => {
      message.error(getApiErrorMessage(err, t('catalog.product_save_error')))
    },
  })

  const deleteProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      if (!selectedCatalog) throw new Error('No catalog selected')
      await catalogApi.deleteProduct(selectedCatalog.id, productId)
      return productId
    },
    onSuccess: (productId) => {
      if (!selectedCatalog) return
      removeListItemCache<Product, 'products'>(
        queryClient,
        ['catalog-products', selectedCatalog.id],
        'products',
        productId,
      )
    },
  })

  // Collection mutations
  const createCollectionMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      if (!selectedCatalog) throw new Error('No catalog selected')
      const result = await catalogApi.createCollection(selectedCatalog.id, data)
      return { result, data }
    },
    onSuccess: ({ result, data }) => {
      if (!selectedCatalog) return
      const optimistic: Collection = {
        id: (result as unknown as { id: string }).id,
        name: data.name,
        product_count: 0,
      }
      prependDirectListCache<Collection>(
        queryClient,
        ['catalog-collections', selectedCatalog.id],
        optimistic,
      )
    },
  })

  const updateCollectionMutation = useMutation({
    mutationFn: async ({
      collectionId,
      data,
    }: {
      collectionId: string
      data: { name?: string }
    }) => {
      if (!selectedCatalog) throw new Error('No catalog selected')
      await catalogApi.updateCollection(selectedCatalog.id, collectionId, data)
      return { collectionId, data }
    },
    onSuccess: ({ collectionId, data }) => {
      if (!selectedCatalog) return
      updateDirectListCache<Collection>(queryClient, ['catalog-collections', selectedCatalog.id], {
        id: collectionId,
        ...data,
      })
    },
  })

  const deleteCollectionMutation = useMutation({
    mutationFn: async (collectionId: string) => {
      if (!selectedCatalog) throw new Error('No catalog selected')
      await catalogApi.deleteCollection(selectedCatalog.id, collectionId)
      return collectionId
    },
    onSuccess: (collectionId) => {
      if (!selectedCatalog) return
      removeDirectListCache<Collection>(
        queryClient,
        ['catalog-collections', selectedCatalog.id],
        collectionId,
      )
    },
  })

  // Catalog disconnect = full delete (products, collections, links cascade).
  const deleteCatalogMutation = useMutation({
    mutationFn: (catalogId: string) => catalogApi.remove(catalogId),
    onSuccess: (_res, catalogId) => {
      queryClient.setQueryData<Catalog[]>(['catalogs', orgSlug], (old) =>
        (old || []).filter((c) => c.id !== catalogId),
      )
      setCursorStack([])
      setAfterCursor(undefined)
      updateSearch({
        catalogId: undefined,
        collection: undefined,
        status: undefined,
        page: undefined,
      })
      message.success('Catalogue déconnecté')
    },
    onError: (err) => {
      message.error(getApiErrorMessage(err, 'Échec de la déconnexion du catalogue'))
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

      <div className="flex-1 p-4 pb-28 lg:p-6 lg:pb-28">
        <div className="tickets-filters catalog-filters">
          <div className="flex flex-1 items-center gap-3 lg:contents">
            <Input
              placeholder={t('catalog.search_placeholder')}
              prefix={<Search size={16} className="text-text-muted" />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
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
            <div className="flex flex-1 items-center gap-3 lg:ml-auto lg:flex-none">
              {selectedCatalog && (
                <Button onClick={() => setToolsModalOpen(true)} icon={<Wrench size={14} />}>
                  {t('catalog.tools')}
                </Button>
              )}
              <Button
                onClick={() => setModalProductConfig({ isOpen: true })}
                icon={<Plus size={14} />}
                className="flex-1 lg:flex-none"
              >
                {t('catalog.add_article')}
              </Button>
            </div>
          </div>
        </div>

        {productsQuery.isError ? (
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
        )}

        {/* Temporary disabled */}
        {/*<CatalogSyncBanner orgSlug={orgSlug} catalogId={selectedCatalogId} />*/}

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
            retailerId: values.retailerId,
            description: values.description,
            imageUrl: firstImage,
            additionalImageUrls: extraImages,
            price: values.price != null ? String(values.price) : undefined,
            currency: values.currency,
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

      {selectedCatalog && (
        <>
          <CatalogToolsModal
            open={toolsModalOpen}
            onClose={() => setToolsModalOpen(false)}
            onOpenContextFlow={() => setContextFlowOpen(true)}
            onOpenLinkPostsFlow={() => {
              setPostLinkSeed(undefined)
              setPostLinkFlowOpen(true)
            }}
            onOpenStudio={() => {
              const base = import.meta.env.VITE_DESIGN_STUDIO_URL || 'https://design.bedones.com'
              const url = `${base}/?catalogId=${encodeURIComponent(
                selectedCatalog.id,
              )}&org=${encodeURIComponent(orgSlug)}`
              window.open(url, '_blank', 'noopener,noreferrer')
            }}
            onCreatePromotion={() =>
              navigate({
                to: '/app/$orgSlug/promotions',
                params: { orgSlug },
                search: { catalogId: selectedCatalog.id, step: 2 },
              })
            }
            catalogName={selectedCatalog.name}
            onDisconnect={() => deleteCatalogMutation.mutateAsync(selectedCatalog.id)}
          />
          <ProductContextFlowModal
            open={contextFlowOpen || !!contextFlowEdit}
            catalog={selectedCatalog}
            placeholderProducts={products}
            placeholderCollections={collections}
            editMode={contextFlowEdit ?? undefined}
            onClose={() => {
              setContextFlowOpen(false)
              setContextFlowEdit(null)
            }}
            onSaved={() => {
              // Refresh context-related queries so the detail / siblings views
              // pick the new content up next time they're opened.
              queryClient.invalidateQueries({
                queryKey: ['get', '/catalog/{catalogId}/products/{productId}/context'],
              })
            }}
          />
          <PostLinkFlowModal
            open={postLinkFlowOpen}
            catalog={selectedCatalog}
            organisationId={orgSlug}
            placeholderProducts={products}
            placeholderCollections={collections}
            initialSelected={postLinkSeed?.selected}
            initialStep={postLinkSeed?.step}
            onClose={() => setPostLinkFlowOpen(false)}
            onSaved={() => {
              queryClient.invalidateQueries({ queryKey: ['post-links', selectedCatalog.id] })
            }}
          />
          {contextDetailFor && (
            <ProductContextDetailModal
              open={!!contextDetailFor}
              catalogId={selectedCatalog.id}
              productId={contextDetailFor.id}
              productName={contextDetailFor.name}
              onClose={() => setContextDetailFor(null)}
              onEditOne={(detail) => {
                if (!contextDetailFor) return
                const target: PickerEntity = {
                  kind: 'product',
                  id: contextDetailFor.id,
                  retailerId: contextDetailFor.retailerId,
                  name: contextDetailFor.name,
                  imageUrl: contextDetailFor.imageUrl,
                }
                setContextFlowEdit({ targets: [target], currentContext: detail.content })
                setContextDetailFor(null)
              }}
              onEditAll={async (detail) => {
                // Hydrate every sibling so the chips that show up if the user
                // hits "back" in the flow have proper names / images.
                const ids = detail.sameContentProductIds
                const known = new Map(products.map((p) => [p.id, p]))
                const missing = ids.filter((id) => !known.has(id))
                let fetched: (Product | null)[] = []
                if (missing.length > 0) {
                  try {
                    const res = await catalogApi.getProductsByIds(selectedCatalog.id, missing)
                    fetched = res.products
                  } catch {
                    fetched = []
                  }
                }
                const fetchedMap = new Map(
                  fetched.filter((p): p is Product => p !== null).map((p) => [p.id, p]),
                )
                const targets: PickerEntity[] = ids.map((id) => {
                  const p = known.get(id) ?? fetchedMap.get(id)
                  return {
                    kind: 'product',
                    id,
                    retailerId: p?.retailerId,
                    name: p?.name ?? 'Produit',
                    imageUrl: p?.imageUrl,
                  }
                })
                setContextFlowEdit({ targets, currentContext: detail.content })
                setContextDetailFor(null)
              }}
              onViewSiblings={(detail) => {
                setSharedProductsConfig({ ids: detail.sameContentProductIds })
              }}
            />
          )}
          {sharedProductsConfig && (
            <SharedProductsModal
              open={!!sharedProductsConfig}
              catalogId={selectedCatalog.id}
              productIds={sharedProductsConfig.ids}
              placeholderProducts={products}
              onClose={() => setSharedProductsConfig(null)}
            />
          )}
          <LinkedPostsModal
            open={!!linkedPostsFor}
            catalogId={selectedCatalog.id}
            entity={linkedPostsFor}
            onClose={() => setLinkedPostsFor(null)}
            onAddPost={() => {
              if (!linkedPostsFor) return
              const seed: PickerEntity =
                linkedPostsFor.kind === 'product'
                  ? {
                      kind: 'product',
                      id: linkedPostsFor.id,
                      name: linkedPostsFor.name ?? 'Produit',
                    }
                  : {
                      kind: 'collection',
                      id: linkedPostsFor.id,
                      name: linkedPostsFor.name ?? 'Collection',
                    }
              setPostLinkSeed({ selected: [seed], step: 'page' })
              setPostLinkFlowOpen(true)
            }}
          />
        </>
      )}
    </div>
  )
}
