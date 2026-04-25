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

export interface LoyaltyTemplate {
  id: string
  socialAccountId: string
  metaTemplateId?: string | null
  name: string
  language: string
  category: string
  body: string
  variables: string[]
  status: string
  createdAt: string
  updatedAt: string
}

export interface LoyaltyCampaign {
  id: string
  socialAccountId: string
  bonusId: string
  templateId?: string | null
  bonus?: { id: string; name: string; rewardType: LoyaltyRewardType }
  template?: { id: string; name: string } | null
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

  // Templates
  listTemplates: (socialAccountId: string) =>
    fetchJson<LoyaltyTemplate[]>(`/loyalty/templates/account/${socialAccountId}`),
  syncTemplates: (socialAccountId: string) =>
    fetchJson<LoyaltyTemplate[]>(`/loyalty/templates/account/${socialAccountId}/sync`, {
      method: 'POST',
    }),
  createTemplate: (data: {
    socialAccountId: string
    name: string
    language?: string
    category?: string
    body: string
    variables?: string[]
  }) =>
    fetchJson<LoyaltyTemplate>('/loyalty/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateTemplate: (
    id: string,
    data: Partial<{
      name: string
      language: string
      category: string
      body: string
      variables: string[]
      status: string
    }>,
  ) =>
    fetchJson<LoyaltyTemplate>(`/loyalty/templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  removeTemplate: (id: string) => fetchJson<void>(`/loyalty/templates/${id}`, { method: 'DELETE' }),

  // Campaigns
  listCampaigns: (socialAccountId: string) =>
    fetchJson<LoyaltyCampaign[]>(`/loyalty/campaigns/account/${socialAccountId}`),
  createCampaign: (data: {
    socialAccountId: string
    bonusId: string
    templateId?: string
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
      templateId: string
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
