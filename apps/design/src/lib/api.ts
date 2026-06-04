/* =========================================================
   Client API du studio.
   Partage la session cookie avec api-moderator.bedones.com
   (credentials: 'include'). Charge le catalogue réel quand un
   catalogId est présent dans l'URL, sinon repli sur la démo.
   Les templates sont persistés par catalogue (localStorage v1 ;
   point de bascule prêt pour un endpoint backend).
   ========================================================= */
import { DEMO_COLLECTIONS, DEMO_TEMPLATES } from './data'
import type { Collection, Product, ProductImageRef, Template } from './types'

const API_URL = import.meta.env.VITE_API_URL || 'https://api-moderator.bedones.com'

export interface StudioParams {
  catalogId: string | null
  org: string | null
}

export function getParams(): StudioParams {
  const p = new URLSearchParams(window.location.search)
  return { catalogId: p.get('catalogId'), org: p.get('org') }
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

export interface Me {
  id: string
  name?: string
  email?: string
}

export async function fetchMe(): Promise<Me | null> {
  try {
    return await apiGet<Me>('/auth/me')
  } catch {
    return null
  }
}

// ─── Accès défensifs (les formes d'API peuvent varier légèrement) ───
type Raw = Record<string, unknown>

function asArray(x: unknown): Raw[] {
  if (Array.isArray(x)) return x as Raw[]
  if (x && typeof x === 'object') {
    const o = x as Raw
    for (const k of ['data', 'products', 'items', 'collections', 'results']) {
      if (Array.isArray(o[k])) return o[k] as Raw[]
    }
  }
  return []
}

function str(raw: Raw, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = raw[k]
    if (typeof v === 'string' && v) return v
    if (typeof v === 'number') return String(v)
  }
  return undefined
}

function strArray(raw: Raw, ...keys: string[]): string[] {
  for (const k of keys) {
    const v = raw[k]
    if (Array.isArray(v)) return v.filter((u): u is string => typeof u === 'string' && !!u)
  }
  return []
}

function mapProduct(raw: Raw): { product: Product; collectionId?: string } {
  const id = str(raw, 'id', 'retailerId', 'retailer_id') || Math.random().toString(36).slice(2)
  const images: ProductImageRef[] = []
  const main = str(raw, 'imageUrl', 'image_url')
  if (main) images.push({ id: `${id}-0`, url: main })
  strArray(raw, 'additionalImageUrls', 'additional_image_urls').forEach((u, i) =>
    images.push({ id: `${id}-${i + 1}`, url: u }),
  )
  if (images.length === 0) images.push({ id: `${id}-ph`, tone: 'light' })

  const priceRaw = str(raw, 'price')
  const currency = str(raw, 'currency')
  const price = priceRaw ? `${priceRaw}${currency ? ' ' + currency : ''}` : ''

  return {
    product: {
      id,
      name: str(raw, 'name') || 'Produit',
      code: str(raw, 'retailerId', 'retailer_id', 'code') || '',
      price,
      desc: str(raw, 'description', 'desc') || '',
      images,
    },
    collectionId: str(raw, 'collectionId', 'collection_id'),
  }
}

/**
 * Charge collections + produits réels et les regroupe par collection.
 * Lève une erreur si l'API n'est pas joignable (l'appelant retombe alors
 * sur les données de démonstration).
 */
export async function loadCatalog(catalogId: string): Promise<Collection[]> {
  const [colsRaw, prodsRaw] = await Promise.all([
    apiGet<unknown>(`/catalog/${catalogId}/collections`).catch(() => []),
    apiGet<unknown>(`/catalog/${catalogId}/products?limit=500`),
  ])

  const collections = asArray(colsRaw).map((c) => ({
    id: str(c, 'id') || '',
    name: str(c, 'name') || 'Collection',
  }))

  const mapped = asArray(prodsRaw).map(mapProduct)

  const byCol = new Map<string, Collection>()
  collections.forEach((c) => byCol.set(c.id, { id: c.id, name: c.name, products: [] }))
  const others: Collection = { id: '__others', name: 'Autres produits', products: [] }

  for (const { product, collectionId } of mapped) {
    const target = (collectionId && byCol.get(collectionId)) || others
    target.products.push(product)
  }

  const result = [...byCol.values()].filter((c) => c.products.length > 0)
  if (others.products.length > 0) result.push(others)
  if (result.length === 0) throw new Error('Aucun produit')
  return result
}

/** Charge le catalogue réel, ou la démo en repli. */
export async function loadCatalogOrDemo(catalogId: string | null): Promise<{
  collections: Collection[]
  isDemo: boolean
}> {
  if (!catalogId) return { collections: DEMO_COLLECTIONS, isDemo: true }
  try {
    const collections = await loadCatalog(catalogId)
    return { collections, isDemo: false }
  } catch {
    return { collections: DEMO_COLLECTIONS, isDemo: true }
  }
}

// ─── Persistance des templates (v1 localStorage par catalogue) ───
const tplKey = (catalogId: string | null) => `bedones.studio.templates.${catalogId || 'demo'}`

export function loadTemplates(catalogId: string | null): Template[] {
  try {
    const raw = localStorage.getItem(tplKey(catalogId))
    if (raw) return JSON.parse(raw) as Template[]
  } catch {
    // ignore malformed cache
  }
  return DEMO_TEMPLATES
}

export function persistTemplates(catalogId: string | null, templates: Template[]): void {
  try {
    localStorage.setItem(tplKey(catalogId), JSON.stringify(templates))
  } catch {
    // storage unavailable — non bloquant
  }
}
