import { fetchJson } from './http'

// ─── Promotion ───

export interface PromotionItem {
  id: string
  name: string
  description?: string
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT'
  discountValue: number
  code?: string
  startDate?: string
  endDate?: string
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED'
  stackable: boolean
  createdAt: string
  updatedAt: string
  products: Array<{
    product: {
      id: string
      providerProductId?: string
      name: string
      imageUrl?: string
      price?: number
      currency?: string
    }
  }>
  _count?: { products: number }
}

export const promotionApi = {
  list: (
    orgId: string,
    params?: { status?: string; search?: string; page?: number; pageSize?: number },
  ) => {
    const query = new URLSearchParams()
    if (params?.status) query.set('status', params.status)
    if (params?.search) query.set('search', params.search)
    if (params?.page) query.set('page', String(params.page))
    if (params?.pageSize) query.set('pageSize', String(params.pageSize))
    return fetchJson<{
      promotions: PromotionItem[]
      total: number
      page: number
      pageSize: number
    }>(`/promotion/org/${orgId}?${query}`)
  },

  get: (id: string) => fetchJson<PromotionItem>(`/promotion/${id}`),

  create: (data: {
    organisationId: string
    name: string
    description?: string
    discountType?: string
    discountValue?: number
    code?: string
    startDate?: string
    endDate?: string
    productIds?: string[]
    stackable?: boolean
  }) => fetchJson<PromotionItem>('/promotion', { method: 'POST', body: JSON.stringify(data) }),

  update: (
    id: string,
    data: {
      name?: string
      description?: string
      discountType?: string
      discountValue?: number
      code?: string
      startDate?: string
      endDate?: string
      status?: string
      productIds?: string[]
      stackable?: boolean
    },
  ) =>
    fetchJson<PromotionItem>(`/promotion/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  remove: (id: string) => fetchJson<void>(`/promotion/${id}`, { method: 'DELETE' }),
}
