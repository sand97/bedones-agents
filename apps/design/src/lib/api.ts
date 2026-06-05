/* =========================================================
   Client API du studio.
   Partage la session cookie avec api-moderator.bedones.com
   (credentials: 'include'). Charge le catalogue réel quand un
   catalogId est présent dans l'URL, sinon repli sur la démo.
   Les templates sont persistés en base via l'API catalogue
   (/catalog/:id/image-templates), fusionnés avec les statiques.
   ========================================================= */
import { DEMO_COLLECTIONS, DEMO_TEMPLATES } from './data'
import type {
  Collection,
  FormatKey,
  Product,
  ProductImageRef,
  Template,
  TemplateElement,
} from './types'

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

// ─── Persistance des templates (BD, scopée au catalogue) ───
// Par défaut le studio affiche des templates statiques ; dès qu'un user en
// modifie un, il est persisté en base (POST) puis mis à jour (PATCH). Les
// changements suivent ainsi l'utilisateur d'un appareil à l'autre.

const STATIC_IDS = new Set(DEMO_TEMPLATES.map((t) => t.id))

interface ImageTemplateRow {
  id: string
  name: string
  format: string
  accent?: string | null
  sourceKey?: string | null
  definition?: { elements?: TemplateElement[] } | null
}

async function apiSend<T>(method: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

function mapRow(row: ImageTemplateRow): Template {
  const base = row.sourceKey ? DEMO_TEMPLATES.find((t) => t.id === row.sourceKey) : undefined
  return {
    id: row.sourceKey || row.id,
    dbId: row.id,
    sourceKey: row.sourceKey ?? undefined,
    name: row.name,
    format: (row.format as FormatKey) || '1:1',
    accent: row.accent || base?.accent || '#111b21',
    elements: row.definition?.elements ?? base?.elements ?? [],
    uses: base?.uses ?? 0,
    edited: 'enregistré',
  }
}

/** Charge les templates : statiques fusionnés avec les overrides en base. */
export async function loadTemplates(catalogId: string | null): Promise<Template[]> {
  if (!catalogId) return DEMO_TEMPLATES
  let rows: ImageTemplateRow[]
  try {
    rows = await apiGet<ImageTemplateRow[]>(`/catalog/${catalogId}/image-templates`)
  } catch {
    return DEMO_TEMPLATES
  }
  const overrides = new Map<string, Template>()
  const created: Template[] = []
  for (const row of rows) {
    const mapped = mapRow(row)
    if (row.sourceKey) overrides.set(row.sourceKey, mapped)
    else created.push(mapped)
  }
  const statics = DEMO_TEMPLATES.map((s) => overrides.get(s.id) ?? s)
  return [...created, ...statics]
}

/**
 * Persiste un template. PATCH s'il a déjà un dbId, sinon POST (avec
 * sourceKey = id du template statique d'origine si c'en est un). Renvoie le
 * template enrichi de son dbId. Mode démo (sans catalogId) : pas de persistance.
 */
export async function saveTemplate(catalogId: string | null, tpl: Template): Promise<Template> {
  if (!catalogId) return tpl
  const definition = { elements: tpl.elements }
  const body = { name: tpl.name, format: tpl.format, accent: tpl.accent, definition }
  let row: ImageTemplateRow
  if (tpl.dbId) {
    row = await apiSend<ImageTemplateRow>(
      'PATCH',
      `/catalog/${catalogId}/image-templates/${tpl.dbId}`,
      body,
    )
  } else {
    const sourceKey = STATIC_IDS.has(tpl.id) ? tpl.id : undefined
    row = await apiSend<ImageTemplateRow>('POST', `/catalog/${catalogId}/image-templates`, {
      ...body,
      sourceKey,
    })
  }
  return { ...tpl, dbId: row.id, sourceKey: row.sourceKey ?? tpl.sourceKey }
}
