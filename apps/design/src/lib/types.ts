/* =========================================================
   Studio images catalogue — types partagés.
   ========================================================= */

export type FormatKey = '1:1' | '4:5' | '9:16' | '16:9'

export interface FormatDef {
  label: string
  sub: string
  w: number
  h: number
  net: string
}

export type ElementType = 'image' | 'rect' | 'circle' | 'text' | 'logo'
export type DynKey = 'name' | 'desc' | 'code' | 'price'
export type Align = 'left' | 'center' | 'right'
export type FontKey = 'sans' | 'mono'
export type ToneKey = 'light' | 'mid' | 'ink'
export type GlyphKey = 'jersey' | 'shirt' | 'shoe' | 'bag' | 'cap' | 'dress' | 'watch'

/** Un élément de template, positionné en % du cadre. */
export interface TemplateElement {
  id: string
  type: ElementType
  x: number
  y: number
  w: number
  h: number
  radius?: number
  fill?: string
  stroke?: string
  strokeW?: number
  bind?: DynKey | null
  value?: string
  /** Gabarit appliqué à un champ dynamique : "{}" est remplacé par la valeur
   *  (ex: "Prix : {} FCFA"). Vide → la valeur brute. */
  pattern?: string
  size?: number
  weight?: number
  color?: string
  align?: Align
  font?: FontKey
}

export interface Template {
  id: string
  name: string
  format: FormatKey
  accent: string
  edited: string
  uses: number
  elements: TemplateElement[]
  /** Id en base (présent dès qu'il a été persisté). */
  dbId?: string
  /** Id du template statique d'origine (pour les overrides). */
  sourceKey?: string
}

/** Une image d'un produit : URL réelle (MinIO/Meta) ou ton de placeholder. */
export interface ProductImageRef {
  id: string
  url?: string
  tone?: ToneKey
}

export interface Product {
  id: string
  name: string
  code: string
  price: string
  desc: string
  glyph?: GlyphKey
  images: ProductImageRef[]
}

export interface Collection {
  id: string
  name: string
  products: Product[]
}

export interface SelectionItem {
  product: Product
  img: ProductImageRef
}

export interface DynField {
  key: DynKey
  label: string
}
