import { fetchJson } from './http'

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
