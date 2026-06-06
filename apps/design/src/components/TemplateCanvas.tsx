/* =========================================================
   Rendu composité d'un template sur un produit.
   Réutilisé par la galerie, l'éditeur et l'aperçu d'export.
   Porté depuis le prototype (shared.jsx), enrichi du support
   des vraies images produit (URL MinIO / Meta).
   ========================================================= */
import type { CSSProperties } from 'react'
import { I } from './icons'
import { TONE, FORMATS } from '../lib/data'
import type { DynKey, Product, Template, TemplateElement, ToneKey } from '../lib/types'

/** Produit enrichi des métadonnées d'affichage (ton + image résolue). */
type RenderProduct = (Product & { _tone?: ToneKey; _imageUrl?: string }) | null

// Placeholder image produit monochrome (charte "no stock photo")
export function ProductImage({
  product,
  tone,
  style,
}: {
  product: Product | null
  tone: ToneKey
  style?: CSSProperties
}) {
  const t = TONE[tone] || TONE.light
  const Glyph = I.glyph(product?.glyph)
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: t.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.5,
          backgroundImage: `repeating-linear-gradient(135deg, ${t.fg}22 0 1px, transparent 1px 14px)`,
        }}
      />
      <Glyph
        size={1}
        style={{ width: '46%', height: '46%', color: t.fg, opacity: 0.9 }}
        stroke={1.1}
      />
    </div>
  )
}

// Résout la valeur d'un champ (dynamique ou fixe)
export function resolveText(el: TemplateElement, product: Product | null): string {
  if (!el.bind || !product) return el.value ?? ''
  const map: Record<DynKey, string> = {
    name: product.name,
    desc: product.desc,
    code: product.code,
    price: product.price,
  }
  const value = map[el.bind] != null ? map[el.bind] : (el.value ?? '')
  // Gabarit "préfixe {} suffixe" si défini, sinon la valeur brute.
  return el.pattern && el.pattern.includes('{}') ? el.pattern.replace(/\{\}/g, value) : value
}

// Rendu d'un élément unique (positionné en % du cadre)
function RenderEl({
  el,
  product,
  fontScale,
  accent,
}: {
  el: TemplateElement
  product: RenderProduct
  fontScale: number
  accent: string
}) {
  const box: CSSProperties = {
    position: 'absolute',
    left: el.x + '%',
    top: el.y + '%',
    width: el.w + '%',
    height: el.h + '%',
  }

  if (el.type === 'image') {
    const radius = (el.radius || 0) * fontScale
    return (
      <div style={{ ...box, borderRadius: radius, overflow: 'hidden' }}>
        {product?._imageUrl ? (
          <img
            src={product._imageUrl}
            alt=""
            crossOrigin="anonymous"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <ProductImage product={product} tone={product?._tone || 'light'} />
        )}
      </div>
    )
  }

  if (el.type === 'rect') {
    return (
      <div
        style={{
          ...box,
          background: el.fill === 'none' ? 'transparent' : el.fill,
          border: el.stroke
            ? `${(el.strokeW || 2) * fontScale}px solid ${el.stroke === 'accent' ? accent : el.stroke}`
            : 'none',
          borderRadius: el.radius === 999 ? 999 : (el.radius || 0) * fontScale,
        }}
      />
    )
  }

  if (el.type === 'circle') {
    return (
      <div
        style={{ ...box, background: el.fill === 'accent' ? accent : el.fill, borderRadius: '50%' }}
      />
    )
  }

  if (el.type === 'logo') {
    return (
      <div
        style={{
          ...box,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255,255,255,0.92)',
          borderRadius: 8 * fontScale,
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: el.h * fontScale * 7,
            color: '#111b21',
            letterSpacing: '-0.03em',
          }}
        >
          B
        </span>
      </div>
    )
  }

  // text
  const justify =
    el.align === 'center' ? 'center' : el.align === 'right' ? 'flex-end' : 'flex-start'
  return (
    <div
      style={{
        ...box,
        display: 'flex',
        alignItems: 'center',
        justifyContent: justify,
        textAlign: el.align || 'left',
        fontFamily: el.font === 'mono' ? 'var(--font-mono)' : 'var(--font-sans)',
        fontWeight: el.weight || 500,
        fontSize: (el.size || 20) * fontScale,
        lineHeight: 1.1,
        color: el.color === 'accent' ? accent : el.color,
        overflow: 'hidden',
      }}
    >
      <span style={{ display: 'block', width: '100%', textWrap: 'balance' }}>
        {resolveText(el, product)}
      </span>
    </div>
  )
}

/** Rendu complet d'un template à une largeur donnée (px). */
export function TemplateCanvas({
  template,
  product,
  width,
  tone = 'light',
  imageUrl,
  className = '',
  style,
}: {
  template: Template
  product: Product | null
  width: number
  tone?: ToneKey
  imageUrl?: string
  className?: string
  style?: CSSProperties
}) {
  const fmt = FORMATS[template.format]
  const aspect = fmt.w / fmt.h
  const w = width
  const h = w / aspect
  const fontScale = w / fmt.w
  const prod: RenderProduct = product ? { ...product, _tone: tone, _imageUrl: imageUrl } : null
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: w,
        height: h,
        background: '#ffffff',
        overflow: 'hidden',
        flexShrink: 0,
        ...style,
      }}
    >
      {template.elements.map((el) => (
        <RenderEl
          key={el.id}
          el={el}
          product={prod}
          fontScale={fontScale}
          accent={template.accent}
        />
      ))}
    </div>
  )
}
