import i18n from '@app/i18n'

/**
 * Resolve a Google Product Category numeric ID to a translated label.
 * Meta uses these IDs in the `category` field of product catalogs.
 * Full taxonomy: https://support.google.com/merchants/answer/6324436
 *
 * Returns the translated label or the raw ID if unknown.
 */
const CATEGORY_KEYS: Record<string, string> = {
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

export function resolveCategory(categoryId?: string): string {
  if (!categoryId) return ''
  const key = CATEGORY_KEYS[categoryId]
  if (!key) return categoryId
  return i18n.t(`product_categories.${key}`)
}
