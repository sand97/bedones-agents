const API_URL = import.meta.env.VITE_API_URL || 'https://api-moderator.bedones.local'

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  // DELETE may return empty body
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) return undefined as T
  return res.json()
}

// ─── Types ───

export type LoyaltyRewardType = 'PRODUCTS' | 'CREDIT' | 'PERCENT'
export type LoyaltyBonusStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED'
export type LoyaltyCampaignStatus = 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'COMPLETED' | 'PAUSED'
export type LoyaltyCampaignFrequency = 'ONCE' | 'DAILY' | 'WEEKLY' | 'MONTHLY'

export interface LoyaltyContact {
  id: string
  socialAccountId: string
  name: string
  phone: string
  totalSpent: number
  orderCount: number
  createdAt: string
  updatedAt: string
}

export interface LoyaltyBonusProductLink {
  id: string
  product: {
    id: string
    name: string
    imageUrl?: string | null
    price?: number | null
    currency?: string | null
  }
}

export interface LoyaltyBonus {
  id: string
  socialAccountId: string
  name: string
  description?: string
  status: LoyaltyBonusStatus
  stackable: boolean
  targetSpend: number | null
  targetOrderCount: number | null
  targetProductsCount: number | null
  rewardType: LoyaltyRewardType
  rewardCredit: number | null
  rewardPercent: number | null
  startDate?: string | null
  endDate?: string | null
  triggerProducts: LoyaltyBonusProductLink[]
  rewardProducts: LoyaltyBonusProductLink[]
  createdAt: string
  updatedAt: string
}

/**
 * Templates live on Meta — they are NOT persisted in our DB. The id below is
 * Meta's template id; there are no createdAt/updatedAt fields.
 */
export interface LoyaltyTemplate {
  id: string
  socialAccountId: string
  name: string
  language: string
  category: string
  body: string
  variables: string[]
  status: string
}

export interface LoyaltyCampaign {
  id: string
  socialAccountId: string
  bonusId: string
  metaTemplateId?: string | null
  metaTemplateName?: string | null
  metaTemplateLanguage?: string | null
  bonus?: { id: string; name: string; rewardType: LoyaltyRewardType }
  name: string
  status: LoyaltyCampaignStatus
  frequency: LoyaltyCampaignFrequency
  segmentCriteria?: Record<string, unknown> | null
  startDate?: string | null
  endDate?: string | null
  deliveredCount: number
  readCount: number
  repliedCount: number
  createdAt: string
  updatedAt: string
}

// ─── API ───

export const loyaltyApi = {
  // Contacts
  listContacts: (socialAccountId: string, params?: { search?: string }) => {
    const query = new URLSearchParams()
    if (params?.search) query.set('search', params.search)
    return fetchJson<LoyaltyContact[]>(
      `/loyalty/contacts/account/${socialAccountId}?${query.toString()}`,
    )
  },
  createContact: (data: {
    socialAccountId: string
    name: string
    phone: string
    totalSpent?: number
    orderCount?: number
  }) =>
    fetchJson<LoyaltyContact>('/loyalty/contacts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateContact: (
    id: string,
    data: { name?: string; phone?: string; totalSpent?: number; orderCount?: number },
  ) =>
    fetchJson<LoyaltyContact>(`/loyalty/contacts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  removeContact: (id: string) => fetchJson<void>(`/loyalty/contacts/${id}`, { method: 'DELETE' }),

  // Bonuses
  listBonuses: (socialAccountId: string, params?: { search?: string; status?: string }) => {
    const query = new URLSearchParams()
    if (params?.search) query.set('search', params.search)
    if (params?.status) query.set('status', params.status)
    return fetchJson<LoyaltyBonus[]>(
      `/loyalty/bonuses/account/${socialAccountId}?${query.toString()}`,
    )
  },
  createBonus: (data: {
    socialAccountId: string
    name: string
    description?: string
    stackable?: boolean
    targetSpend?: number | null
    targetOrderCount?: number | null
    targetProductsCount?: number | null
    triggerProductIds?: string[]
    rewardType: LoyaltyRewardType
    rewardCredit?: number | null
    rewardPercent?: number | null
    rewardProductIds?: string[]
    startDate?: string
    endDate?: string
  }) =>
    fetchJson<LoyaltyBonus>('/loyalty/bonuses', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateBonus: (
    id: string,
    data: Partial<{
      name: string
      description: string
      status: LoyaltyBonusStatus
      stackable: boolean
      targetSpend: number | null
      targetOrderCount: number | null
      targetProductsCount: number | null
      triggerProductIds: string[]
      rewardType: LoyaltyRewardType
      rewardCredit: number | null
      rewardPercent: number | null
      rewardProductIds: string[]
      startDate: string
      endDate: string
    }>,
  ) =>
    fetchJson<LoyaltyBonus>(`/loyalty/bonuses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  removeBonus: (id: string) => fetchJson<void>(`/loyalty/bonuses/${id}`, { method: 'DELETE' }),

  // Templates — proxied to Meta WhatsApp Business; never persisted on our side.
  listTemplates: (socialAccountId: string) =>
    fetchJson<LoyaltyTemplate[]>(`/loyalty/templates/account/${socialAccountId}`),
  createTemplate: (data: {
    socialAccountId: string
    name: string
    language?: string
    category?: string
    body: string
    variables?: string[]
    headerType?: 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO'
    headerText?: string
    headerMediaUrl?: string
    footerText?: string
    buttons?: Array<{
      type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'
      text: string
      url?: string
      phoneNumber?: string
    }>
  }) =>
    fetchJson<LoyaltyTemplate>('/loyalty/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  removeTemplate: (socialAccountId: string, name: string) =>
    fetchJson<void>(
      `/loyalty/templates/account/${socialAccountId}/by-name/${encodeURIComponent(name)}`,
      { method: 'DELETE' },
    ),

  // Campaigns
  listCampaigns: (socialAccountId: string) =>
    fetchJson<LoyaltyCampaign[]>(`/loyalty/campaigns/account/${socialAccountId}`),
  previewCampaignCount: (
    socialAccountId: string,
    criteria: { minSpend?: number; minOrders?: number },
  ) => {
    const query = new URLSearchParams()
    if (typeof criteria.minSpend === 'number') query.set('minSpend', String(criteria.minSpend))
    if (typeof criteria.minOrders === 'number') query.set('minOrders', String(criteria.minOrders))
    return fetchJson<{ count: number }>(
      `/loyalty/campaigns/account/${socialAccountId}/preview-count?${query.toString()}`,
    )
  },
  createCampaign: (data: {
    socialAccountId: string
    bonusId: string
    metaTemplateId?: string
    metaTemplateName?: string
    metaTemplateLanguage?: string
    name: string
    frequency?: LoyaltyCampaignFrequency
    segmentCriteria?: Record<string, unknown>
    startDate?: string
    endDate?: string
  }) =>
    fetchJson<LoyaltyCampaign>('/loyalty/campaigns', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateCampaign: (
    id: string,
    data: Partial<{
      name: string
      metaTemplateId: string
      metaTemplateName: string
      metaTemplateLanguage: string
      status: LoyaltyCampaignStatus
      frequency: LoyaltyCampaignFrequency
      segmentCriteria: Record<string, unknown>
      startDate: string
      endDate: string
    }>,
  ) =>
    fetchJson<LoyaltyCampaign>(`/loyalty/campaigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  removeCampaign: (id: string) => fetchJson<void>(`/loyalty/campaigns/${id}`, { method: 'DELETE' }),
}
