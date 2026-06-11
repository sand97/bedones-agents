import { fetchJson } from './http'

// ─── Ticket ───

export interface TicketStatusItem {
  id?: string
  name: string
  color: string
  order: number
  isDefault: boolean
}

export interface Ticket {
  id: string
  title: string
  description?: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  contactName?: string
  contactId?: string
  provider?: string
  conversationId?: string
  assignedTo?: string
  metadata?: Record<string, unknown>
  resolvedAt?: string
  createdAt: string
  updatedAt: string
  status?: TicketStatusItem
  agent?: { id: string; name: string }
}

export const ticketApi = {
  list: (
    orgId: string,
    params?: {
      statusId?: string
      agentId?: string
      priority?: string
      search?: string
      page?: number
      pageSize?: number
    },
  ) => {
    const query = new URLSearchParams()
    if (params?.statusId) query.set('statusId', params.statusId)
    if (params?.agentId) query.set('agentId', params.agentId)
    if (params?.priority) query.set('priority', params.priority)
    if (params?.search) query.set('search', params.search)
    if (params?.page) query.set('page', String(params.page))
    if (params?.pageSize) query.set('pageSize', String(params.pageSize))
    return fetchJson<{ tickets: Ticket[]; total: number; page: number; pageSize: number }>(
      `/ticket/org/${orgId}?${query}`,
    )
  },

  get: (id: string) => fetchJson<Ticket>(`/ticket/${id}`),

  create: (data: {
    organisationId: string
    agentId?: string
    title: string
    description?: string
    statusId?: string
    priority?: string
    contactName?: string
    contactId?: string
    provider?: string
    conversationId?: string
    assignedTo?: string
    metadata?: Record<string, unknown>
  }) => fetchJson<Ticket>('/ticket', { method: 'POST', body: JSON.stringify(data) }),

  update: (
    id: string,
    data: {
      title?: string
      description?: string
      statusId?: string
      priority?: string
      assignedTo?: string
      metadata?: Record<string, unknown>
    },
  ) => fetchJson<Ticket>(`/ticket/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  remove: (id: string) => fetchJson<void>(`/ticket/${id}`, { method: 'DELETE' }),

  stats: (orgId: string) =>
    fetchJson<{
      total: number
      byPriority: Array<{ priority: string; count: number }>
      byStatus: Array<{ statusId: string; count: number }>
    }>(`/ticket/org/${orgId}/stats`),

  getStatuses: (orgId: string) => fetchJson<TicketStatusItem[]>(`/ticket/org/${orgId}/statuses`),

  updateStatuses: (orgId: string, statuses: TicketStatusItem[]) =>
    fetchJson<void>(`/ticket/org/${orgId}/statuses`, {
      method: 'PUT',
      body: JSON.stringify(statuses),
    }),
}
