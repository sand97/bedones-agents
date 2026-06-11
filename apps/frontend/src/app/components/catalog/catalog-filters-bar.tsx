import { Input, Button } from 'antd'
import { Search, ChevronDown, Plus, Wrench } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { FilterPopover } from '@app/components/shared/filter-popover'
import { CollectionFilterSelect } from '@app/components/catalog/collection-filter-select'
import type { Catalog, Collection, Product } from '@app/lib/api/agent-api'
import type { CatalogMutations } from '@app/components/catalog/use-catalog-mutations'

const STATUS_FILTER_OPTIONS = [
  { key: 'approved', label: 'status_published', color: '#52c41a' },
  { key: 'pending', label: 'status_draft', color: '#faad14' },
  { key: 'rejected', label: 'status_archived', color: '#ff4d4f' },
]

interface CatalogFiltersBarProps {
  searchText: string
  setSearchText: (value: string) => void
  selectedStatuses: string[]
  toggleStatus: (status: string) => void
  collections: Collection[]
  selectedCollectionId: string | undefined
  updateSearch: (updates: Record<string, string | undefined>) => void
  resetPagination: () => void
  collectionsQuery: { isLoading: boolean }
  createCollectionMutation: CatalogMutations['createCollectionMutation']
  updateCollectionMutation: CatalogMutations['updateCollectionMutation']
  deleteCollectionMutation: CatalogMutations['deleteCollectionMutation']
  selectedCatalog: Catalog | null
  setToolsModalOpen: (open: boolean) => void
  setModalProductConfig: (config: { isOpen: boolean; initialProduct?: Product }) => void
}

export function CatalogFiltersBar({
  searchText,
  setSearchText,
  selectedStatuses,
  toggleStatus,
  collections,
  selectedCollectionId,
  updateSearch,
  resetPagination,
  collectionsQuery,
  createCollectionMutation,
  updateCollectionMutation,
  deleteCollectionMutation,
  selectedCatalog,
  setToolsModalOpen,
  setModalProductConfig,
}: CatalogFiltersBarProps) {
  const { t } = useTranslation()

  const statusButtonLabel =
    selectedStatuses.length > 0 ? `Status (${selectedStatuses.length})` : 'Status'

  // Translate status filter labels
  const translatedStatusOptions = STATUS_FILTER_OPTIONS.map((o) => ({
    ...o,
    label: t(`catalog.${o.label}`),
  }))

  return (
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
  )
}
