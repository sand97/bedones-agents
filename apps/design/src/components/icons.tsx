/* =========================================================
   Icônes — style Lucide (stroke 1.75) + glyphes produit.
   Porté depuis le prototype de design (icons.jsx).
   ========================================================= */
import { createElement as h, type CSSProperties, type FC, type ReactNode } from 'react'
import type { GlyphKey } from '../lib/types'

export interface IconProps {
  size?: number
  stroke?: number
  className?: string
  style?: CSSProperties
}

function mk(paths: string[]): FC<IconProps> {
  return function Icon({ size = 18, stroke = 1.75, className = '', style }: IconProps) {
    return h(
      'svg',
      {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: stroke,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        className,
        style,
      },
      paths.map((d, i) => h('path', { key: i, d })),
    )
  }
}

function mkRaw(children: ReactNode[]): FC<IconProps> {
  return function Icon({ size = 18, stroke = 1.75, className = '', style }: IconProps) {
    return h(
      'svg',
      {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: stroke,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        className,
        style,
      },
      children,
    )
  }
}

const icons = {
  // navigation / chrome
  x: mk(['M18 6 6 18', 'm6 6 12 12']),
  chevL: mk(['m15 18-6-6 6-6']),
  chevR: mk(['m9 18 6-6-6-6']),
  chevD: mk(['m6 9 6 6 6-6']),
  arrowR: mk(['M5 12h14', 'm12 5 7 7-7 7']),
  arrowL: mk(['M19 12H5', 'm12 19-7-7 7-7']),
  search: mkRaw([
    h('circle', { key: 0, cx: 11, cy: 11, r: 8 }),
    h('path', { key: 1, d: 'm21 21-4.3-4.3' }),
  ]),
  plus: mk(['M5 12h14', 'M12 5v14']),
  check: mk(['M20 6 9 17l-5-5']),
  trash: mk([
    'M3 6h18',
    'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
    'M10 11v6',
    'M14 11v6',
  ]),
  copy: mkRaw([
    h('rect', { key: 0, x: 9, y: 9, width: 13, height: 13, rx: 2 }),
    h('path', { key: 1, d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }),
  ]),

  // tools
  type: mk(['M4 7V4h16v3', 'M9 20h6', 'M12 4v16']),
  square: mkRaw([h('rect', { key: 0, x: 3, y: 3, width: 18, height: 18, rx: 2 })]),
  circle: mkRaw([h('circle', { key: 0, cx: 12, cy: 12, r: 9 })]),
  image: mkRaw([
    h('rect', { key: 0, x: 3, y: 3, width: 18, height: 18, rx: 2 }),
    h('circle', { key: 1, cx: 9, cy: 9, r: 2 }),
    h('path', { key: 2, d: 'm21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21' }),
  ]),
  logo: mkRaw([
    h('rect', { key: 0, x: 3, y: 3, width: 18, height: 18, rx: 2 }),
    h('path', { key: 1, d: 'M3 16l5-5 4 4 3-3 6 6' }),
    h('circle', { key: 2, cx: 8.5, cy: 8.5, r: 1.5 }),
  ]),
  tag: mkRaw([
    h('path', {
      key: 0,
      d: 'M12.6 2.6a2 2 0 0 0-1.4-.6H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8 8a2 2 0 0 0 2.8 0l7.2-7.2a2 2 0 0 0 0-2.8z',
    }),
    h('circle', { key: 1, cx: 7, cy: 7, r: 1.2, fill: 'currentColor' }),
  ]),
  layers: mk([
    'm12.8 2.5 8.5 4.2a.8.8 0 0 1 0 1.4l-8.5 4.2a1.8 1.8 0 0 1-1.6 0L2.7 8.1a.8.8 0 0 1 0-1.4l8.5-4.2a1.8 1.8 0 0 1 1.6 0Z',
    'm2.7 12 8.5 4.2a1.8 1.8 0 0 0 1.6 0L21.3 12',
    'm2.7 16.5 8.5 4.2a1.8 1.8 0 0 0 1.6 0l8.5-4.2',
  ]),
  settings: mkRaw([
    h('circle', { key: 0, cx: 12, cy: 12, r: 3 }),
    h('path', {
      key: 1,
      d: 'M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H7a1.6 1.6 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V7a1.6 1.6 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z',
    }),
  ]),
  align: mk(['M3 6h18', 'M3 12h12', 'M3 18h18']),
  alignC: mk(['M3 6h18', 'M6 12h12', 'M3 18h18']),
  alignR: mk(['M3 6h18', 'M9 12h12', 'M3 18h18']),
  download: mk(['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5', 'M12 15V3']),
  zip: mkRaw([
    h('path', { key: 0, d: 'M21 8v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6' }),
    h('path', { key: 1, d: 'M14 3v5h5' }),
    h('path', { key: 2, d: 'M9 4v1M9 7v1M9 10v1' }),
  ]),
  folder: mk([
    'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z',
  ]),
  bind: mk(['M9 17H7A5 5 0 0 1 7 7h2', 'M15 7h2a5 5 0 0 1 0 10h-2', 'M8 12h8']),
  sliders: mk([
    'M4 21v-7',
    'M4 10V3',
    'M12 21v-9',
    'M12 8V3',
    'M20 21v-5',
    'M20 12V3',
    'M1 14h6',
    'M9 8h6',
    'M17 16h6',
  ]),
  upload: mk(['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm17 8-5-5-5 5', 'M12 3v12']),

  // glyphes produit (placeholders)
  gJersey: mkRaw([
    h('path', { key: 0, d: 'M7 4 4 6l1.5 3.5L8 8v12h8V8l2.5 1.5L20 6l-3-2-2 1.5a3 3 0 0 1-6 0Z' }),
  ]),
  gShoe: mkRaw([
    h('path', { key: 0, d: 'M2 16v-3l5-2 3-4 1 3 3 .5 3 2 4 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1Z' }),
    h('path', { key: 1, d: 'M2 15h20' }),
  ]),
  gShirt: mkRaw([h('path', { key: 0, d: 'M16 3 12 5 8 3 3 6l2 4 3-1v12h8V9l3 1 2-4Z' })]),
  gDress: mkRaw([h('path', { key: 0, d: 'M9 3l3 2 3-2 1 4-2 2 3 11H8l3-11-2-2Z' })]),
  gCap: mkRaw([
    h('path', { key: 0, d: 'M3 15a9 9 0 0 1 18 0Z' }),
    h('path', { key: 1, d: 'M21 15h2' }),
  ]),
  gBag: mkRaw([
    h('path', { key: 0, d: 'M4 9h16l-1 11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z' }),
    h('path', { key: 1, d: 'M8 9V7a4 4 0 0 1 8 0v2' }),
  ]),
  gWatch: mkRaw([
    h('circle', { key: 0, cx: 12, cy: 12, r: 5 }),
    h('path', { key: 1, d: 'M9 7 8.5 3h7L15 7M9 17l-.5 4h7L15 17M12 10v2.5l1.5 1' }),
  ]),
}

export const I = {
  ...icons,
  glyph(kind: GlyphKey | undefined): FC<IconProps> {
    const map: Record<GlyphKey, FC<IconProps>> = {
      jersey: icons.gJersey,
      shoe: icons.gShoe,
      shirt: icons.gShirt,
      dress: icons.gDress,
      cap: icons.gCap,
      bag: icons.gBag,
      watch: icons.gWatch,
    }
    return (kind && map[kind]) || icons.gShirt
  },
}
