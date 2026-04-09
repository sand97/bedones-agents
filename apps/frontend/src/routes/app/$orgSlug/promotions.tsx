import { useState, useMemo } from 'react'
import { createFileRoute, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Table, Input, Button, Modal, Spin } from 'antd'
import dayjs from 'dayjs'
import { Search, ChevronDown, Plus } from 'lucide-react'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { TablePagination } from '@app/components/shared/table-pagination'
import { FilterPopover } from '@app/components/shared/filter-popover'
import { useLayout } from '@app/contexts/layout-context'
import { promotionApi, type PromotionItem } from '@app/lib/api/agent-api'

export const Route = createFileRoute('/app/$orgSlug/promotions')({
  component: PromotionsPage,
})

const DEFAULT_PAGE_SIZE = 8

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Brouillon', color: '#faad14' },
  ACTIVE: { label: 'Active', color: '#52c41a' },
  PAUSED: { label: 'En pause', color: '#1677ff' },
  EXPIRED: { label: 'Expirée', color: '#ff4d4f' },
}

const TYPE_LABELS: Record<string, string> = {
  PERCENTAGE: 'Pourcentage',
  FIXED_AMOUNT: 'Montant fixe',
}

const STATUS_FILTER_OPTIONS = Object.entries(STATUS_CONFIG).map(([key, val]) => ({
  key,
  label: val.label,
  color: val.color,
}))

const TYPE_FILTER_OPTIONS = [
  { key: 'PERCENTAGE', label: 'Pourcentage' },
  { key: 'FIXED_AMOUNT', label: 'Montant fixe' },
]

function PromotionsPage() {
  const { t } = useTranslation()
  const { orgSlug } = useParams({ strict: false }) as { orgSlug: string }
  const { isDesktop } = useLayout()
  const queryClient = useQueryClient()

  const [searchText, setSearchText] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  // ─── Queries ───

  const promotionsQuery = useQuery({
    queryKey: ['promotions', orgSlug, searchText, selectedStatuses, currentPage, pageSize],
    queryFn: () =>
      promotionApi.list(orgSlug, {
        status: selectedStatuses.length === 1 ? selectedStatuses[0] : undefined,
        search: searchText || undefined,
        page: currentPage,
        pageSize,
      }),
    staleTime: 10_000,
  })

  const promotions = promotionsQuery.data?.promotions || []
  const totalPromotions = promotionsQuery.data?.total || 0

  // Client-side multi-filter
  const filteredPromotions = useMemo(() => {
    let result = promotions

    if (selectedStatuses.length > 1) {
      result = result.filter((p) => selectedStatuses.includes(p.status))
    }

    if (selectedTypes.length > 0) {
      result = result.filter((p) => selectedTypes.includes(p.discountType))
    }

    return result
  }, [promotions, selectedStatuses, selectedTypes])

  const deleteMutation = useMutation({
    mutationFn: (id: string) => promotionApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions', orgSlug] })
    },
  })

  const toggleStatus = (status: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    )
    setCurrentPage(1)
  }

  const toggleType = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    )
    setCurrentPage(1)
  }

  const handleDelete = (promo: PromotionItem) => {
    Modal.confirm({
      title: t('promotions.confirm_delete'),
      content: t('promotions.confirm_delete_message', { name: promo.name }),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => deleteMutation.mutate(promo.id),
    })
  }

  const statusButtonLabel =
    selectedStatuses.length > 0 ? `Status (${selectedStatuses.length})` : 'Status'

  const typeButtonLabel = selectedTypes.length > 0 ? `Type (${selectedTypes.length})` : 'Type'

  // ─── Columns ───

  const columns = useMemo(
    () => [
      {
        title: t('promotions.col_name'),
        dataIndex: 'name',
        key: 'name',
        ellipsis: true,
      },
      {
        title: t('promotions.col_code'),
        dataIndex: 'code',
        key: 'code',
        width: 120,
        render: (code: string) => code || '-',
      },
      {
        title: 'Type',
        key: 'discountType',
        width: 130,
        render: (_: unknown, record: PromotionItem) =>
          TYPE_LABELS[record.discountType] || record.discountType,
      },
      {
        title: t('promotions.col_value'),
        key: 'discountValue',
        width: 100,
        render: (_: unknown, record: PromotionItem) =>
          record.discountType === 'PERCENTAGE'
            ? `${record.discountValue}%`
            : `${record.discountValue} XAF`,
      },
      {
        title: 'Status',
        key: 'status',
        width: 110,
        render: (_: unknown, record: PromotionItem) => {
          const s = STATUS_CONFIG[record.status]
          return (
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ background: `${s?.color}20`, color: s?.color }}
            >
              {s?.label || record.status}
            </span>
          )
        },
      },
      {
        title: t('promotions.col_products'),
        key: 'products',
        width: 80,
        render: (_: unknown, record: PromotionItem) => record.products?.length || 0,
      },
      {
        title: t('promotions.col_period'),
        key: 'period',
        width: 200,
        render: (_: unknown, record: PromotionItem) => {
          if (!record.startDate && !record.endDate) return '-'
          const start = record.startDate ? dayjs(record.startDate).format('DD/MM/YYYY') : '...'
          const end = record.endDate ? dayjs(record.endDate).format('DD/MM/YYYY') : '...'
          return `${start} → ${end}`
        },
      },
      {
        title: '',
        key: 'actions',
        width: 80,
        render: (_: unknown, record: PromotionItem) => (
          <Button size="small" danger type="text" onClick={() => handleDelete(record)}>
            {t('common.delete')}
          </Button>
        ),
      },
    ],
    [t],
  )

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        title={t('promotions.title')}
        action={<Button icon={<Plus size={16} strokeWidth={1.5} />}>{t('common.add')}</Button>}
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
        </div>

        {promotionsQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spin />
          </div>
        ) : isDesktop ? (
          <Table
            dataSource={filteredPromotions}
            columns={columns}
            bordered
            rowKey="id"
            pagination={false}
            className="tickets-table"
            size="middle"
          />
        ) : (
          <div className="flex flex-col gap-3">
            {filteredPromotions.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-sm text-text-muted">
                {t('promotions.no_promotions')}
              </div>
            ) : (
              filteredPromotions.map((promo) => (
                <div
                  key={promo.id}
                  className="rounded-lg border border-border-default bg-bg-surface p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-text-primary">{promo.name}</span>
                      <span className="text-xs text-text-muted">
                        {promo.code || t('promotions.no_code')} &middot;{' '}
                        {promo.discountType === 'PERCENTAGE'
                          ? `${promo.discountValue}%`
                          : `${promo.discountValue} XAF`}
                      </span>
                    </div>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        background: `${STATUS_CONFIG[promo.status]?.color}20`,
                        color: STATUS_CONFIG[promo.status]?.color,
                      }}
                    >
                      {STATUS_CONFIG[promo.status]?.label}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <TablePagination
          current={currentPage}
          pageSize={pageSize}
          total={totalPromotions}
          onChange={(page, size) => {
            setCurrentPage(page)
            setPageSize(size)
          }}
          itemLabel="promotion"
        />
      </div>
    </div>
  )
}
