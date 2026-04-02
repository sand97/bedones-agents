import { useState, useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Table, Input, Button, Modal } from 'antd'
import { Search, ChevronDown, Plus } from 'lucide-react'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { TablePagination } from '@app/components/shared/table-pagination'
import { FilterPopover } from '@app/components/shared/filter-popover'
import { useLayout } from '@app/contexts/layout-context'
import { PromotionDescriptionCard } from '@app/components/promotions/promotion-description-card'
import { PromotionModal } from '@app/components/promotions/create-promotion-modal'
import { ProductPickerModal } from '@app/components/promotions/product-picker-modal'
import { getPromotionColumns } from '@app/components/promotions/promotion-columns'
import {
  MOCK_PROMOTIONS_FULL,
  PROMOTION_STATUS_CONFIG,
  type PromotionFull,
  type PromotionStatus,
} from '@app/components/whatsapp/mock-data'

export const Route = createFileRoute('/app/$orgSlug/promotions')({
  component: PromotionsPage,
})

const DEFAULT_PAGE_SIZE = 8

const ALL_STATUSES = Object.keys(PROMOTION_STATUS_CONFIG) as PromotionStatus[]

const STATUS_FILTER_OPTIONS = ALL_STATUSES.map((status) => ({
  key: status,
  label: PROMOTION_STATUS_CONFIG[status].label,
  color: PROMOTION_STATUS_CONFIG[status].color,
}))

const TYPE_FILTER_OPTIONS = [
  { key: 'percent', label: 'Pourcentage' },
  { key: 'fixed', label: 'Montant fixe' },
]

const STACKABLE_FILTER_OPTIONS = [
  { key: 'true', label: 'Cumulable' },
  { key: 'false', label: 'Non cumulable' },
]

function PromotionsPage() {
  const { isDesktop } = useLayout()
  const [searchText, setSearchText] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState<PromotionStatus[]>([])
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [selectedStackable, setSelectedStackable] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingPromo, setEditingPromo] = useState<PromotionFull | null>(null)
  const [productPickerOpen, setProductPickerOpen] = useState(false)
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])

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

  const filteredPromotions = useMemo(() => {
    let result = MOCK_PROMOTIONS_FULL

    if (searchText) {
      const q = searchText.toLowerCase()
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q),
      )
    }

    if (selectedStatuses.length > 0) {
      result = result.filter((p) => selectedStatuses.includes(p.status))
    }

    if (selectedTypes.length > 0) {
      result = result.filter((p) => selectedTypes.includes(p.type))
    }

    if (selectedStackable.length > 0) {
      result = result.filter((p) => selectedStackable.includes(String(p.stackable)))
    }

    return result
  }, [searchText, selectedStatuses, selectedTypes, selectedStackable])

  const paginatedPromotions = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredPromotions.slice(start, start + pageSize)
  }, [filteredPromotions, currentPage, pageSize])

  const statusButtonLabel =
    selectedStatuses.length > 0 ? `Status (${selectedStatuses.length})` : 'Status'

  const typeButtonLabel = selectedTypes.length > 0 ? `Type (${selectedTypes.length})` : 'Type'

  const stackableButtonLabel =
    selectedStackable.length > 0 ? `Cumulable (${selectedStackable.length})` : 'Cumulable'

  const handleEdit = (promo: PromotionFull) => {
    setEditingPromo(promo)
    setModalOpen(true)
  }

  const handleCreate = () => {
    setEditingPromo(null)
    setModalOpen(true)
  }

  const handleCloseModal = () => {
    setModalOpen(false)
    setEditingPromo(null)
    setSelectedProductIds([])
  }

  const handleDelete = (promo: PromotionFull) => {
    Modal.confirm({
      title: 'Supprimer la promotion',
      content: `Êtes-vous sûr de vouloir supprimer la promotion "${promo.name}" ?`,
      okText: 'Supprimer',
      okButtonProps: { danger: true },
      cancelText: 'Annuler',
      onOk: () => {
        // TODO: call API to delete
      },
    })
  }

  const columns = useMemo(
    () => getPromotionColumns({ onEdit: handleEdit, onDelete: handleDelete }),
    [],
  )

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        title="Promotions"
        action={
          <Button onClick={handleCreate} icon={<Plus size={16} strokeWidth={1.5} />}>
            Ajouter
          </Button>
        }
      />

      <div className="flex-1 p-4 pb-16 lg:p-6 lg:pb-16">
        <div className="tickets-filters">
          <Input
            placeholder="Rechercher une promotion..."
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
            title="Filtrer par status"
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
            title="Filtrer par type"
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
            title="Filtrer par cumulabilité"
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
            dataSource={paginatedPromotions}
            columns={columns}
            bordered
            rowKey="id"
            pagination={false}
            className="tickets-table"
            size="middle"
          />
        ) : (
          <div className="flex flex-col gap-3">
            {paginatedPromotions.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-sm text-text-muted">
                Aucune promotion trouvée
              </div>
            ) : (
              paginatedPromotions.map((promo) => (
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
          total={filteredPromotions.length}
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
        editingPromo={editingPromo}
        onOpenProductPicker={() => setProductPickerOpen(true)}
        selectedProductIds={selectedProductIds}
        setSelectedProductIds={setSelectedProductIds}
      />
      <ProductPickerModal
        open={productPickerOpen}
        onClose={() => setProductPickerOpen(false)}
        onSave={setSelectedProductIds}
        initialSelection={selectedProductIds}
      />
    </div>
  )
}
