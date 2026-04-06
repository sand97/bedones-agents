import { Select } from 'antd'
import { useTranslation } from 'react-i18next'

const PAGE_SIZE_OPTIONS = [8, 16, 32]

interface TablePaginationProps {
  current: number
  pageSize: number
  total: number
  onChange: (page: number, pageSize: number) => void
  itemLabel?: string
}

export function TablePagination({
  current,
  pageSize,
  total,
  onChange,
  itemLabel,
}: TablePaginationProps) {
  const { t } = useTranslation()
  const resolvedLabel = itemLabel ?? t('pagination.item')
  const totalPages = Math.ceil(total / pageSize)
  const pluralLabel = total > 1 ? `${resolvedLabel}s` : resolvedLabel

  return (
    <div className="table-pagination">
      <span className="text-sm font-semibold text-text-muted">
        {total} {pluralLabel}
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

        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={current === 1}
              onClick={() => onChange(current - 1, pageSize)}
              className="tickets-pagination-btn"
            >
              {t('pagination.previous')}
            </button>
            <span className="tickets-pagination-indicator">
              {current} / {totalPages}
            </span>
            <button
              type="button"
              disabled={current >= totalPages}
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
