/* =========================================================
   Export réel : compositing de chaque image sélectionnée à la
   résolution native du format (canvas) puis génération d'un ZIP
   de PNG, nommés par code marchand. Tourne côté client.
   ========================================================= */
import JSZip from 'jszip'
import { FORMATS, TONE } from './data'
import { resolveText } from '../components/TemplateCanvas'
import type { SelectionItem, Template, TemplateElement } from './types'

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = url
  })
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

// object-fit: cover
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const ir = img.width / img.height
  const br = w / h
  let sx = 0
  let sy = 0
  let sw = img.width
  let sh = img.height
  if (ir > br) {
    sw = img.height * br
    sx = (img.width - sw) / 2
  } else {
    sh = img.width / br
    sy = (img.height - sh) / 2
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
}

function drawText(
  ctx: CanvasRenderingContext2D,
  el: TemplateElement,
  x: number,
  y: number,
  w: number,
  h: number,
  accent: string,
  text: string,
) {
  const size = el.size || 20
  const weight = el.weight || 500
  const family = el.font === 'mono' ? "'Geist Mono', monospace" : "'Geist', sans-serif"
  ctx.font = `${weight} ${size}px ${family}`
  ctx.fillStyle = el.color === 'accent' ? accent : el.color || '#111b21'
  ctx.textBaseline = 'middle'
  ctx.textAlign = el.align === 'center' ? 'center' : el.align === 'right' ? 'right' : 'left'
  const tx = el.align === 'center' ? x + w / 2 : el.align === 'right' ? x + w : x

  // word wrap to box width
  const words = String(text).split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > w && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)

  const lh = size * 1.15
  const totalH = lines.length * lh
  let ty = y + h / 2 - totalH / 2 + lh / 2
  for (const l of lines) {
    ctx.fillText(l, tx, ty)
    ty += lh
  }
}

async function compositeOne(template: Template, item: SelectionItem): Promise<Blob> {
  const fmt = FORMATS[template.format]
  const canvas = document.createElement('canvas')
  canvas.width = fmt.w
  canvas.height = fmt.h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas context unavailable')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, fmt.w, fmt.h)

  for (const el of template.elements) {
    const x = (el.x / 100) * fmt.w
    const y = (el.y / 100) * fmt.h
    const w = (el.w / 100) * fmt.w
    const h = (el.h / 100) * fmt.h
    const accent = template.accent

    if (el.type === 'image') {
      ctx.save()
      roundRectPath(ctx, x, y, w, h, el.radius || 0)
      ctx.clip()
      const fallback = () => {
        ctx.fillStyle = TONE[item.img.tone || 'light'].bg
        ctx.fillRect(x, y, w, h)
      }
      if (item.img.url) {
        try {
          const img = await loadImage(item.img.url)
          drawCover(ctx, img, x, y, w, h)
        } catch {
          fallback()
        }
      } else {
        fallback()
      }
      ctx.restore()
    } else if (el.type === 'rect') {
      const radius = el.radius === 999 ? Math.min(w, h) / 2 : el.radius || 0
      roundRectPath(ctx, x, y, w, h, radius)
      if (el.fill && el.fill !== 'none') {
        ctx.fillStyle = el.fill === 'accent' ? accent : el.fill
        ctx.fill()
      }
      if (el.stroke) {
        ctx.lineWidth = el.strokeW || 2
        ctx.strokeStyle = el.stroke === 'accent' ? accent : el.stroke
        ctx.stroke()
      }
    } else if (el.type === 'circle') {
      ctx.beginPath()
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
      ctx.fillStyle = el.fill === 'accent' ? accent : el.fill || '#111b21'
      ctx.fill()
    } else if (el.type === 'logo') {
      roundRectPath(ctx, x, y, w, h, 8)
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.fill()
      ctx.fillStyle = '#111b21'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `700 ${h * 0.7}px 'Geist', sans-serif`
      ctx.fillText('B', x + w / 2, y + h / 2)
    } else {
      drawText(ctx, el, x, y, w, h, accent, resolveText(el, item.product))
    }
  }

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  )
}

function safeName(s: string): string {
  return (s || 'image').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_')
}

/** Composite toutes les images sélectionnées et déclenche le téléchargement du ZIP. */
export async function exportZip(
  template: Template,
  selection: SelectionItem[],
  onProgress: (done: number, total: number) => void,
): Promise<string> {
  // Best effort : attendre les webfonts pour un rendu texte fidèle.
  try {
    await (document as Document & { fonts?: FontFaceSet }).fonts?.ready
  } catch {
    // pas de FontFaceSet — on continue
  }

  const zip = new JSZip()
  const used = new Set<string>()
  for (let i = 0; i < selection.length; i++) {
    const item = selection[i]
    const blob = await compositeOne(template, item)
    const base = safeName(item.product.code || `image-${i + 1}`)
    let name = `${base}.png`
    let n = 1
    while (used.has(name)) name = `${base}-${++n}.png`
    used.add(name)
    zip.file(name, blob)
    onProgress(i + 1, selection.length)
  }

  const content = await zip.generateAsync({ type: 'blob' })
  const fileName = `studio-${template.format.replace(':', 'x')}.zip`
  const url = URL.createObjectURL(content)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return fileName
}
