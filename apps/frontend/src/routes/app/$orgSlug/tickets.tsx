import { useState, useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Table, Input, DatePicker, Button } from 'antd'
import dayjs from 'dayjs'
import 'dayjs/locale/fr'
import { Search, ChevronDown, Plus } from 'lucide-react'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { TablePagination } from '@app/components/shared/table-pagination'
import { FilterPopover } from '@app/components/shared/filter-popover'
import { TicketDrawer } from '@app/components/whatsapp/ticket-drawer'
import { ArticlePickerModal } from '@app/components/catalog/article-picker-modal'
import { useLayout } from '@app/contexts/layout-context'
import { TicketDescriptionCard } from '@app/components/tickets/ticket-description-card'
import {
  CreateTicketModal,
  type SelectedArticle,
} from '@app/components/tickets/create-ticket-modal'
import { useTicketColumns } from '@app/components/tickets/ticket-columns'
import {
  MOCK_TICKET_LIST,
  TICKET_STATUS_CONFIG,
  getTicketDetail,
  type TicketListEntry,
  type TicketStatus,
  type Ticket,
} from '@app/components/whatsapp/mock-data'

dayjs.locale('fr')

export const Route = createFileRoute('/app/$orgSlug/tickets')({
  component: TicketsPage,
})

const { RangePicker } = DatePicker
const DEFAULT_PAGE_SIZE = 8

const ALL_STATUSES = Object.keys(TICKET_STATUS_CONFIG) as TicketStatus[]

const STATUS_FILTER_OPTIONS = ALL_STATUSES.map((status) => ({
  key: status,
  label: TICKET_STATUS_CONFIG[status].label,
  color: TICKET_STATUS_CONFIG[status].color,
}))

function TicketsPage() {
  const { isDesktop } = useLayout()
  const [searchText, setSearchText] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState<TicketStatus[]>([])
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [drawerTicket, setDrawerTicket] = useState<Ticket | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [articlePickerOpen, setArticlePickerOpen] = useState(false)
  const [selectedArticles, setSelectedArticles] = useState<SelectedArticle[]>([])

  const toggleStatus = (status: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(status as TicketStatus)
        ? prev.filter((s) => s !== status)
        : [...prev, status as TicketStatus],
    )
    setCurrentPage(1)
  }

  const filteredTickets = useMemo(() => {
    let result = MOCK_TICKET_LIST

    if (searchText) {
      const q = searchText.toLowerCase()
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.contact.name.toLowerCase().includes(q) ||
          t.contact.identifier.toLowerCase().includes(q),
      )
    }

    if (selectedStatuses.length > 0) {
      result = result.filter((t) => selectedStatuses.includes(t.status))
    }

    if (dateRange?.[0] && dateRange?.[1]) {
      const start = dateRange[0].startOf('day')
      const end = dateRange[1].endOf('day')
      result = result.filter((t) => {
        const d = dayjs(t.createdAt)
        return d.isAfter(start) && d.isBefore(end)
      })
    }

    return result
  }, [searchText, selectedStatuses, dateRange])

  const paginatedTickets = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredTickets.slice(start, start + pageSize)
  }, [filteredTickets, currentPage, pageSize])

  const statusButtonLabel =
    selectedStatuses.length > 0 ? `Status (${selectedStatuses.length})` : 'Status'

  const openDrawer = (entry: TicketListEntry) => {
    setDrawerTicket(getTicketDetail(entry))
  }

  const columns = useTicketColumns(openDrawer)

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        title="Tickets"
        action={
          <Button onClick={() => setCreateOpen(true)} icon={<Plus size={16} strokeWidth={1.5} />}>
            Ajouter
          </Button>
        }
      />

      <div className="flex-1 p-4 pb-16 lg:p-6 lg:pb-16">
        <div className="tickets-filters">
          <Input
            placeholder="Rechercher par titre ou contact..."
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
          <RangePicker
            placeholder={['Date début', 'Date fin']}
            onChange={(dates) => {
              setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)
              setCurrentPage(1)
            }}
            format="DD/MM/YYYY"
            className="tickets-filter-date"
          />
        </div>

        {isDesktop ? (
          <Table
            dataSource={paginatedTickets}
            columns={columns}
            bordered
            rowKey="id"
            pagination={false}
            className="tickets-table"
            size="middle"
          />
        ) : (
          <div className="flex flex-col gap-3">
            {paginatedTickets.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-sm text-text-muted">
                Aucun ticket trouvé
              </div>
            ) : (
              paginatedTickets.map((entry) => (
                <TicketDescriptionCard
                  key={entry.id}
                  entry={entry}
                  onViewDetails={() => openDrawer(entry)}
                />
              ))
            )}
          </div>
        )}

        <TablePagination
          current={currentPage}
          pageSize={pageSize}
          total={filteredTickets.length}
          onChange={(page, size) => {
            setCurrentPage(page)
            setPageSize(size)
          }}
          itemLabel="ticket"
        />
      </div>

      <TicketDrawer
        ticket={drawerTicket}
        open={!!drawerTicket}
        onClose={() => setDrawerTicket(null)}
      />

      <CreateTicketModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false)
          setSelectedArticles([])
        }}
        onOpenArticlePicker={() => setArticlePickerOpen(true)}
        selectedArticles={selectedArticles}
        setSelectedArticles={setSelectedArticles}
      />

      <ArticlePickerModal
        open={articlePickerOpen}
        onClose={() => setArticlePickerOpen(false)}
        onSave={setSelectedArticles}
        initialSelection={selectedArticles}
      />
    </div>
  )
}
