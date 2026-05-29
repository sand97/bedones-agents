const API_URL = import.meta.env.VITE_API_URL || 'https://api-moderator.bedones.test'

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
export type LoyaltyCampaignStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'PAUSED'
  | 'CANCELLED'
  | 'FAILED'
export type LoyaltyCampaignFrequency = 'ONCE' | 'DAILY' | 'WEEKLY' | 'MONTHLY'
export type CampaignOrigin = 'LOYALTY' | 'GENERAL'
export type CampaignAudienceType = 'RECENT_CONTACTS' | 'PRODUCT_INTEREST' | 'TICKET_STATUS'

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
  headerType?: string
  headerText?: string
  footerText?: string
  buttons?: Array<{ type: string; text: string; url?: string; phoneNumber?: string }>
  rejectionReason?: string
}

export interface CampaignTemplateSelection {
  languageCodes?: string[]
  allLanguages?: boolean
  metaTemplateId: string
  metaTemplateName: string
  metaTemplateLanguage: string
  metaTemplateCategory?: string
  body?: string
  variableValues?: Record<string, string>
  mpmProductRetailerIds?: string[]
  mpmSectionTitle?: string
  mpmThumbnailProductRetailerId?: string
}

export interface LoyaltyCampaign {
  id: string
  socialAccountId: string
  bonusId?: string | null
  origin: CampaignOrigin
  metaTemplateId?: string | null
  metaTemplateName?: string | null
  metaTemplateLanguage?: string | null
  bonus?: { id: string; name: string; rewardType: LoyaltyRewardType }
  name: string
  status: LoyaltyCampaignStatus
  frequency: LoyaltyCampaignFrequency
  marketingTopic?: string
  segmentCriteria?: Record<string, unknown> | null
  audienceType?: CampaignAudienceType | null
  audienceCriteria?: Record<string, unknown> | null
  audienceLimit?: number | null
  templateAssignments?: CampaignTemplateSelection[] | null
  variableValues?: Record<string, string> | null
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
      type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'CATALOG' | 'MPM'
      text: string
      url?: string
      phoneNumber?: string
    }>
  }) =>
    fetchJson<LoyaltyTemplate>('/loyalty/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateTemplate: (
    socialAccountId: string,
    templateId: string,
    data: Partial<{
      name: string
      language: string
      category: string
      body: string
      variables: string[]
      headerType: 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO'
      headerText: string
      headerMediaUrl: string
      footerText: string
      buttons: Array<{
        type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'CATALOG' | 'MPM'
        text: string
        url?: string
        phoneNumber?: string
      }>
    }>,
  ) =>
    fetchJson<LoyaltyTemplate>(`/loyalty/templates/account/${socialAccountId}/${templateId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  removeTemplate: (socialAccountId: string, name: string) =>
    fetchJson<void>(
      `/loyalty/templates/account/${socialAccountId}/by-name/${encodeURIComponent(name)}`,
      { method: 'DELETE' },
    ),

  // Campaigns
  listCampaigns: (socialAccountId: string, params?: { origin?: CampaignOrigin }) => {
    const query = new URLSearchParams()
    if (params?.origin) query.set('origin', params.origin)
    return fetchJson<LoyaltyCampaign[]>(
      `/loyalty/campaigns/account/${socialAccountId}?${query.toString()}`,
    )
  },
  previewCampaignAudience: (
    socialAccountId: string,
    data: {
      audienceType: CampaignAudienceType
      audienceCriteria?: Record<string, unknown>
      audienceLimit?: number
      marketingTopic?: string
    },
  ) =>
    fetchJson<{
      count: number
      maxEligible: number
      limitedCount: number
      languages: Array<{ code: string; count: number }>
    }>(`/loyalty/campaigns/account/${socialAccountId}/audience-preview`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getCampaignDetails: (
    id: string,
    params?: { bucket?: string; page?: number; pageSize?: number },
  ) => {
    const query = new URLSearchParams()
    if (params?.bucket) query.set('bucket', params.bucket)
    if (params?.page) query.set('page', String(params.page))
    if (params?.pageSize) query.set('pageSize', String(params.pageSize))
    return fetchJson<{
      campaign: LoyaltyCampaign
      stats: Array<{ date: string; delivered: number; read: number; replied: number }>
      contacts: {
        data: Array<{
          id: string
          contactPhone: string
          contactName: string
          languageCode?: string | null
          status: string
          deliveredAt?: string | null
          readAt?: string | null
          repliedAt?: string | null
        }>
        total: number
        page: number
        pageSize: number
      }
    }>(`/loyalty/campaigns/${id}/details?${query.toString()}`)
  },
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
    bonusId?: string
    origin?: CampaignOrigin
    metaTemplateId?: string
    metaTemplateName?: string
    metaTemplateLanguage?: string
    name: string
    frequency?: LoyaltyCampaignFrequency
    marketingTopic?: string
    segmentCriteria?: Record<string, unknown>
    audienceType?: CampaignAudienceType
    audienceCriteria?: Record<string, unknown>
    audienceLimit?: number
    templateAssignments?: CampaignTemplateSelection[]
    variableValues?: Record<string, string>
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
      marketingTopic: string
      segmentCriteria: Record<string, unknown>
      audienceType: CampaignAudienceType
      audienceCriteria: Record<string, unknown>
      audienceLimit: number
      templateAssignments: CampaignTemplateSelection[]
      variableValues: Record<string, string>
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
