import { useState, useMemo } from 'react'
import { createFileRoute, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Table, Input, DatePicker, Spin, Button } from 'antd'
import dayjs from 'dayjs'
import 'dayjs/locale/fr'
import { Search, ChevronDown, Plus } from 'lucide-react'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { TablePagination } from '@app/components/shared/table-pagination'
import { FilterPopover } from '@app/components/shared/filter-popover'
import { useLayout } from '@app/contexts/layout-context'
import { ticketApi, agentApi, type Ticket } from '@app/lib/api/agent-api'

dayjs.locale('fr')

export const Route = createFileRoute('/app/$orgSlug/tickets')({
  component: TicketsPage,
})

const { RangePicker } = DatePicker
const DEFAULT_PAGE_SIZE = 8

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  LOW: { label: 'Basse', color: '#52c41a' },
  MEDIUM: { label: 'Moyenne', color: '#1677ff' },
  HIGH: { label: 'Haute', color: '#fa8c16' },
  URGENT: { label: 'Urgente', color: '#ff4d4f' },
}

function TicketsPage() {
  const { t } = useTranslation()
  const { orgSlug } = useParams({ strict: false }) as { orgSlug: string }
  const { isDesktop } = useLayout()
  const [searchText, setSearchText] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([])
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  // ─── Queries ───

  const ticketsQuery = useQuery({
    queryKey: [
      'tickets',
      orgSlug,
      searchText,
      selectedStatuses,
      selectedPriorities,
      currentPage,
      pageSize,
    ],
    queryFn: () =>
      ticketApi.list(orgSlug, {
        search: searchText || undefined,
        statusId: selectedStatuses.length === 1 ? selectedStatuses[0] : undefined,
        priority: selectedPriorities.length === 1 ? selectedPriorities[0] : undefined,
        page: currentPage,
        pageSize,
      }),
    staleTime: 10_000,
  })

  // Fetch all agents to get their ticket statuses for filters
  const agentsQuery = useQuery({
    queryKey: ['agents', orgSlug],
    queryFn: () => agentApi.list(orgSlug),
    staleTime: 30_000,
  })

  const tickets = ticketsQuery.data?.tickets || []
  const totalTickets = ticketsQuery.data?.total || 0

  // Build status filter options from all agents' ticket statuses
  const statusFilterOptions = useMemo(() => {
    const agents = agentsQuery.data || []
    const statusMap = new Map<string, { name: string; color: string }>()
    for (const agent of agents) {
      if (agent.ticketStatuses) {
        for (const s of agent.ticketStatuses) {
          if (s.id) statusMap.set(s.id, { name: s.name, color: s.color })
        }
      }
    }
    return Array.from(statusMap.entries()).map(([id, s]) => ({
      key: id,
      label: s.name,
      color: s.color,
    }))
  }, [agentsQuery.data])

  const priorityFilterOptions = Object.entries(PRIORITY_LABELS).map(([key, val]) => ({
    key,
    label: val.label,
    color: val.color,
  }))

  // Filter by date range client-side
  const filteredTickets = useMemo(() => {
    let result = tickets

    if (dateRange?.[0] && dateRange?.[1]) {
      const start = dateRange[0].startOf('day')
      const end = dateRange[1].endOf('day')
      result = result.filter((t) => {
        const d = dayjs(t.createdAt)
        return d.isAfter(start) && d.isBefore(end)
      })
    }

    return result
  }, [tickets, dateRange])

  const toggleStatus = (id: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    )
    setCurrentPage(1)
  }

  const togglePriority = (key: string) => {
    setSelectedPriorities((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key],
    )
    setCurrentPage(1)
  }

  const statusButtonLabel =
    selectedStatuses.length > 0 ? `Status (${selectedStatuses.length})` : 'Status'

  const priorityButtonLabel =
    selectedPriorities.length > 0
      ? `${t('tickets.priority')} (${selectedPriorities.length})`
      : t('tickets.priority')

  // ─── Table Columns ───

  const columns = useMemo(
    () => [
      {
        title: t('tickets.col_title'),
        dataIndex: 'title',
        key: 'title',
        ellipsis: true,
      },
      {
        title: 'Status',
        key: 'status',
        width: 120,
        render: (_: unknown, record: Ticket) => (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={{
              background: `${record.status?.color}20`,
              color: record.status?.color || '#666',
            }}
          >
            {record.status?.name || 'N/A'}
          </span>
        ),
      },
      {
        title: t('tickets.priority'),
        key: 'priority',
        width: 100,
        render: (_: unknown, record: Ticket) => {
          const p = PRIORITY_LABELS[record.priority]
          return (
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ background: `${p?.color}20`, color: p?.color }}
            >
              {p?.label || record.priority}
            </span>
          )
        },
      },
      {
        title: t('tickets.contact'),
        dataIndex: 'contactName',
        key: 'contactName',
        ellipsis: true,
        render: (name: string) => name || '-',
      },
      {
        title: 'Agent',
        key: 'agent',
        width: 140,
        render: (_: unknown, record: Ticket) => record.agent?.name || '-',
      },
      {
        title: t('tickets.created_at'),
        key: 'createdAt',
        width: 130,
        render: (_: unknown, record: Ticket) => dayjs(record.createdAt).format('DD/MM/YYYY HH:mm'),
      },
    ],
    [t],
  )

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        title={t('tickets.title')}
        action={<Button icon={<Plus size={16} strokeWidth={1.5} />}>{t('common.create')}</Button>}
      />

      <div className="flex-1 p-4 pb-16 lg:p-6 lg:pb-16">
        <div className="tickets-filters">
          <Input
            placeholder={t('tickets.search_placeholder')}
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
            title={t('tickets.filter_status')}
            options={statusFilterOptions}
            selected={selectedStatuses}
            onToggle={toggleStatus}
          >
            <button type="button" className="tickets-status-trigger">
              <span>{statusButtonLabel}</span>
              <ChevronDown size={14} className="text-text-muted" />
            </button>
          </FilterPopover>
          <FilterPopover
            title={t('tickets.filter_priority')}
            options={priorityFilterOptions}
            selected={selectedPriorities}
            onToggle={togglePriority}
          >
            <button type="button" className="tickets-status-trigger">
              <span>{priorityButtonLabel}</span>
              <ChevronDown size={14} className="text-text-muted" />
            </button>
          </FilterPopover>
          <RangePicker
            placeholder={[t('tickets.date_start'), t('tickets.date_end')]}
            onChange={(dates) => {
              setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)
              setCurrentPage(1)
            }}
            format="DD/MM/YYYY"
            className="tickets-filter-date"
          />
        </div>

        {ticketsQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spin />
          </div>
        ) : isDesktop ? (
          <Table
            dataSource={filteredTickets}
            columns={columns}
            bordered
            rowKey="id"
            pagination={false}
            className="tickets-table"
            size="middle"
          />
        ) : (
          <div className="flex flex-col gap-3">
            {filteredTickets.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-sm text-text-muted">
                {t('tickets.no_tickets')}
              </div>
            ) : (
              filteredTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="rounded-lg border border-border-default bg-bg-surface p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-text-primary">{ticket.title}</span>
                      <span className="text-xs text-text-muted">
                        {ticket.contactName || t('tickets.no_contact')} &middot;{' '}
                        {dayjs(ticket.createdAt).format('DD/MM/YYYY')}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          background: `${ticket.status?.color || '#666'}20`,
                          color: ticket.status?.color || '#666',
                        }}
                      >
                        {ticket.status?.name || 'N/A'}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          background: `${PRIORITY_LABELS[ticket.priority]?.color}20`,
                          color: PRIORITY_LABELS[ticket.priority]?.color,
                        }}
                      >
                        {PRIORITY_LABELS[ticket.priority]?.label}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <TablePagination
          current={currentPage}
          pageSize={pageSize}
          total={totalTickets}
          onChange={(page, size) => {
            setCurrentPage(page)
            setPageSize(size)
          }}
          itemLabel="ticket"
        />
      </div>
    </div>
  )
}
