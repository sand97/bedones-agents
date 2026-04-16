import { useEffect, useState } from 'react'
import i18n, { loadCategoriesNamespace } from '@app/i18n'

// Kick off the lazy load as soon as anything from this module is imported,
// so translations are ready (or close to ready) by the time the UI renders.
void loadCategoriesNamespace()

type CategoryTFunction = (key: string) => string

/**
 * Google Product Categories mapping.
 * Meta stores the numeric ID in the `google_product_category` field.
 * Full taxonomy: https://support.google.com/merchants/answer/6324436
 *
 * Label translations live in `apps/frontend/src/app/i18n/locales/categories.{fr,en}.json`
 * and are loaded lazily via `loadCategoriesNamespace()`.
 */
export const CATEGORY_KEYS: Record<string, string> = {
  // Top-level
  '1': 'animals_pet_supplies',
  '8': 'arts_entertainment',
  '111': 'business_industrial',
  '141': 'cameras_optics',
  '166': 'apparel_accessories',
  '204': 'apparel_accessories',
  '212': 'bags_luggage',
  '222': 'electronics',
  '313': 'software',
  '328': 'hardware',
  '422': 'food_beverages',
  '469': 'health_beauty',
  '499': 'sporting_goods',
  '536': 'home_garden',
  '537': 'baby_toddler',
  '574': 'furniture',
  '630': 'kitchen',
  '689': 'bedding',
  '783': 'office_supplies',
  '888': 'vehicles_parts',
  '990': 'sports_outdoors',
  '1011': 'sporting_goods',
  '1239': 'toys_games',

  // Clothing
  '167': 'clothing',
  '178': 'shoes',
  '188': 'jewelry',
  '171': 'handbags',

  // Clothing subcategories
  '5322': 'shirts_tops',
  '5344': 'dresses',
  '5378': 'outerwear',
  '5388': 'pants',
  '5414': 'underwear',
  '5564': 'athletic_jerseys',
  '5190': 'uniforms',

  // Electronics subcategories
  '223': 'computers',
  '229': 'phones',
  '270': 'cameras',
  '342': 'tv_video',

  // Health & Beauty subcategories
  '474': 'skincare',
  '486': 'haircare',
}

function translate(t: CategoryTFunction | undefined, key: string): string {
  if (!t) return i18n.t(key, { ns: 'categories' })
  return t(key)
}

/**
 * Resolve a Google Product Category numeric ID to a translated label.
 * Falls back to the raw value for legacy free-text categories.
 *
 * Pass the `t` returned by `useTranslation('categories')` when calling from
 * a component to ensure re-render when the namespace finishes loading.
 */
export function resolveCategory(categoryId?: string, t?: CategoryTFunction): string {
  if (!categoryId) return ''
  const key = CATEGORY_KEYS[categoryId]
  if (!key) return categoryId
  return translate(t, key)
}

/**
 * Build Select options from the Google category mapping.
 * Value = numeric Google ID, label = translated name.
 * Duplicate labels are deduped.
 */
export function getCategoryOptions(
  t: (key: string) => string,
): Array<{ value: string; label: string }> {
  const seen = new Set<string>()
  const options: Array<{ value: string; label: string }> = []
  for (const [id, key] of Object.entries(CATEGORY_KEYS)) {
    if (seen.has(key)) continue
    seen.add(key)
    options.push({ value: id, label: t(key) })
  }
  return options.sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Ensures the `categories` i18n namespace is loaded, returning `true` when ready.
 * Triggers the dynamic import once; subsequent calls resolve immediately.
 */
export function useCategoriesReady(): boolean {
  const [ready, setReady] = useState(
    () => i18n.hasResourceBundle('fr', 'categories') && i18n.hasResourceBundle('en', 'categories'),
  )
  useEffect(() => {
    if (ready) return
    let cancelled = false
    loadCategoriesNamespace().then(() => {
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [ready])
  return ready
}
