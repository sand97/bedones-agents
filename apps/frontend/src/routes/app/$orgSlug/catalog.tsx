import { useState, useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Table, Input } from 'antd'
import { Search, ChevronDown } from 'lucide-react'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { CatalogEmpty } from '@app/components/catalog/catalog-empty'
import { TablePagination } from '@app/components/shared/table-pagination'
import { FilterPopover } from '@app/components/shared/filter-popover'
import { useLayout } from '@app/contexts/layout-context'
import { ArticleDescriptionCard } from '@app/components/catalog/article-description-card'
import { useCatalogColumns } from '@app/components/catalog/catalog-columns'
import {
  MOCK_CATALOG_ARTICLES,
  CATALOG_STATUS_CONFIG,
  type CatalogArticleStatus,
} from '@app/components/whatsapp/mock-data'

export const Route = createFileRoute('/app/$orgSlug/catalog')({
  component: CatalogPage,
})

const DEFAULT_PAGE_SIZE = 8

const ALL_STATUSES = Object.keys(CATALOG_STATUS_CONFIG) as CatalogArticleStatus[]

const STATUS_FILTER_OPTIONS = ALL_STATUSES.map((status) => ({
  key: status,
  label: CATALOG_STATUS_CONFIG[status].label,
  color: CATALOG_STATUS_CONFIG[status].color,
}))

function CatalogPage() {
  const { t } = useTranslation()
  const { isDesktop } = useLayout()
  const catalogColumns = useCatalogColumns()
  const [connected, setConnected] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState<CatalogArticleStatus[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  const allCategories = useMemo(
    () => [...new Set(MOCK_CATALOG_ARTICLES.map((a) => a.category))].sort(),
    [],
  )

  const categoryFilterOptions = useMemo(
    () => allCategories.map((cat) => ({ key: cat, label: cat })),
    [allCategories],
  )

  const toggleStatus = (status: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(status as CatalogArticleStatus)
        ? prev.filter((s) => s !== status)
        : [...prev, status as CatalogArticleStatus],
    )
    setCurrentPage(1)
  }

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    )
    setCurrentPage(1)
  }

  const filteredArticles = useMemo(() => {
    let result = MOCK_CATALOG_ARTICLES

    if (searchText) {
      const q = searchText.toLowerCase()
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.category.toLowerCase().includes(q),
      )
    }

    if (selectedStatuses.length > 0) {
      result = result.filter((a) => selectedStatuses.includes(a.status))
    }

    if (selectedCategories.length > 0) {
      result = result.filter((a) => selectedCategories.includes(a.category))
    }

    return result
  }, [searchText, selectedStatuses, selectedCategories])

  const paginatedArticles = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredArticles.slice(start, start + pageSize)
  }, [filteredArticles, currentPage, pageSize])

  const statusButtonLabel =
    selectedStatuses.length > 0 ? `Status (${selectedStatuses.length})` : 'Status'

  const categoryButtonLabel =
    selectedCategories.length > 0
      ? t('catalog.category_with_count', { count: selectedCategories.length })
      : t('catalog.category')

  if (!connected) {
    return (
      <div className="flex min-h-screen flex-col">
        <DashboardHeader title={t('catalog.title')} />
        <CatalogEmpty onConnect={() => setConnected(true)} />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title={t('catalog.title')} />

      <div className="flex-1 p-4 pb-16 lg:p-6 lg:pb-16">
        <div className="tickets-filters">
          <Input
            placeholder={t('catalog.search_placeholder')}
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
            title={t('catalog.filter_status')}
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
        </div>

        {isDesktop ? (
          <Table
            dataSource={paginatedArticles}
            columns={catalogColumns}
            rowKey="id"
            bordered
            pagination={false}
            className="tickets-table"
            size="middle"
          />
        ) : (
          <div className="flex flex-col gap-3">
            {paginatedArticles.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-sm text-text-muted">
                {t('catalog.no_articles')}
              </div>
            ) : (
              paginatedArticles.map((article) => (
                <ArticleDescriptionCard key={article.id} article={article} />
              ))
            )}
          </div>
        )}

        <TablePagination
          current={currentPage}
          pageSize={pageSize}
          total={filteredArticles.length}
          onChange={(page, size) => {
            setCurrentPage(page)
            setPageSize(size)
          }}
          itemLabel="article"
        />
      </div>
    </div>
  )
}
