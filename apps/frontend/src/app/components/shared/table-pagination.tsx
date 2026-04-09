import { Select } from 'antd'
import { useTranslation } from 'react-i18next'

const PAGE_SIZE_OPTIONS = [10, 20, 30]

interface TablePaginationProps {
  current: number
  pageSize: number
  total: number
  onChange: (page: number, pageSize: number) => void
  itemLabel?: string
  /** For cursor-based pagination: override "has next page" instead of computing from total */
  hasMore?: boolean
}

export function TablePagination({
  current,
  pageSize,
  total,
  onChange,
  itemLabel,
  hasMore,
}: TablePaginationProps) {
  const { t } = useTranslation()
  const resolvedLabel = itemLabel ?? t('pagination.item')
  const pluralLabel = total > 1 ? `${resolvedLabel}s` : resolvedLabel

  const totalPages = total > 0 ? Math.ceil(total / pageSize) : undefined
  const withinBounds = totalPages ? current < totalPages : true
  const canGoNext =
    hasMore !== undefined ? hasMore && withinBounds : totalPages ? current < totalPages : false
  const canGoPrev = current > 1
  const showNav = canGoNext || canGoPrev

  return (
    <div className="table-pagination">
      <span className="text-sm font-semibold text-text-muted">
        {total > 0 ? `${total} ${pluralLabel}` : ''}
      </span>

      <div className="flex items-center gap-3">
        <div className="table-pagination__size-select">
          <Select
            value={pageSize}
            onChange={(size) => onChange(1, size)}
            options={PAGE_SIZE_OPTIONS.map((size) => ({
              value: size,
              label: `${size} / page`,
            }))}
            popupMatchSelectWidth={false}
          />
        </div>

        {showNav && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!canGoPrev}
              onClick={() => onChange(current - 1, pageSize)}
              className="tickets-pagination-btn"
            >
              {t('pagination.previous')}
            </button>
            <span className="tickets-pagination-indicator">
              {totalPages ? `${current} / ${totalPages}` : `${current}`}
            </span>
            <button
              type="button"
              disabled={!canGoNext}
              onClick={() => onChange(current + 1, pageSize)}
              className="tickets-pagination-btn"
            >
              {t('pagination.next')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export { PAGE_SIZE_OPTIONS }
