import { Select } from 'antd'

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
  itemLabel = 'élément',
}: TablePaginationProps) {
  const totalPages = Math.ceil(total / pageSize)
  const pluralLabel = total > 1 ? `${itemLabel}s` : itemLabel

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
              Précédent
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
              Suivant
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export { PAGE_SIZE_OPTIONS }
