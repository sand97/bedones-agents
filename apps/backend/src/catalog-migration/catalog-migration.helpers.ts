/** A product as stored by the page script's save-catalog callback. */
export interface StoredProduct {
  name: string
  description?: string | null
  price?: number | null
  currency?: string | null
  availability?: string | null
  retailerId?: string | null
  imageUrl?: string | null
  additionalImageUrls?: string[]
}

/** A collection (product set) as stored by the page script's save-catalog callback. */
export interface StoredCollection {
  name: string
  retailerIds: string[]
}

/** Notion spec: an extraction is capped at ~1 minute, one at a time. */
export const MINUTES_PER_SYNC = 1

/** Shape a stored product for CatalogService.createProduct (price → major-unit string). */
export function toCreateProduct(p: StoredProduct) {
  const additional =
    Array.isArray(p.additionalImageUrls) && p.additionalImageUrls.length > 0
      ? p.additionalImageUrls
      : undefined
  return {
    name: p.name || 'Sans nom',
    // The merchant's product code carried over from the scraped catalogue.
    retailerId: p.retailerId ?? '',
    description: p.description ?? undefined,
    imageUrl: p.imageUrl ?? undefined,
    additionalImageUrls: additional,
    // Major currency units (createProduct converts to Meta's minor units).
    price: p.price != null ? String(p.price) : undefined,
    currency: p.currency ?? undefined,
    availability: p.availability ?? undefined,
  }
}

/** True when a Meta error is the "wrong catalog vertical" rejection (subcode 1803298). */
export function isWrongCatalogVertical(raw: string): boolean {
  return /1803298|Wrong Catalog Vertical|not support(?:ed)? in this catalog vertical/i.test(raw)
}

/**
 * True when Meta rejects an item because it already exists in the catalogue
 * (duplicate retailer_id / product set). On a re-sync that's a no-op we count
 * as success rather than a failure.
 */
export function isAlreadyExists(raw: string): boolean {
  return /already exists|2310021|duplicate/i.test(raw)
}

/** Map a stored failure message to a stable, frontend-actionable error code. */
export function deriveErrorCode(error?: string | null): string | undefined {
  if (error && isWrongCatalogVertical(error)) return 'WRONG_CATALOG_VERTICAL'
  return undefined
}
