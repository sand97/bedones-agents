/* Conversions modèle % ↔ objets Fabric : construction d'un objet Fabric depuis
   un élément du template et lecture inverse. Les conversions px/% passent par
   `dims.current` pour que les closures Fabric lisent toujours les dimensions à
   jour. */
import { useCallback, type RefObject } from 'react'
import { Ellipse, Group, Rect, Textbox, type FabricObject } from 'fabric'
import { TONE } from '../../lib/data'
import { resolveText } from '../../components/TemplateCanvas'
import { getMeta, sampleProduct, setMeta } from './editor-helpers'
import type { Align, Product, Template, TemplateElement, ToneKey } from '../../lib/types'

export interface Dims {
  cw: number
  ch: number
  fontScale: number
}

export function useObjectMapper({
  dims,
  template,
  sample,
  sampleImg,
  tone,
  cw,
  ch,
  fontScale,
}: {
  dims: RefObject<Dims>
  template: Template
  sample: Product | null
  sampleImg: string | undefined
  tone: ToneKey
  cw: number
  ch: number
  fontScale: number
}) {
  // ─── Conversions % ↔ px (basées sur dims.current) ───
  const pxX = (p: number) => (p / 100) * dims.current.cw
  const pxY = (p: number) => (p / 100) * dims.current.ch
  const pctX = (px: number) => (dims.current.cw ? (px / dims.current.cw) * 100 : 0)
  const pctY = (px: number) => (dims.current.ch ? (px / dims.current.ch) * 100 : 0)

  // ─── Construit un objet Fabric depuis un élément % ───
  const buildObject = useCallback(
    (el: TemplateElement): FabricObject | null => {
      const left = pxX(el.x)
      const top = pxY(el.y)
      const width = pxX(el.w)
      const height = pxY(el.h)
      const accent = template.accent
      const common = { left, top, originX: 'left' as const, originY: 'top' as const }

      if (el.type === 'rect') {
        const o = new Rect({
          ...common,
          width,
          height,
          fill: el.fill === 'none' ? 'transparent' : el.fill || '#111b21',
          stroke: el.stroke ? (el.stroke === 'accent' ? accent : el.stroke) : undefined,
          strokeWidth: el.stroke ? (el.strokeW || 2) * fontScale : 0,
          rx: el.radius === 999 ? Math.min(width, height) / 2 : (el.radius || 0) * fontScale,
          ry: el.radius === 999 ? Math.min(width, height) / 2 : (el.radius || 0) * fontScale,
        })
        setMeta(o, { id: el.id, type: 'rect', radius: el.radius })
        return o
      }
      if (el.type === 'circle') {
        const o = new Ellipse({
          ...common,
          rx: width / 2,
          ry: height / 2,
          fill: el.fill === 'accent' ? accent : el.fill || '#f5c518',
        })
        setMeta(o, { id: el.id, type: 'circle' })
        return o
      }
      if (el.type === 'logo') {
        const r = new Rect({
          left: 0,
          top: 0,
          width,
          height,
          rx: 8 * fontScale,
          ry: 8 * fontScale,
          fill: 'rgba(255,255,255,0.92)',
        })
        const t = new Textbox('B', {
          left: 0,
          top: 0,
          width,
          fontSize: height * 0.7,
          fontWeight: 700,
          fill: '#111b21',
          textAlign: 'center',
          fontFamily: 'Geist, sans-serif',
        })
        const g = new Group([r, t], { ...common })
        setMeta(g, { id: el.id, type: 'logo' })
        return g
      }
      if (el.type === 'image') {
        if (sampleImg) {
          // FabricImage.fromURL est async — on crée un Rect en attendant et on
          // remplace l'image au chargement (géré par buildScene).
        }
        const o = new Rect({
          ...common,
          width,
          height,
          fill: TONE[tone]?.bg || '#f5f5f5',
          rx: (el.radius || 0) * fontScale,
          ry: (el.radius || 0) * fontScale,
        })
        setMeta(o, { id: el.id, type: 'image', radius: el.radius })
        return o
      }
      // text
      const o = new Textbox(resolveText(el, sampleProduct(sample, tone)), {
        ...common,
        width: Math.max(20, width),
        fontSize: (el.size || 20) * fontScale,
        fontWeight: el.weight || 500,
        fill: el.color === 'accent' ? accent : el.color || '#111b21',
        textAlign: el.align || 'left',
        fontFamily: el.font === 'mono' ? "'Geist Mono', monospace" : 'Geist, sans-serif',
      })
      setMeta(o, {
        id: el.id,
        type: 'text',
        bind: el.bind ?? null,
        value: el.value,
        pattern: el.pattern,
        font: el.font,
      })
      return o
    },
    [cw, ch, fontScale, template.accent, sampleImg, tone, sample],
  )

  // ─── Lit un objet Fabric → élément % ───
  const readObject = useCallback(
    (o: FabricObject): TemplateElement => {
      const m = getMeta(o)
      const sx = o.scaleX ?? 1
      const sy = o.scaleY ?? 1
      const w = (o.width ?? 0) * sx
      const h = (o.height ?? 0) * sy
      const base: TemplateElement = {
        id: m.id,
        type: m.type,
        x: Math.round(pctX(o.left ?? 0) * 10) / 10,
        y: Math.round(pctY(o.top ?? 0) * 10) / 10,
        w: Math.round(pctX(w) * 10) / 10,
        h: Math.round(pctY(h) * 10) / 10,
      }
      if (m.type === 'text') {
        const tb = o as Textbox
        const fs = dims.current.fontScale || 1
        return {
          ...base,
          bind: m.bind ?? null,
          value: m.value ?? tb.text,
          pattern: m.pattern,
          size: Math.max(8, Math.round((tb.fontSize ?? 20) / fs)),
          weight: Number(tb.fontWeight) || 500,
          color: typeof tb.fill === 'string' ? tb.fill : '#111b21',
          align: (tb.textAlign as Align) || 'left',
          font: m.font || 'sans',
        }
      }
      if (m.type === 'rect') {
        const r = o as Rect
        return {
          ...base,
          fill: r.fill === 'transparent' ? 'none' : (r.fill as string) || '#111b21',
          radius: m.radius,
        }
      }
      if (m.type === 'circle') {
        const e = o as Ellipse
        return { ...base, fill: (e.fill as string) || '#f5c518' }
      }
      if (m.type === 'image') return { ...base, radius: m.radius }
      return base // logo
    },
    // dims.current/pctX/pctY lisent toujours les valeurs à jour → closure stable
    [],
  )

  return { pxX, pxY, pctX, pctY, buildObject, readObject }
}
