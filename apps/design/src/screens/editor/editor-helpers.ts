/* Helpers partagés de l'éditeur : métadonnées des objets Fabric, création
   d'éléments, constantes de style et hook de mesure du stage. */
import { useEffect, useRef, useState } from 'react'
import type { FabricObject } from 'fabric'
import type {
  DynKey,
  ElementType,
  FontKey,
  Product,
  TemplateElement,
  ToneKey,
} from '../../lib/types'

export const SWATCHES = [
  '#111b21',
  '#ffffff',
  '#f5c518',
  '#ef4444',
  '#25d366',
  '#1877f2',
  '#e4405f',
  '#494949',
]
export const TONES: ToneKey[] = ['light', 'mid', 'ink']

// Indicateurs de sélection (poignées/bordures) en noir de la charte (pas bleu).
export const CONTROL = {
  borderColor: '#111b21',
  cornerColor: '#111b21',
  cornerStrokeColor: '#ffffff',
  transparentCorners: false,
  cornerSize: 9,
  borderScaleFactor: 1.5,
} as const

// ─── Métadonnées portées par chaque objet Fabric (hors géométrie) ───
export interface Meta {
  id: string
  type: ElementType
  bind?: DynKey | null
  value?: string
  pattern?: string
  font?: FontKey
  radius?: number // px natif (rect/image)
}
export function getMeta(o: FabricObject): Meta {
  return (o as unknown as { _meta: Meta })._meta
}
export function setMeta(o: FabricObject, m: Meta) {
  ;(o as unknown as { _meta: Meta })._meta = m
}

let uid = 1000
export const nextId = () => 'n' + ++uid

// helper : produit un élément texte minimal (depuis la meta) pour resolveText
export function asEl(m: Meta): TemplateElement {
  return {
    id: m.id,
    type: 'text',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    bind: m.bind ?? null,
    value: m.value,
    pattern: m.pattern,
  }
}

export function sampleProduct(sample: Product | null, _tone: ToneKey): Product | null {
  return sample
}

export function newEl(type: ElementType): TemplateElement {
  const id = nextId()
  const base: TemplateElement = { id, type, x: 30, y: 42, w: 40, h: 14 }
  if (type === 'text')
    return {
      ...base,
      h: 8,
      bind: null,
      value: 'Nouveau texte',
      size: 34,
      weight: 600,
      color: '#111b21',
      align: 'center',
      font: 'sans',
    }
  if (type === 'rect') return { ...base, fill: '#111b21', radius: 0 }
  if (type === 'circle') return { ...base, w: 28, h: 28, fill: '#f5c518' }
  if (type === 'logo') return { ...base, x: 4, y: 4, w: 14, h: 14 }
  if (type === 'image') return { ...base, x: 0, y: 0, w: 100, h: 100, radius: 0 }
  return base
}

export function useSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const measure = () => {
      if (ref.current) {
        const r = ref.current.getBoundingClientRect()
        setSize({ w: r.width, h: r.height })
      }
    }
    measure()
    const id = requestAnimationFrame(measure)
    let ro: ResizeObserver | undefined
    if (window.ResizeObserver && ref.current) {
      ro = new ResizeObserver(measure)
      ro.observe(ref.current)
    }
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('resize', measure)
      if (ro) ro.disconnect()
    }
  }, [])
  return [ref, size] as const
}
