import { useState, useMemo, useEffect } from 'react'
import { createFileRoute, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Table, Input, DatePicker, Button, Modal, App } from 'antd'
import dayjs from 'dayjs'
import 'dayjs/locale/fr'
import { Search, ChevronDown, Plus, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { TablePagination } from '@app/components/shared/table-pagination'
import { FilterPopover } from '@app/components/shared/filter-popover'
import { TicketDrawer } from '@app/components/whatsapp/ticket-drawer'
import { ArticlePickerModal } from '@app/components/catalog/article-picker-modal'
import { TicketStatusModal } from '@app/components/tickets/ticket-status-modal'
import { useLayout } from '@app/contexts/layout-context'
import { TicketDescriptionCard } from '@app/components/tickets/ticket-description-card'
import {
  CreateTicketModal,
  type SelectedArticle,
  type TicketContact,
  type TicketSubmitData,
  type TicketPromotionOption,
} from '@app/components/tickets/create-ticket-modal'
import { useTicketColumns } from '@app/components/tickets/ticket-columns'
import {
  ticketApi,
  catalogApi,
  socialApi,
  promotionApi,
  conversationApi,
  type Ticket,
  type TicketStatusItem,
  type SocialAccount,
} from '@app/lib/api/agent-api'

dayjs.locale('fr')

export const Route = createFileRoute('/app/$orgSlug/tickets')({
  component: TicketsPage,
})

const { RangePicker } = DatePicker
const DEFAULT_PAGE_SIZE = 8

const SUPPORTED_PROVIDERS = ['WHATSAPP', 'INSTAGRAM', 'FACEBOOK']

function TicketsPage() {
  const { t } = useTranslation()
  const { message } = App.useApp()

  const PRIORITY_OPTIONS = [
    { key: 'LOW', label: t('tickets.priority_low'), color: '#52c41a' },
    { key: 'MEDIUM', label: t('tickets.priority_medium'), color: '#faad14' },
    { key: 'HIGH', label: t('tickets.priority_high'), color: '#fa8c16' },
    { key: 'URGENT', label: t('tickets.priority_urgent'), color: '#f5222d' },
  ]
  const { orgSlug } = useParams({ strict: false }) as { orgSlug: string }
  const queryClient = useQueryClient()
  const { isDesktop } = useLayout()
  const [searchText, setSearchText] = useState('')
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [drawerTicket, setDrawerTicket] = useState<Ticket | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null)
  const [articlePickerOpen, setArticlePickerOpen] = useState(false)
  const [selectedArticles, setSelectedArticles] = useState<SelectedArticle[]>([])

  // ─── Queries ───

  const { data, isLoading } = useQuery({
    queryKey: [
      'tickets',
      orgSlug,
      searchText,
      selectedPriorities,
      selectedStatuses,
      currentPage,
      pageSize,
    ],
    queryFn: () =>
      ticketApi.list(orgSlug, {
        search: searchText || undefined,
        priority: selectedPriorities.length === 1 ? selectedPriorities[0] : undefined,
        statusId: selectedStatuses.length === 1 ? selectedStatuses[0] : undefined,
        page: currentPage,
        pageSize,
      }),
    enabled: !!orgSlug,
  })

  const statusesQuery = useQuery({
    queryKey: ['ticket-statuses', orgSlug],
    queryFn: () => ticketApi.getStatuses(orgSlug),
    staleTime: 60_000,
    enabled: !!orgSlug,
  })

  const socialAccountsQuery = useQuery({
    queryKey: ['social-accounts', orgSlug],
    queryFn: () => socialApi.listAccounts(orgSlug),
    staleTime: 60_000,
  })

  const catalogsQuery = useQuery({
    queryKey: ['catalogs', orgSlug],
    queryFn: () => catalogApi.list(orgSlug),
    staleTime: Infinity,
    refetchOnMount: 'always',
  })

  const promotionsQuery = useQuery({
    queryKey: ['promotions-for-ticket', orgSlug],
    queryFn: () => promotionApi.list(orgSlug, { status: 'ACTIVE', pageSize: 100 }),
    staleTime: Infinity,
    refetchOnMount: 'always',
  })

  // Fetch conversations for all messaging-capable social accounts
  const messagingAccounts = useMemo(
    () =>
      (socialAccountsQuery.data || []).filter((a: SocialAccount) =>
        SUPPORTED_PROVIDERS.includes(a.provider),
      ),
    [socialAccountsQuery.data],
  )

  const [allContacts, setAllContacts] = useState<TicketContact[]>([])

  useEffect(() => {
    if (messagingAccounts.length === 0) return
    const fetchAll = async () => {
      const results = await Promise.allSettled(
        messagingAccounts.map(async (account: SocialAccount) => {
          const conversations = await conversationApi.listByAccount(account.id)
          return conversations.map((c) => ({
            conversationId: c.id,
            participantId: c.participantId,
            participantName: c.participantName,
            participantAvatar: c.participantAvatar,
            provider: account.provider,
          }))
        }),
      )
      const contacts: TicketContact[] = []
      for (const r of results) {
        if (r.status === 'fulfilled') contacts.push(...r.value)
      }
      setAllContacts(contacts)
    }
    fetchAll()
  }, [messagingAccounts])

  // Map promotions to the option shape expected by the modal
  const promotionOptions: TicketPromotionOption[] = useMemo(
    () =>
      (promotionsQuery.data?.promotions || []).map((p) => ({
        id: p.id,
        name: p.name,
        discountType: p.discountType,
        discountValue: p.discountValue,
        productIds: p.products?.map((pp) => pp.product.providerProductId ?? pp.product.id) ?? [],
      })),
    [promotionsQuery.data],
  )

  // ─── Mutations ───

  const createMutation = useMutation({
    mutationFn: (submitData: TicketSubmitData) =>
      ticketApi.create({
        organisationId: orgSlug,
        title: submitData.title,
        description: submitData.description,
        contactName: submitData.contactName,
        contactId: submitData.contactId,
        provider: submitData.provider,
        conversationId: submitData.conversationId,
        metadata: submitData.metadata,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets', orgSlug] })
      setCreateOpen(false)
      setSelectedArticles([])
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: TicketSubmitData }) =>
      ticketApi.update(id, {
        title: data.title,
        description: data.description,
        metadata: data.metadata,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets', orgSlug] })
      message.success(t('tickets.updated'))
      handleCloseModal()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => ticketApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets', orgSlug] })
      message.success(t('common.delete'))
    },
  })

  const updateStatusesMutation = useMutation({
    mutationFn: (statuses: TicketStatusItem[]) => ticketApi.updateStatuses(orgSlug, statuses),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket-statuses', orgSlug] })
      queryClient.invalidateQueries({ queryKey: ['tickets', orgSlug] })
      message.success(t('tickets.statuses_updated'))
      setStatusModalOpen(false)
    },
  })

  const handleTicketSubmit = (data: TicketSubmitData) => {
    if (editingTicket) {
      updateMutation.mutate({ id: editingTicket.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const handleEdit = (ticket: Ticket) => {
    setEditingTicket({ ...ticket, metadata: ticket.metadata ?? undefined })
    setDrawerTicket(null)
    setCreateOpen(true)
  }

  const handleDelete = (ticket: Ticket) => {
    Modal.confirm({
      title: t('tickets.confirm_delete'),
      content: t('tickets.confirm_delete_message', { name: ticket.title }),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => deleteMutation.mutateAsync(ticket.id),
    })
  }

  const handleCloseModal = () => {
    setCreateOpen(false)
    setEditingTicket(null)
    setSelectedArticles([])
  }

  // ─── Computed data ───

  const tickets = data?.tickets ?? []
  const total = data?.total ?? 0

  // Status filter options
  const statusOptions = useMemo(
    () =>
      (statusesQuery.data || []).map((s) => ({
        key: s.id ?? s.name,
        label: s.name,
        color: s.color,
      })),
    [statusesQuery.data],
  )

  const toggleStatus = (statusId: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(statusId) ? prev.filter((s) => s !== statusId) : [...prev, statusId],
    )
    setCurrentPage(1)
  }

  const statusButtonLabel =
    selectedStatuses.length > 0
      ? `${t('tickets.filter_status')} (${selectedStatuses.length})`
      : t('tickets.filter_status')

  // Client-side date filter (API doesn't support date range)
  const filteredTickets =
    dateRange?.[0] && dateRange?.[1]
      ? tickets.filter((tk) => {
          const d = dayjs(tk.createdAt)
          return d.isAfter(dateRange[0]!.startOf('day')) && d.isBefore(dateRange[1]!.endOf('day'))
        })
      : tickets

  // Client-side filters when multiple selected
  let displayTickets = filteredTickets
  if (selectedPriorities.length > 1) {
    displayTickets = displayTickets.filter((tk) => selectedPriorities.includes(tk.priority))
  }
  if (selectedStatuses.length > 1) {
    displayTickets = displayTickets.filter((tk) => selectedStatuses.includes(tk.status?.id ?? ''))
  }

  const togglePriority = (priority: string) => {
    setSelectedPriorities((prev) =>
      prev.includes(priority) ? prev.filter((s) => s !== priority) : [...prev, priority],
    )
    setCurrentPage(1)
  }

  const priorityButtonLabel =
    selectedPriorities.length > 0
      ? `${t('tickets.priority')} (${selectedPriorities.length})`
      : t('tickets.priority')

  const openDrawer = (entry: Ticket) => {
    setDrawerTicket(entry)
  }

  const columns = useTicketColumns({
    onViewDetails: openDrawer,
    onEdit: handleEdit,
    onDelete: handleDelete,
  })

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        title={t('tickets.title')}
        action={
          <Button onClick={() => setCreateOpen(true)} icon={<Plus size={16} strokeWidth={1.5} />}>
            {t('common.add')}
          </Button>
        }
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
            title={t('tickets.filter_priority')}
            options={PRIORITY_OPTIONS}
            selected={selectedPriorities}
            onToggle={togglePriority}
          >
            <button type="button" className="tickets-status-trigger">
              <span>{priorityButtonLabel}</span>
              <ChevronDown size={14} className="text-text-muted" />
            </button>
          </FilterPopover>
          <FilterPopover
            title={t('tickets.filter_status')}
            options={statusOptions}
            selected={selectedStatuses}
            onToggle={toggleStatus}
            footer={
              <div className="border-t border-border-subtle mt-1 pt-1 px-1 pb-1">
                <Button
                  type="text"
                  block
                  size="small"
                  icon={<Settings size={14} />}
                  className="flex items-center justify-start gap-2"
                  onClick={() => setStatusModalOpen(true)}
                >
                  {t('tickets.manage_statuses')}
                </Button>
              </div>
            }
          >
            <button type="button" className="tickets-status-trigger">
              <span>{statusButtonLabel}</span>
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

        {isDesktop ? (
          <Table
            dataSource={displayTickets}
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
            {displayTickets.length === 0 && !isLoading ? (
              <div className="flex items-center justify-center py-12 text-sm text-text-muted">
                {t('tickets.no_tickets')}
              </div>
            ) : (
              displayTickets.map((entry) => (
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
          total={total}
          onChange={(page, size) => {
            setCurrentPage(page)
            setPageSize(size)
          }}
          itemLabel="ticket"
        />
      </div>

      <TicketDrawer
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ticket={drawerTicket as any}
        open={!!drawerTicket}
        onClose={() => setDrawerTicket(null)}
        onEdit={() => {
          if (drawerTicket) handleEdit(drawerTicket)
        }}
        promotionOptions={promotionOptions}
      />

      <CreateTicketModal
        open={createOpen}
        onClose={handleCloseModal}
        onOpenArticlePicker={() => setArticlePickerOpen(true)}
        selectedArticles={selectedArticles}
        setSelectedArticles={setSelectedArticles}
        contacts={allContacts}
        promotionOptions={promotionOptions}
        onSubmit={handleTicketSubmit}
        submitLoading={createMutation.isPending || updateMutation.isPending}
        editingTicket={editingTicket}
      />

      <ArticlePickerModal
        open={articlePickerOpen}
        onClose={() => setArticlePickerOpen(false)}
        onSave={setSelectedArticles}
        initialSelection={selectedArticles}
        catalogs={catalogsQuery.data}
      />

      <TicketStatusModal
        open={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        statuses={statusesQuery.data || []}
        onSave={(statuses) => updateStatusesMutation.mutate(statuses)}
        saving={updateStatusesMutation.isPending}
      />
    </div>
  )
}
