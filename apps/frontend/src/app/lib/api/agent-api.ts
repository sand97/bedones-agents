const API_URL = import.meta.env.VITE_API_URL || 'https://api-moderator.bedones.local'

/**
 * Typed API client for Agent, Catalog, Ticket, Promotion endpoints.
 * We use raw fetch via apiClient's baseUrl + credentials since
 * the openapi types (v1.d.ts) don't yet include these new endpoints.
 */

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
  return res.json()
}

/**
 * Extracts a human-readable message from an error thrown by fetchJson
 * (format: `API error <status>: <body>`). Unwraps the NestJS error body
 * `{ message }` and any nested Meta Graph error `{ error: { message } }`.
 */
export function getApiErrorMessage(err: unknown, fallback = 'Une erreur est survenue'): string {
  const raw = err instanceof Error ? err.message : String(err)
  const jsonStart = raw.indexOf('{')
  if (jsonStart !== -1) {
    try {
      const body = JSON.parse(raw.slice(jsonStart)) as { message?: unknown }
      const m = body.message
      const msg = Array.isArray(m) ? m.filter(Boolean).join(', ') : typeof m === 'string' ? m : ''
      // Unwrap nested "Meta API error: {\"error\":{\"message\":\"...\"}}"
      const metaStart = msg.indexOf('{')
      if (metaStart !== -1) {
        try {
          const meta = JSON.parse(msg.slice(metaStart)) as { error?: { message?: string } }
          if (meta.error?.message) return meta.error.message
        } catch {
          /* keep the outer message */
        }
      }
      if (msg) return msg
    } catch {
      /* fall through to raw */
    }
  }
  return raw || fallback
}

// ─── Agent ───

export interface AgentSocialAccount {
  id: string
  // Activation scope persisted on the agent↔account link. Returned by the
  // agent list/detail endpoints so the activation modal can pre-fill.
  aiActivateAll?: boolean
  aiActivateAds?: boolean
  aiActivateNewConversations?: boolean
  aiActivationContacts?: string[]
  socialAccount: {
    id: string
    provider: string
    pageName?: string
    pageAbout?: string
    username?: string
    profilePictureUrl?: string
    metadata?: Record<string, unknown>
  }
}

export interface Agent {
  id: string
  name?: string
  status: 'DRAFT' | 'CONFIGURING' | 'READY' | 'ACTIVE' | 'PAUSED'
  score: number
  context?: string
  /** Live-agent model tier. Absent on legacy records → treat as 'flash'. */
  liveModelTier?: 'flash' | 'pro' | 'ultra'
  createdAt: string
  updatedAt: string
  socialAccounts: AgentSocialAccount[]
  _count?: { messages: number; tickets: number }
}

export interface AgentMessage {
  id: string
  role: string
  content: string
  type: string
  metadata?: { options?: { id: string; label: string }[]; needs?: string[] }
  createdAt: string
}

export const agentApi = {
  list: (orgId: string) => fetchJson<Agent[]>(`/agent/org/${orgId}`),

  get: (id: string) => fetchJson<Agent>(`/agent/${id}`),

  create: (data: { organisationId: string; socialAccountIds: string[]; name?: string }) =>
    fetchJson<Agent>('/agent', { method: 'POST', body: JSON.stringify(data) }),

  remove: (id: string) => fetchJson<void>(`/agent/${id}`, { method: 'DELETE' }),

  getMessages: (id: string, limit?: number) =>
    fetchJson<AgentMessage[]>(`/agent/${id}/messages${limit ? `?limit=${limit}` : ''}`),

  sendMessage: (id: string, content: string, organisationId: string) =>
    fetchJson<AgentMessage>(`/agent/${id}/messages?organisationId=${organisationId}`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  analyzeCatalogs: (id: string, organisationId: string) =>
    fetchJson<{ status: string }>(
      `/agent/${id}/analyze-catalogs?organisationId=${organisationId}`,
      {
        method: 'POST',
      },
    ),

  initialEvaluation: (id: string, organisationId: string) =>
    fetchJson<AgentMessage>(`/agent/${id}/initial-evaluation?organisationId=${organisationId}`, {
      method: 'POST',
    }),

  startSetup: (id: string, organisationId: string) =>
    fetchJson<{ status: string }>(`/agent/${id}/start-setup?organisationId=${organisationId}`, {
      method: 'POST',
    }),

  areCatalogsAnalyzed: (id: string) =>
    fetchJson<{ analyzed: boolean }>(`/agent/${id}/catalogs-analyzed`),

  activate: (
    id: string,
    data: {
      activateAll?: boolean
      activateAds?: boolean
      activateNewConversations?: boolean
      contacts?: Record<string, string[]>
    },
  ) =>
    fetchJson<Agent>(`/agent/${id}/activate`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deactivate: (id: string) => fetchJson<Agent>(`/agent/${id}/deactivate`, { method: 'PUT' }),

  updateLiveModelTier: (id: string, tier: 'flash' | 'pro' | 'ultra') =>
    fetchJson<Agent>(`/agent/${id}/model`, {
      method: 'PUT',
      body: JSON.stringify({ tier }),
    }),

  updateSocialAccounts: (id: string, socialAccountIds: string[]) =>
    fetchJson<Agent>(`/agent/${id}/social-accounts`, {
      method: 'PUT',
      body: JSON.stringify({ socialAccountIds }),
    }),

  getLabels: (id: string) => fetchJson<LabelItem[]>(`/agent/${id}/labels`),
}

// ─── Catalog ───

export interface CatalogSocialLink {
  id: string
  socialAccount: {
    id: string
    provider: string
    pageName?: string
    username?: string
  }
}

export interface Catalog {
  id: string
  name: string
  providerId?: string
  /** Meta catalog vertical (e.g. "commerce"); only "commerce" can hold WhatsApp products. */
  vertical?: string
  description?: string
  analysisStatus: 'PENDING' | 'ANALYZING' | 'INDEXING' | 'COMPLETED' | 'FAILED'
  productCount: number
  indexedCount: number
  createdAt: string
  updatedAt: string
  socialAccounts: CatalogSocialLink[]
  _count?: { products: number }
}

export interface Product {
  id: string
  retailerId?: string
  name: string
  description?: string
  imageUrl?: string
  additionalImageUrls?: string[]
  price?: number
  currency?: string
  category?: string
  url?: string
  availability?: string
  brand?: string
  condition?: string
  status: string
  inventory?: number
  needsIndexing: boolean
  collectionId?: string
  collectionName?: string
}

export interface Collection {
  id: string
  name: string
  product_count?: number
}

export interface CatalogMigration {
  id: string
  catalogId: string
  sourcePhone: string
  status: 'QUEUED' | 'EXTRACTING' | 'IMPORTING' | 'COMPLETED' | 'FAILED'
  totalProducts: number
  importedProducts: number
  failedProducts: number
  error?: string | null
  /** Stable, actionable code for known failures (e.g. WRONG_CATALOG_VERTICAL). */
  errorCode?: string | null
  /** Number of migrations ahead in the queue (0 = running / next). */
  position: number
  /** Estimated minutes before this migration starts (~1 min per sync). */
  etaMinutes: number
  createdAt: string
}

export const catalogApi = {
  list: (orgId: string) => fetchJson<Catalog[]>(`/catalog/org/${orgId}`),

  get: (id: string) => fetchJson<Catalog>(`/catalog/${id}`),

  create: (data: { organisationId: string; name: string; providerId?: string }) =>
    fetchJson<Catalog>('/catalog', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: { name?: string }) =>
    fetchJson<Catalog>(`/catalog/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  remove: (id: string) => fetchJson<void>(`/catalog/${id}`, { method: 'DELETE' }),

  linkSocialAccounts: (id: string, socialAccountIds: string[]) =>
    fetchJson<Catalog>(`/catalog/${id}/link-social-accounts`, {
      method: 'POST',
      body: JSON.stringify({ socialAccountIds }),
    }),

  getProducts: (
    id: string,
    params?: {
      search?: string
      status?: string
      after?: string
      limit?: number
      collectionId?: string
    },
  ) => {
    const query = new URLSearchParams()
    if (params?.search) query.set('search', params.search)
    if (params?.status) query.set('status', params.status)
    if (params?.after) query.set('after', params.after)
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.collectionId) query.set('collectionId', params.collectionId)
    return fetchJson<{
      products: Product[]
      total: number
      cursors?: { after?: string; before?: string }
      hasMore: boolean
    }>(`/catalog/${id}/products?${query}`)
  },

  getProductsByIds: (catalogId: string, ids: string[]) =>
    fetchJson<{ products: Array<Product | null> }>(
      `/catalog/${catalogId}/products-by-ids?ids=${encodeURIComponent(ids.join(','))}`,
    ),

  getAnalysisProgress: (id: string) =>
    fetchJson<{
      analysisStatus: string
      description?: string
      productCount: number
      indexedCount: number
    }>(`/catalog/${id}/analysis-progress`),

  createProduct: (
    catalogId: string,
    data: {
      name: string
      retailerId: string
      description?: string
      imageUrl?: string
      additionalImageUrls?: string[]
      price?: string
      currency?: string
      category?: string
      url?: string
      availability?: string
      brand?: string
      condition?: string
      collectionId?: string
    },
  ) =>
    fetchJson<Product>(`/catalog/${catalogId}/products`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateProduct: (
    catalogId: string,
    productId: string,
    data: {
      name?: string
      retailerId?: string
      description?: string
      imageUrl?: string
      additionalImageUrls?: string[]
      price?: string
      currency?: string
      category?: string
      url?: string
      availability?: string
      brand?: string
      condition?: string
    },
  ) =>
    fetchJson<Product>(`/catalog/${catalogId}/products/${productId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteProduct: (catalogId: string, productId: string) =>
    fetchJson<void>(`/catalog/${catalogId}/products/${productId}`, { method: 'DELETE' }),

  listCollections: (catalogId: string) =>
    fetchJson<Collection[]>(`/catalog/${catalogId}/collections`),

  createCollection: (catalogId: string, data: { name: string; productIds?: string[] }) =>
    fetchJson<Collection>(`/catalog/${catalogId}/collections`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateCollection: (catalogId: string, collectionId: string, data: { name?: string }) =>
    fetchJson<Collection>(`/catalog/${catalogId}/collections/${collectionId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteCollection: (catalogId: string, collectionId: string) =>
    fetchJson<void>(`/catalog/${catalogId}/collections/${collectionId}`, { method: 'DELETE' }),

  // `isSmb` is set when Meta rejects the WABA product_catalogs call with the
  // (#10) "SMB business type" error — the reliable WhatsApp Business app signal.
  getWhatsappCommerceSettings: (phoneNumberId: string) =>
    fetchJson<{ data: Array<{ is_catalog_visible: boolean; id?: string }>; isSmb?: boolean }>(
      `/catalog/whatsapp-commerce/${phoneNumberId}`,
    ),

  associatePhone: (catalogId: string, phoneNumberId: string) =>
    fetchJson<{ success: boolean }>(`/catalog/${catalogId}/associate-phone`, {
      method: 'POST',
      body: JSON.stringify({ phoneNumberId }),
    }),

  dissociatePhone: (catalogId: string, phoneNumberId: string) =>
    fetchJson<{ success: boolean }>(`/catalog/${catalogId}/dissociate-phone/${phoneNumberId}`, {
      method: 'DELETE',
    }),

  // SMB numbers are linked manually on the phone; this records the link in our
  // DB (best-effort verified server-side via the connector).
  linkSmbPhone: (catalogId: string, phoneNumberId: string) =>
    fetchJson<{ success: boolean }>(`/catalog/${catalogId}/link-smb-phone`, {
      method: 'POST',
      body: JSON.stringify({ phoneNumberId }),
    }),

  // ─── AI Context ───

  listProductContexts: (catalogId: string, providerProductIds?: string[]) => {
    const q = providerProductIds?.length ? `?ids=${providerProductIds.join(',')}` : ''
    return fetchJson<Array<{ providerProductId: string; content: string }>>(
      `/catalog/${catalogId}/product-contexts${q}`,
    )
  },

  listCollectionContexts: (catalogId: string, providerCollectionIds?: string[]) => {
    const q = providerCollectionIds?.length ? `?ids=${providerCollectionIds.join(',')}` : ''
    return fetchJson<Array<{ providerCollectionId: string; content: string }>>(
      `/catalog/${catalogId}/collection-contexts${q}`,
    )
  },

  getProductContext: (catalogId: string, providerProductId: string) =>
    fetchJson<{
      content: string
      sameContentCount: number
      sameContentProductIds: string[]
    }>(`/catalog/${catalogId}/products/${providerProductId}/context`),

  analyzeContext: (
    catalogId: string,
    data: { prompt: string; productIds?: string[]; collectionIds?: string[] },
  ) =>
    fetchJson<{ hasConflict: boolean; conflictReason: string; suggestedContent: string }>(
      `/catalog/${catalogId}/product-contexts/analyze`,
      { method: 'POST', body: JSON.stringify(data) },
    ),

  saveContext: (
    catalogId: string,
    data: { content: string; productIds?: string[]; collectionIds?: string[] },
  ) =>
    fetchJson<{ savedProductIds: string[]; savedCollectionIds: string[] }>(
      `/catalog/${catalogId}/product-contexts/save`,
      { method: 'POST', body: JSON.stringify(data) },
    ),

  updateProductContext: (
    catalogId: string,
    providerProductId: string,
    data: { content: string; applyToSiblings?: boolean },
  ) =>
    fetchJson<{ success: boolean }>(`/catalog/${catalogId}/products/${providerProductId}/context`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // ─── Post links ───

  linkPosts: (
    catalogId: string,
    data: { postIds: string[]; productIds?: string[]; collectionIds?: string[] },
  ) =>
    fetchJson<{ linkedPostIds: string[] }>(`/catalog/${catalogId}/post-links`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listProductPostLinks: (
    catalogId: string,
    providerProductId: string,
    params?: { limit?: number; offset?: number },
  ) => {
    const q = new URLSearchParams()
    if (params?.limit) q.set('limit', String(params.limit))
    if (params?.offset) q.set('offset', String(params.offset))
    return fetchJson<PostLinkList>(
      `/catalog/${catalogId}/products/${providerProductId}/post-links?${q}`,
    )
  },

  listCollectionPostLinks: (
    catalogId: string,
    providerCollectionId: string,
    params?: { limit?: number; offset?: number },
  ) => {
    const q = new URLSearchParams()
    if (params?.limit) q.set('limit', String(params.limit))
    if (params?.offset) q.set('offset', String(params.offset))
    return fetchJson<PostLinkList>(
      `/catalog/${catalogId}/collections/${providerCollectionId}/post-links?${q}`,
    )
  },

  deleteProductPostLink: (catalogId: string, linkId: string) =>
    fetchJson<{ success: boolean }>(`/catalog/${catalogId}/product-post-links/${linkId}`, {
      method: 'DELETE',
    }),

  deleteCollectionPostLink: (catalogId: string, linkId: string) =>
    fetchJson<{ success: boolean }>(`/catalog/${catalogId}/collection-post-links/${linkId}`, {
      method: 'DELETE',
    }),

  // ─── Commerce Manager migration (import a WhatsApp number's catalogue) ───

  startMigration: (data: {
    organisationId: string
    catalogId: string
    sourcePhone: string
    sourceSocialAccountId?: string
  }) =>
    fetchJson<CatalogMigration>('/catalog-migration', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getMigration: (id: string) => fetchJson<CatalogMigration>(`/catalog-migration/${id}`),

  getActiveMigration: (orgId: string) =>
    fetchJson<CatalogMigration | null>(`/catalog-migration/org/${orgId}/active`),

  /** Last completed sync (which number fed the catalogue, and when) for the banner. */
  getLastSync: (catalogId: string) =>
    fetchJson<{
      sourcePhone: string
      sourceSocialAccountId: string | null
      finishedAt: string | null
      importedProducts: number
    } | null>(`/catalog-migration/catalog/${catalogId}/last-sync`),
}

export interface PostLink {
  id: string
  createdAt: string
  post: {
    id: string
    message?: string | null
    imageUrl?: string | null
    permalinkUrl?: string | null
    createdAt: string
  }
  socialAccount: {
    id: string
    provider: string
    pageName?: string | null
    username?: string | null
  }
}

export interface PostLinkList {
  total: number
  links: PostLink[]
}

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
  socialAccountId?: string
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

// ─── Labels ───

export interface LabelItem {
  id: string
  socialAccountId: string
  name: string
  color: string
  order: number
  createdAt: string
  updatedAt: string
}

export const labelApi = {
  list: (socialAccountId: string) => fetchJson<LabelItem[]>(`/labels/account/${socialAccountId}`),

  create: (data: { socialAccountId: string; name: string; color?: string }) =>
    fetchJson<LabelItem>('/labels', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: { name?: string; color?: string; order?: number }) =>
    fetchJson<LabelItem>(`/labels/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  remove: (id: string) => fetchJson<void>(`/labels/${id}`, { method: 'DELETE' }),
}

// ─── Social Accounts (uses existing endpoints) ───

export interface SocialAccount {
  id: string
  provider: string
  providerAccountId: string
  pageName?: string
  pageAbout?: string
  username?: string
  profilePictureUrl?: string
}

export const socialApi = {
  listAccounts: (orgId: string) => fetchJson<SocialAccount[]>(`/social/accounts/${orgId}`),

  // Soft disconnect: hides the account & stops sync but keeps history for reconnect.
  disconnect: (accountId: string) =>
    fetchJson<{ success: boolean }>(`/social/accounts/${accountId}/disconnect`, {
      method: 'POST',
    }),
}

// ─── Conversations ───

export interface ConversationItem {
  id: string
  socialAccountId: string
  participantId: string
  participantName: string
  participantAvatar?: string
  lastMessageText?: string
  lastMessageAt?: string
  unreadCount: number
}

export const conversationApi = {
  listByAccount: (accountId: string) =>
    fetchJson<ConversationItem[]>(`/messaging/conversations/${accountId}`),
}
