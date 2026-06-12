import { useState, useMemo, useEffect } from 'react'
import { useDebouncedValue } from '@app/hooks/use-debounced-value'
import { createFileRoute, useParams, useSearch, useNavigate } from '@tanstack/react-router'
import { buildShareMeta } from '@app/lib/share-meta'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Table, Input, Button, Modal, App } from 'antd'
import { Search, ChevronDown, Plus } from 'lucide-react'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { TablePagination } from '@app/components/shared/table-pagination'
import { FilterPopover } from '@app/components/shared/filter-popover'
import { useLayout } from '@app/contexts/layout-context'
import { PromotionDescriptionCard } from '@app/components/promotions/promotion-description-card'
import { PromotionModal } from '@app/components/promotions/create-promotion-modal'
import {
  ProductPickerModal,
  type PickerProduct,
} from '@app/components/promotions/product-picker-modal'
import { usePromotionColumns } from '@app/components/promotions/promotion-columns'
import { promotionApi, catalogApi, type PromotionItem } from '@app/lib/api/agent-api'
import type { PromotionSubmitData } from '@app/components/promotions/create-promotion-modal'
import {
  prependListItemCache,
  removeListItemCache,
  updateListItemCache,
} from '@app/lib/query-cache'

export const Route = createFileRoute('/app/$orgSlug/promotions')({
  // Deep link from the catalog "Tools" modal: ?catalogId=…&step=2 opens the
  // creation wizard on the given step with the catalog preselected.
  validateSearch: (search: Record<string, unknown>): { catalogId?: string; step?: number } => ({
    catalogId: typeof search.catalogId === 'string' ? search.catalogId : undefined,
    step: typeof search.step === 'number' ? search.step : undefined,
  }),
  head: () =>
    buildShareMeta({
      title: 'Voir les promotions',
      description: 'Cliquez pour découvrir les promotions de ce compte',
      image: '/og/promotions.png',
    }),
  component: PromotionsPage,
})

const DEFAULT_PAGE_SIZE = 8

type PromotionStatus = PromotionItem['status']

function PromotionsPage() {
  const { t } = useTranslation()
  const { isDesktop } = useLayout()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const { orgSlug } = useParams({ strict: false }) as { orgSlug: string }
  const search = useSearch({ from: '/app/$orgSlug/promotions' })
  const navigate = useNavigate()

  const STATUS_FILTER_OPTIONS: Array<{ key: string; label: string; color: string }> = [
    { key: 'DRAFT', label: t('promotions.status_draft'), color: '#8b5cf6' },
    { key: 'ACTIVE', label: t('promotions.status_active'), color: '#22c55e' },
    { key: 'PAUSED', label: t('promotions.status_paused'), color: '#f59e0b' },
    { key: 'EXPIRED', label: t('promotions.status_expired'), color: '#ef4444' },
  ]

  const TYPE_FILTER_OPTIONS = [
    { key: 'PERCENTAGE', label: t('promotions.type_percent') },
    { key: 'FIXED_AMOUNT', label: t('promotions.type_fixed') },
  ]

  const STACKABLE_FILTER_OPTIONS = [
    { key: 'true', label: t('promotions.stackable') },
    { key: 'false', label: t('promotions.not_stackable') },
  ]

  const [searchText, setSearchText] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState<PromotionStatus[]>([])
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [selectedStackable, setSelectedStackable] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingPromo, setEditingPromo] = useState<PromotionItem | null>(null)
  const [productPickerOpen, setProductPickerOpen] = useState(false)
  const [selectedProducts, setSelectedProducts] = useState<PickerProduct[]>([])
  const [rewardPickerOpen, setRewardPickerOpen] = useState(false)
  const [rewardProducts, setRewardProducts] = useState<PickerProduct[]>([])
  // Catalog the promotion targets (step 1 of the wizard).
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | undefined>(undefined)
  // Deep-link step (1-based) when opened from the catalog "Tools" modal.
  const [initialStep, setInitialStep] = useState<number | undefined>(undefined)

  // Build API status param: only pass if single status selected (API accepts one status)
  const apiStatus = selectedStatuses.length === 1 ? selectedStatuses[0] : undefined

  // Debounce search so typing doesn't fire a request per keystroke.
  const debouncedSearch = useDebouncedValue(searchText.trim(), 350)
  useEffect(() => setCurrentPage(1), [debouncedSearch])

  const catalogsQuery = useQuery({
    queryKey: ['catalogs', orgSlug],
    queryFn: () => catalogApi.list(orgSlug),
    staleTime: Infinity,
    refetchOnMount: 'always',
  })

  // Deep link from the catalog "Tools" modal: open the creation wizard on the
  // requested step with the catalog preselected, then drop the URL params.
  useEffect(() => {
    if (!search.catalogId) return
    setEditingPromo(null)
    setSelectedProducts([])
    setRewardProducts([])
    setSelectedCatalogId(search.catalogId)
    setInitialStep(search.step ?? 2)
    setModalOpen(true)
    navigate({
      to: '/app/$orgSlug/promotions',
      params: { orgSlug },
      search: {},
      replace: true,
    })
  }, [search.catalogId, search.step, orgSlug, navigate])

  const { data, isLoading } = useQuery({
    queryKey: ['promotions', orgSlug, debouncedSearch, apiStatus, currentPage, pageSize],
    queryFn: () =>
      promotionApi.list(orgSlug, {
        search: debouncedSearch || undefined,
        status: apiStatus,
        page: currentPage,
        pageSize,
      }),
    enabled: !!orgSlug,
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await promotionApi.remove(id)
      return id
    },
    onSuccess: (id) => {
      removeListItemCache<PromotionItem, 'promotions'>(
        queryClient,
        ['promotions', orgSlug],
        'promotions',
        id,
      )
      // Ticket page uses a separate query for the active promotion dropdown
      queryClient.invalidateQueries({ queryKey: ['promotions-for-ticket', orgSlug] })
      message.success(t('common.delete'))
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: PromotionSubmitData) =>
      promotionApi.create({
        organisationId: orgSlug,
        catalogId: data.catalogId || undefined,
        status: data.status,
        name: data.name,
        code: data.code,
        discountType: data.discountType,
        discountValue: data.discountValue,
        startDate: data.startDate,
        endDate: data.endDate,
        productIds: data.productIds,
        stackable: data.stackable,
        minOrderAmount: data.minOrderAmount,
        minItemCount: data.minItemCount,
        rewardType: data.rewardType,
        rewardCredit: data.rewardCredit,
        rewardPercent: data.rewardPercent,
        rewardProductIds: data.rewardProductIds,
      }),
    onSuccess: (promotion) => {
      prependListItemCache<PromotionItem, 'promotions'>(
        queryClient,
        ['promotions', orgSlug],
        'promotions',
        promotion,
      )
      queryClient.invalidateQueries({ queryKey: ['promotions-for-ticket', orgSlug] })
      message.success(t('promotions.created'))
      handleCloseModal()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: PromotionSubmitData }) =>
      promotionApi.update(id, {
        catalogId: data.catalogId || null,
        status: data.status,
        name: data.name,
        code: data.code,
        discountType: data.discountType,
        discountValue: data.discountValue,
        startDate: data.startDate,
        endDate: data.endDate,
        productIds: data.productIds,
        stackable: data.stackable,
        minOrderAmount: data.minOrderAmount,
        minItemCount: data.minItemCount,
        rewardType: data.rewardType,
        rewardCredit: data.rewardCredit,
        rewardPercent: data.rewardPercent,
        rewardProductIds: data.rewardProductIds,
      }),
    onSuccess: (promotion) => {
      updateListItemCache<PromotionItem, 'promotions'>(
        queryClient,
        ['promotions', orgSlug],
        'promotions',
        promotion,
      )
      queryClient.invalidateQueries({ queryKey: ['promotions-for-ticket', orgSlug] })
      message.success(t('promotions.updated'))
      handleCloseModal()
    },
  })

  const handlePromoSubmit = (data: PromotionSubmitData) => {
    if (editingPromo) {
      updateMutation.mutate({ id: editingPromo.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  // Apply client-side filters that the API doesn't support
  const filteredPromotions = useMemo(() => {
    let result = data?.promotions ?? []

    // If multiple statuses selected, API can't filter — do it client-side
    if (selectedStatuses.length > 1) {
      result = result.filter((p) => selectedStatuses.includes(p.status))
    }

    if (selectedTypes.length > 0) {
      result = result.filter((p) => selectedTypes.includes(p.discountType))
    }

    if (selectedStackable.length > 0) {
      result = result.filter((p) => selectedStackable.includes(String(p.stackable)))
    }

    return result
  }, [data?.promotions, selectedStatuses, selectedTypes, selectedStackable])

  const total = data?.total ?? 0

  const toggleStatus = (status: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(status as PromotionStatus)
        ? prev.filter((s) => s !== status)
        : [...prev, status as PromotionStatus],
    )
    setCurrentPage(1)
  }

  const toggleType = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    )
    setCurrentPage(1)
  }

  const toggleStackable = (val: string) => {
    setSelectedStackable((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val],
    )
    setCurrentPage(1)
  }

  const statusButtonLabel =
    selectedStatuses.length > 0 ? `Status (${selectedStatuses.length})` : 'Status'

  const typeButtonLabel = selectedTypes.length > 0 ? `Type (${selectedTypes.length})` : 'Type'

  const stackableButtonLabel =
    selectedStackable.length > 0
      ? t('promotions.stackable_with_count', { count: selectedStackable.length })
      : t('promotions.stackable')

  const handleEdit = (promo: PromotionItem) => {
    setEditingPromo(promo)
    // Populate selectedProducts from the promo's linked products so they appear in the modal
    if (promo.products && promo.products.length > 0) {
      setSelectedProducts(
        promo.products.map((pp) => ({
          id: pp.product.id,
          name: pp.product.name,
          description: '',
          imageUrl: pp.product.imageUrl || '',
          price: pp.product.price || 0,
          currency: pp.product.currency || 'FCFA',
        })),
      )
    } else {
      setSelectedProducts([])
    }
    setModalOpen(true)
  }

  const handleCreate = () => {
    setEditingPromo(null)
    setSelectedCatalogId(undefined)
    setInitialStep(undefined)
    setSelectedProducts([])
    setRewardProducts([])
    setModalOpen(true)
  }

  const handleCloseModal = () => {
    setModalOpen(false)
    setEditingPromo(null)
    setSelectedProducts([])
    setRewardProducts([])
    setSelectedCatalogId(undefined)
    setInitialStep(undefined)
  }

  const handleDelete = (promo: PromotionItem) => {
    Modal.confirm({
      title: t('promotions.confirm_delete'),
      content: t('promotions.confirm_delete_message', { name: promo.name }),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => deleteMutation.mutateAsync(promo.id),
    })
  }

  const columns = usePromotionColumns({ onEdit: handleEdit, onDelete: handleDelete })

  // Once a catalog is chosen in the wizard, scope the product pickers to it
  // (and hide the catalog selector inside them).
  const selectedCatalog = catalogsQuery.data?.find((c) => c.id === selectedCatalogId)

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        title={t('promotions.title')}
        action={
          <Button onClick={handleCreate} icon={<Plus size={16} strokeWidth={1.5} />}>
            {t('common.add')}
          </Button>
        }
      />

      <div className="flex-1 p-4 pb-16 lg:p-6 lg:pb-16">
        <div className="tickets-filters">
          <Input
            placeholder={t('promotions.search_placeholder')}
            prefix={<Search size={16} className="text-text-muted" />}
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value)
              setCurrentPage(1)
            }}
            allowClear
            className="tickets-filter-input"
          />
          <FilterPopover
            title={t('promotions.filter_status')}
            options={STATUS_FILTER_OPTIONS}
            selected={selectedStatuses}
            onToggle={toggleStatus}
          >
            <button type="button" className="tickets-status-trigger">
              <span>{statusButtonLabel}</span>
              <ChevronDown size={14} className="text-text-muted" />
            </button>
          </FilterPopover>
          <FilterPopover
            title={t('promotions.filter_type')}
            options={TYPE_FILTER_OPTIONS}
            selected={selectedTypes}
            onToggle={toggleType}
          >
            <button type="button" className="tickets-status-trigger">
              <span>{typeButtonLabel}</span>
              <ChevronDown size={14} className="text-text-muted" />
            </button>
          </FilterPopover>
          <FilterPopover
            title={t('promotions.filter_stackable')}
            options={STACKABLE_FILTER_OPTIONS}
            selected={selectedStackable}
            onToggle={toggleStackable}
          >
            <button type="button" className="tickets-status-trigger">
              <span>{stackableButtonLabel}</span>
              <ChevronDown size={14} className="text-text-muted" />
            </button>
          </FilterPopover>
        </div>

        {isDesktop ? (
          <Table
            dataSource={filteredPromotions}
            columns={columns}
            bordered
            rowKey="id"
            pagination={false}
            className="tickets-table"
            size="middle"
            loading={isLoading}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {filteredPromotions.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-sm text-text-muted">
                {t('promotions.no_promotions')}
              </div>
            ) : (
              filteredPromotions.map((promo) => (
                <PromotionDescriptionCard
                  key={promo.id}
                  promo={promo}
                  onEdit={() => handleEdit(promo)}
                  onDelete={() => handleDelete(promo)}
                />
              ))
            )}
          </div>
        )}

        <TablePagination
          current={currentPage}
          pageSize={pageSize}
          total={total}
          onChange={(page, size) => {
            setCurrentPage(page)
            setPageSize(size)
          }}
          itemLabel="promotion"
        />
      </div>

      <PromotionModal
        open={modalOpen}
        onClose={handleCloseModal}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        editingPromo={editingPromo as any}
        catalogs={catalogsQuery.data ?? []}
        selectedCatalogId={selectedCatalogId}
        setSelectedCatalogId={setSelectedCatalogId}
        initialStep={initialStep}
        onOpenProductPicker={() => setProductPickerOpen(true)}
        selectedProductIds={selectedProducts.map((p) => p.id)}
        setSelectedProductIds={(ids) => {
          if (typeof ids === 'function') {
            setSelectedProducts((prev) => {
              const newIds = ids(prev.map((p) => p.id))
              return prev.filter((p) => newIds.includes(p.id))
            })
          } else {
            setSelectedProducts((prev) => prev.filter((p) => ids.includes(p.id)))
          }
        }}
        selectedProducts={selectedProducts}
        onOpenRewardPicker={() => setRewardPickerOpen(true)}
        rewardProducts={rewardProducts}
        setRewardProducts={setRewardProducts}
        onSubmit={handlePromoSubmit}
        submitLoading={createMutation.isPending || updateMutation.isPending}
      />
      <ProductPickerModal
        open={productPickerOpen}
        onClose={() => setProductPickerOpen(false)}
        onSave={() => {}}
        onSaveProducts={setSelectedProducts}
        initialSelection={selectedProducts.map((p) => p.id)}
        catalogs={selectedCatalog ? [selectedCatalog] : catalogsQuery.data}
        hideCatalogSelect
      />
      <ProductPickerModal
        open={rewardPickerOpen}
        onClose={() => setRewardPickerOpen(false)}
        onSave={() => {}}
        onSaveProducts={setRewardProducts}
        initialSelection={rewardProducts.map((p) => p.id)}
        catalogs={selectedCatalog ? [selectedCatalog] : catalogsQuery.data}
        hideCatalogSelect
      />
    </div>
  )
}
