import { useState, useMemo, useCallback, useEffect } from 'react'
import { createFileRoute, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Modal } from 'antd'
import { ShoppingBag } from 'lucide-react'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { CatalogIndexingBanner } from '@app/components/catalog/catalog-indexing-banner'
import { CatalogSyncBanner } from '@app/components/catalog/catalog-sync-banner'
import { CatalogEmpty } from '@app/components/catalog/catalog-empty'
import { TablePagination } from '@app/components/shared/table-pagination'
import { CatalogFiltersBar } from '@app/components/catalog/catalog-filters-bar'
import { CatalogPageModals } from '@app/components/catalog/catalog-page-modals'
import { CatalogProductsView } from '@app/components/catalog/catalog-products-view'
import { useCatalogMutations } from '@app/components/catalog/use-catalog-mutations'
import type { PickerEntity } from '@app/components/catalog/product-collection-picker'
import type { CatalogArticle } from '@app/components/whatsapp/mock-data'
import { AccountSwitcher } from '@app/components/social/account-switcher'
import { catalogApi } from '@app/lib/api/agent-api'
import { setAuthRedirect, buildFacebookOAuthUrl } from '@app/lib/auth-redirect'
import type { Product } from '@app/lib/api/agent-api'
import { getStoredSelection, setStoredSelection } from '@app/lib/selection-storage'
import { useDebouncedValue } from '@app/hooks/use-debounced-value'

const CATALOG_SELECTION_SCOPE = 'catalog-current'

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

function CatalogPage() {
  const { t } = useTranslation()
  const { orgSlug } = useParams({ strict: false }) as { orgSlug: string }
  const search = useSearch({ from: '/app/$orgSlug/catalog' })
  const navigate = useNavigate()

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

  const {
    createProductMutation,
    updateProductMutation,
    deleteProductMutation,
    createCollectionMutation,
    updateCollectionMutation,
    deleteCollectionMutation,
    deleteCatalogMutation,
  } = useCatalogMutations({
    selectedCatalog,
    orgSlug,
    setModalProductConfig,
    setCursorStack,
    setAfterCursor,
    updateSearch,
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
        <CatalogFiltersBar
          searchText={searchText}
          setSearchText={setSearchText}
          selectedStatuses={selectedStatuses}
          toggleStatus={toggleStatus}
          collections={collections}
          selectedCollectionId={selectedCollectionId}
          updateSearch={updateSearch}
          resetPagination={resetPagination}
          collectionsQuery={collectionsQuery}
          createCollectionMutation={createCollectionMutation}
          updateCollectionMutation={updateCollectionMutation}
          deleteCollectionMutation={deleteCollectionMutation}
          selectedCatalog={selectedCatalog}
          setToolsModalOpen={setToolsModalOpen}
          setModalProductConfig={setModalProductConfig}
        />

        <CatalogProductsView
          products={products}
          tableData={tableData}
          productsQuery={productsQuery}
          handleConnectCatalog={handleConnectCatalog}
          handleDeleteProduct={handleDeleteProduct}
          setModalProductConfig={setModalProductConfig}
          setContextDetailFor={setContextDetailFor}
          setLinkedPostsFor={setLinkedPostsFor}
        />

        <CatalogSyncBanner orgSlug={orgSlug} catalogId={selectedCatalogId} />

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

      <CatalogPageModals
        collections={collections}
        products={products}
        selectedCatalog={selectedCatalog}
        orgSlug={orgSlug}
        modalProductConfig={modalProductConfig}
        setModalProductConfig={setModalProductConfig}
        createProductMutation={createProductMutation}
        updateProductMutation={updateProductMutation}
        deleteCatalogMutation={deleteCatalogMutation}
        toolsModalOpen={toolsModalOpen}
        setToolsModalOpen={setToolsModalOpen}
        contextFlowOpen={contextFlowOpen}
        setContextFlowOpen={setContextFlowOpen}
        contextFlowEdit={contextFlowEdit}
        setContextFlowEdit={setContextFlowEdit}
        postLinkFlowOpen={postLinkFlowOpen}
        setPostLinkFlowOpen={setPostLinkFlowOpen}
        contextDetailFor={contextDetailFor}
        setContextDetailFor={setContextDetailFor}
        sharedProductsConfig={sharedProductsConfig}
        setSharedProductsConfig={setSharedProductsConfig}
        linkedPostsFor={linkedPostsFor}
        setLinkedPostsFor={setLinkedPostsFor}
      />
    </div>
  )
}
