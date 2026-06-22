/* =========================================================
   Éditeur de template — moteur Fabric.js.
   Fabric gère la sélection, le déplacement, le redimensionnement
   et la rotation (poignées natives) ; notre modèle `%` (els) reste
   la source de vérité persistée (rebuild Fabric depuis els au
   changement de format/taille, resync els à chaque modification).
   ========================================================= */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Canvas, Ellipse, FabricImage, Group, Rect, Textbox, type FabricObject } from 'fabric'
import { AligningGuidelines } from 'fabric/extensions'
import { I, type IconProps } from '../components/icons'
import { FORMATS, FORMAT_KEYS, DYN_FIELDS, TONE } from '../lib/data'
import { resolveText } from '../components/TemplateCanvas'
import type {
  Align,
  DynKey,
  ElementType,
  FontKey,
  FormatKey,
  Product,
  Template,
  TemplateElement,
  ToneKey,
} from '../lib/types'

export interface EditorHandle {
  getTemplate: () => Template
}

const SWATCHES = [
  '#111b21',
  '#ffffff',
  '#f5c518',
  '#ef4444',
  '#25d366',
  '#1877f2',
  '#e4405f',
  '#494949',
]
const TONES: ToneKey[] = ['light', 'mid', 'ink']

// Indicateurs de sélection (poignées/bordures) en noir de la charte (pas bleu).
const CONTROL = {
  borderColor: '#111b21',
  cornerColor: '#111b21',
  cornerStrokeColor: '#ffffff',
  transparentCorners: false,
  cornerSize: 9,
  borderScaleFactor: 1.5,
} as const

// ─── Métadonnées portées par chaque objet Fabric (hors géométrie) ───
interface Meta {
  id: string
  type: ElementType
  bind?: DynKey | null
  value?: string
  pattern?: string
  font?: FontKey
  radius?: number // px natif (rect/image)
}
function getMeta(o: FabricObject): Meta {
  return (o as unknown as { _meta: Meta })._meta
}
function setMeta(o: FabricObject, m: Meta) {
  ;(o as unknown as { _meta: Meta })._meta = m
}

let uid = 1000
const nextId = () => 'n' + ++uid

function useSize() {
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

export function Editor({
  template,
  sample,
  apiRef,
}: {
  template: Template
  sample: Product | null
  apiRef: { current: EditorHandle | null }
}) {
  const [name, setName] = useState(template.name)
  const [format, setFormat] = useState<FormatKey>(template.format)
  const [tone, setTone] = useState<ToneKey>('light')
  const [panelW, setPanelW] = useState(340)
  const [selId, setSelId] = useState<string | null>(null)
  // bump pour rafraîchir le panneau/calques quand Fabric change
  const [rev, setRev] = useState(0)
  const bump = useCallback(() => setRev((r) => r + 1), [])

  const [stageRef, stageSize] = useSize()
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<Canvas | null>(null)
  // modèle % courant — source de vérité pour rebuild (format/resize)
  const elsRef = useRef<TemplateElement[]>(template.elements.map((e) => ({ ...e })))

  const fmt = FORMATS[format]
  const aspect = fmt.w / fmt.h
  const sampleImg = sample?.images.find((i) => i.url)?.url

  const margin = 120
  let cw = 0
  if (stageSize.w && stageSize.h) {
    cw = Math.max(160, Math.min(stageSize.w - margin, (stageSize.h - margin) * aspect))
  }
  const ch = cw / aspect
  const fontScale = cw / fmt.w

  // dims courantes via ref → les closures Fabric (handlers montés une fois)
  // lisent toujours les dimensions à jour, jamais une valeur figée au montage.
  const dims = useRef({ cw, ch, fontScale })
  dims.current = { cw, ch, fontScale }

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

  // getTemplate : sérialise la scène Fabric → modèle %
  const serialize = useCallback((): Template => {
    const canvas = fabricRef.current
    const elements = canvas ? canvas.getObjects().map(readObject) : elsRef.current
    elsRef.current = elements
    return { ...template, name, format, elements }
  }, [name, format, template, readObject])

  apiRef.current = { getTemplate: serialize }

  // ─── (Re)construit toute la scène Fabric depuis elsRef ───
  const buildScene = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas || cw <= 0) return
    canvas.setDimensions({ width: cw, height: ch })
    canvas.backgroundColor = '#ffffff'
    canvas.remove(...canvas.getObjects())

    for (const el of elsRef.current) {
      const obj = buildObject(el)
      if (!obj) continue
      obj.set(CONTROL)
      canvas.add(obj)
      // Charge la vraie image produit dans la zone image (async)
      if (el.type === 'image' && sampleImg) {
        FabricImage.fromURL(sampleImg, { crossOrigin: 'anonymous' })
          .then((img) => {
            if (!fabricRef.current) return
            const placeholder = canvas.getObjects().find((o) => getMeta(o)?.id === el.id)
            if (!placeholder) return
            const tw = placeholder.width ?? pxX(el.w)
            const th = placeholder.height ?? pxY(el.h)
            img.set({
              left: placeholder.left,
              top: placeholder.top,
              originX: 'left',
              originY: 'top',
              scaleX: tw / (img.width || tw),
              scaleY: th / (img.height || th),
            })
            img.set(CONTROL)
            setMeta(img, { id: el.id, type: 'image', radius: el.radius })
            const idx = canvas.getObjects().indexOf(placeholder)
            canvas.remove(placeholder)
            canvas.insertAt(idx, img)
            canvas.renderAll()
          })
          .catch(() => {})
      }
    }
    canvas.renderAll()
    bump()
  }, [cw, ch, buildObject, sampleImg, pxX, pxY, bump])

  // ─── Historique (undo / redo via Ctrl/Cmd+Z) ───
  const buildSceneRef = useRef(buildScene)
  buildSceneRef.current = buildScene
  const historyRef = useRef<TemplateElement[][]>([])
  const histIdx = useRef(-1)
  const isRestoring = useRef(false)

  const pushHistory = useCallback(() => {
    if (isRestoring.current) return
    const snap = JSON.parse(JSON.stringify(elsRef.current)) as TemplateElement[]
    const h = historyRef.current
    h.splice(histIdx.current + 1) // coupe la branche "redo"
    h.push(snap)
    if (h.length > 80) h.shift()
    histIdx.current = h.length - 1
  }, [])

  const restore = useCallback((snap: TemplateElement[]) => {
    isRestoring.current = true
    elsRef.current = JSON.parse(JSON.stringify(snap)) as TemplateElement[]
    buildSceneRef.current()
    setSelId(null)
    isRestoring.current = false
  }, [])

  const undo = useCallback(() => {
    if (histIdx.current > 0) {
      histIdx.current -= 1
      restore(historyRef.current[histIdx.current])
    }
  }, [restore])

  const redo = useCallback(() => {
    if (histIdx.current < historyRef.current.length - 1) {
      histIdx.current += 1
      restore(historyRef.current[histIdx.current])
    }
  }, [restore])

  // Snapshot initial (baseline du 1er undo)
  useEffect(() => {
    pushHistory()
  }, [pushHistory])

  // Init Fabric (une fois)
  useEffect(() => {
    if (!canvasElRef.current) return
    const canvas = new Canvas(canvasElRef.current, {
      preserveObjectStacking: true,
      selection: true,
    })
    // sélection multiple en noir (pas bleu)
    canvas.selectionColor = 'rgba(17,27,33,0.08)'
    canvas.selectionBorderColor = '#111b21'
    canvas.selectionLineWidth = 1
    fabricRef.current = canvas

    // Guides d'alignement + magnétisme (bordures du cadre, centre, autres éléments)
    const guidelines = new AligningGuidelines(canvas, { color: '#111b21', width: 1, margin: 5 })

    const onSel = () => {
      const a = canvas.getActiveObject()
      setSelId(a ? (getMeta(a)?.id ?? null) : null)
    }
    canvas.on('selection:created', onSel)
    canvas.on('selection:updated', onSel)
    canvas.on('selection:cleared', () => setSelId(null))
    canvas.on('object:modified', (e) => {
      const o = e.target
      if (o) {
        // "bake" l'échelle dans les dimensions pour des lectures w/h fiables
        const sx = o.scaleX ?? 1
        const sy = o.scaleY ?? 1
        if (sx !== 1 || sy !== 1) {
          o.set({ width: (o.width ?? 0) * sx, height: (o.height ?? 0) * sy, scaleX: 1, scaleY: 1 })
          o.setCoords()
        }
      }
      elsRef.current = canvas.getObjects().map(readObject)
      bump()
      pushHistory()
    })

    // Undo / redo clavier (sauf pendant la saisie dans un champ ou un texte)
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      if (!meta || (k !== 'z' && k !== 'y')) return
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable))
        return
      const act = fabricRef.current?.getActiveObject() as { isEditing?: boolean } | undefined
      if (act?.isEditing) return
      e.preventDefault()
      if (k === 'y' || e.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('keydown', onKey)
      guidelines.dispose()
      canvas.dispose()
      fabricRef.current = null
    }
  }, [])

  // Rebuild quand la taille de rendu ou le format/tone changent.
  const rebuildKey = `${format}|${tone}|${Math.round(cw)}`
  const lastKey = useRef('')
  useEffect(() => {
    if (cw <= 0) return
    if (lastKey.current === rebuildKey) return
    lastKey.current = rebuildKey
    buildScene()
  }, [rebuildKey, cw, buildScene])

  // ─── Helpers d'édition ───
  const activeObj = () => fabricRef.current?.getActiveObject() ?? null

  const syncEls = () => {
    const canvas = fabricRef.current
    if (canvas) elsRef.current = canvas.getObjects().map(readObject)
    bump()
  }
  // sync + snapshot historique (à appeler après toute mutation utilisateur)
  const commit = () => {
    syncEls()
    pushHistory()
  }

  const addEl = (type: ElementType) => {
    const canvas = fabricRef.current
    if (!canvas) return
    const el = newEl(type)
    const obj = buildObject(el)
    if (!obj) return
    obj.set(CONTROL)
    canvas.add(obj)
    canvas.setActiveObject(obj)
    canvas.renderAll()
    setSelId(el.id)
    commit()
  }

  const removeSel = () => {
    const canvas = fabricRef.current
    const o = activeObj()
    if (canvas && o) {
      canvas.remove(o)
      canvas.discardActiveObject()
      canvas.renderAll()
      setSelId(null)
      commit()
    }
  }

  const reorder = (dir: number) => {
    const canvas = fabricRef.current
    const o = activeObj()
    if (!canvas || !o) return
    if (dir > 0) canvas.bringObjectForward(o)
    else canvas.sendObjectBackwards(o)
    canvas.renderAll()
    commit()
  }

  // Réordonne un calque par id (boutons de la liste des calques)
  const reorderById = (id: string, dir: number) => {
    const canvas = fabricRef.current
    if (!canvas) return
    const o = canvas.getObjects().find((x) => getMeta(x)?.id === id)
    if (!o) return
    if (dir > 0) canvas.bringObjectForward(o)
    else canvas.sendObjectBackwards(o)
    canvas.renderAll()
    commit()
  }

  const selectById = (id: string) => {
    const canvas = fabricRef.current
    if (!canvas) return
    const o = canvas.getObjects().find((x) => getMeta(x)?.id === id)
    if (o) {
      canvas.setActiveObject(o)
      canvas.renderAll()
      setSelId(id)
    }
  }

  // Applique une modification de propriété à l'objet sélectionné.
  const patchSel = (patch: Partial<TemplateElement>) => {
    const canvas = fabricRef.current
    const o = activeObj()
    if (!canvas || !o) return
    const m = getMeta(o)
    if (m.type === 'text') {
      const tb = o as Textbox
      if (patch.value !== undefined) m.value = patch.value
      if (patch.bind !== undefined) m.bind = patch.bind
      if (patch.pattern !== undefined) m.pattern = patch.pattern
      if (patch.value !== undefined || patch.bind !== undefined || patch.pattern !== undefined) {
        tb.set(
          'text',
          m.bind ? resolveText(asEl(m), sampleProduct(sample, tone)) : m.value || 'Texte',
        )
      }
      if (patch.size !== undefined) tb.set('fontSize', patch.size * fontScale)
      if (patch.weight !== undefined) tb.set('fontWeight', patch.weight)
      if (patch.align !== undefined) tb.set('textAlign', patch.align)
      if (patch.color !== undefined) tb.set('fill', patch.color)
    } else if (m.type === 'rect') {
      const r = o as Rect
      if (patch.fill !== undefined)
        r.set('fill', patch.fill === 'none' ? 'transparent' : patch.fill)
      if (patch.radius !== undefined) {
        m.radius = patch.radius
        const rr =
          patch.radius === 999
            ? Math.min(r.width ?? 0, r.height ?? 0) / 2
            : (patch.radius || 0) * fontScale
        r.set({ rx: rr, ry: rr })
      }
    } else if (m.type === 'circle') {
      if (patch.fill !== undefined) (o as Ellipse).set('fill', patch.fill)
    } else if (m.type === 'image') {
      if (patch.radius !== undefined) m.radius = patch.radius
    }
    // géométrie numérique
    if (patch.x !== undefined) o.set('left', pxX(patch.x))
    if (patch.y !== undefined) o.set('top', pxY(patch.y))
    if (patch.w !== undefined) o.set('width', pxX(patch.w))
    if (patch.h !== undefined) o.set('height', pxY(patch.h))
    o.setCoords()
    canvas.renderAll()
    commit()
  }

  // panel resizer
  const onResizeMove = useCallback((e: PointerEvent) => {
    setPanelW(Math.min(460, Math.max(280, window.innerWidth - e.clientX)))
  }, [])
  const onResizeEnd = useCallback(() => {
    window.removeEventListener('pointermove', onResizeMove)
    window.removeEventListener('pointerup', onResizeEnd)
  }, [onResizeMove])
  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    window.addEventListener('pointermove', onResizeMove)
    window.addEventListener('pointerup', onResizeEnd)
  }

  // Descripteurs dérivés pour le panneau / les calques (recalculés via rev).
  const descriptors = useMemo(() => {
    void rev
    const canvas = fabricRef.current
    if (!canvas) return [] as TemplateElement[]
    return canvas.getObjects().map(readObject)
  }, [rev, readObject])
  const sel = descriptors.find((e) => e.id === selId) || null

  const TOOLS: { type: ElementType; icon: FC<IconProps>; label: string }[] = [
    { type: 'text', icon: I.type, label: 'Texte' },
    { type: 'rect', icon: I.square, label: 'Rect.' },
    { type: 'circle', icon: I.circle, label: 'Cercle' },
    { type: 'logo', icon: I.logo, label: 'Logo' },
    { type: 'image', icon: I.image, label: 'Image' },
  ]
  const elIcon = (t: ElementType): FC<IconProps> =>
    ({ text: I.type, rect: I.square, circle: I.circle, logo: I.logo, image: I.image })[t] ||
    I.square
  const elName = (e: TemplateElement): string => {
    if (e.type === 'text')
      return e.bind
        ? '{' + (DYN_FIELDS.find((d) => d.key === e.bind)?.label || '') + '}'
        : e.value || 'Texte'
    return (
      { rect: 'Rectangle', circle: 'Cercle', logo: 'Logo', image: 'Zone produit' }[e.type] || ''
    )
  }

  return (
    <div className="editor" style={{ gridTemplateColumns: `64px 1fr 6px ${panelW}px` }}>
      <div className="editor-toolrail">
        {TOOLS.map((t) => (
          <button
            key={t.type}
            className="tool-btn"
            onClick={() => addEl(t.type)}
            title={'Ajouter ' + t.label}
          >
            <t.icon size={18} stroke={1.6} />
            <span>{t.label}</span>
          </button>
        ))}
        <div className="tool-sep" />
        <button
          className="tool-btn"
          onClick={() => addEl('text')}
          title="Champ dynamique"
          style={{ position: 'relative' }}
        >
          <I.tag size={18} stroke={1.6} />
          <span>Champ</span>
        </button>
      </div>

      <div
        className="editor-stage"
        ref={stageRef}
        onMouseDown={(e) => {
          // Clic sur la zone grise autour du cadre (pas sur le canvas ni les
          // barres d'outils) → désélectionne et réaffiche la liste des calques.
          if (e.target === e.currentTarget) {
            const canvas = fabricRef.current
            if (canvas) {
              canvas.discardActiveObject()
              canvas.renderAll()
            }
            setSelId(null)
          }
        }}
      >
        <div className="editor-stage-bar">
          <div className="seg">
            {FORMAT_KEYS.map((k) => (
              <button
                key={k}
                className={format === k ? 'on' : ''}
                onClick={() => {
                  // fige le modèle courant avant de changer de format
                  elsRef.current = serialize().elements
                  setFormat(k)
                }}
                title={FORMATS[k].label + ' · ' + FORMATS[k].sub}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        <div className="canvas-wrap" style={{ width: cw || 1, height: ch || 1 }}>
          <canvas ref={canvasElRef} />
        </div>

        <div className="stage-img-switch">
          <span>Image d'exemple</span>
          <div className="swatches">
            {TONES.map((tn) => (
              <button
                key={tn}
                className={'sw' + (tone === tn ? ' on' : '')}
                onClick={() => {
                  elsRef.current = serialize().elements
                  setTone(tn)
                }}
                title={tn}
              >
                <span style={{ position: 'absolute', inset: 0, background: TONE[tn].bg }} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="resizer" onPointerDown={startResize} />

      <div className="editor-props">
        {!sel && (
          <PropsTemplate
            name={name}
            setName={setName}
            els={descriptors}
            selId={selId}
            selectById={selectById}
            reorderById={reorderById}
            elIcon={elIcon}
            elName={elName}
            fmt={fmt}
            format={format}
          />
        )}
        {sel && <PropsElement sel={sel} patch={patchSel} remove={removeSel} reorder={reorder} />}
      </div>
    </div>
  )
}

// helper : produit un élément texte minimal (depuis la meta) pour resolveText
function asEl(m: Meta): TemplateElement {
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

function sampleProduct(sample: Product | null, _tone: ToneKey): Product | null {
  return sample
}

function newEl(type: ElementType): TemplateElement {
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

// ─── Panneau "réglages template" ───
function PropsTemplate({
  name,
  setName,
  els,
  selId,
  selectById,
  reorderById,
  elIcon,
  elName,
  fmt,
  format,
}: {
  name: string
  setName: (v: string) => void
  els: TemplateElement[]
  selId: string | null
  selectById: (id: string) => void
  reorderById: (id: string, dir: number) => void
  elIcon: (t: ElementType) => FC<IconProps>
  elName: (e: TemplateElement) => string
  fmt: { label: string; sub: string }
  format: FormatKey
}) {
  return (
    <>
      <div className="props-head">
        <span className="t">Template</span>
        <I.settings size={16} style={{ color: 'var(--fg-3)' }} />
      </div>
      <div className="props-section">
        <div className="field">
          <label>Nom du template</label>
          <input className="inp" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Format</label>
          <div className="kv" style={{ borderBottom: 0, padding: 0 }}>
            <span className="v" style={{ fontWeight: 600 }}>
              {format} · {fmt.label}
            </span>
            <span
              className="k"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-3)' }}
            >
              {fmt.sub}
            </span>
          </div>
        </div>
      </div>
      <div className="props-section" style={{ flex: 1 }}>
        <div className="lab">Calques · {els.length}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[...els].reverse().map((e) => {
            const Ic = elIcon(e.type)
            return (
              <div
                key={e.id}
                className={'layer-row' + (selId === e.id ? ' on' : '')}
                onClick={() => selectById(e.id)}
              >
                <span className="ic">
                  <Ic size={14} />
                </span>
                <span className="lt">{elName(e)}</span>
                {e.type === 'text' && e.bind && <span className="dyn">dyn</span>}
                <span
                  className="layer-actions"
                  style={{ display: 'flex', gap: 2 }}
                  onClick={(ev) => ev.stopPropagation()}
                >
                  <button
                    className="btn btn-ghost btn-sm"
                    title="Avancer (vers l'avant)"
                    onClick={() => reorderById(e.id, 1)}
                  >
                    <I.chevD size={13} style={{ transform: 'rotate(180deg)' }} />
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    title="Reculer (vers l'arrière)"
                    onClick={() => reorderById(e.id, -1)}
                  >
                    <I.chevD size={13} />
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      </div>
      <div className="props-section" style={{ borderBottom: 0 }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-3)', lineHeight: 1.5 }}>
          Sélectionnez un élément sur le canvas pour le modifier (poignées pour
          redimensionner/pivoter), ou ajoutez-en depuis la barre d'outils.
        </p>
      </div>
    </>
  )
}

// ─── Panneau "propriétés élément" ───
function PropsElement({
  sel,
  patch,
  remove,
  reorder,
}: {
  sel: TemplateElement
  patch: (p: Partial<TemplateElement>) => void
  remove: () => void
  reorder: (dir: number) => void
}) {
  const isText = sel.type === 'text'
  const isShape = sel.type === 'rect' || sel.type === 'circle'
  const hasRadius = sel.type === 'rect' || sel.type === 'image'
  const title = {
    text: 'Texte',
    rect: 'Rectangle',
    circle: 'Cercle',
    logo: 'Logo',
    image: 'Zone produit',
  }[sel.type]
  const TIcon = { text: I.type, rect: I.square, circle: I.circle, logo: I.logo, image: I.image }[
    sel.type
  ]

  const NumField = ({ k, label }: { k: 'x' | 'y' | 'w' | 'h'; label: string }) => (
    <div>
      <span className="mini-lab">{label}</span>
      <input
        className="inp"
        type="number"
        value={Math.round(sel[k] || 0)}
        onChange={(e) =>
          patch({ [k]: parseFloat(e.target.value) || 0 } as Partial<TemplateElement>)
        }
      />
    </div>
  )

  return (
    <>
      <div className="props-head">
        <span className="t" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TIcon size={15} /> {title}
        </span>
        <div style={{ display: 'flex', gap: 2 }}>
          <button className="btn btn-ghost btn-sm" title="Avancer" onClick={() => reorder(1)}>
            <I.chevR size={14} style={{ transform: 'rotate(-90deg)' }} />
          </button>
          <button className="btn btn-ghost btn-sm" title="Reculer" onClick={() => reorder(-1)}>
            <I.chevR size={14} style={{ transform: 'rotate(90deg)' }} />
          </button>
        </div>
      </div>

      {isText && (
        <div className="props-section">
          <div className="lab">Contenu</div>
          <div className="field">
            <label>Source</label>
            <div className="seg-mini" style={{ width: '100%' }}>
              <button
                className={!sel.bind ? 'on' : ''}
                style={{ flex: 1 }}
                onClick={() => patch({ bind: null })}
              >
                Fixe
              </button>
              <button
                className={sel.bind ? 'on' : ''}
                style={{ flex: 1 }}
                onClick={() => patch({ bind: sel.bind || 'name' })}
              >
                Dynamique
              </button>
            </div>
          </div>
          {!sel.bind ? (
            <div className="field">
              <label>Texte</label>
              <textarea
                className="inp"
                value={sel.value || ''}
                onChange={(e) => patch({ value: e.target.value })}
              />
            </div>
          ) : (
            <div className="field">
              <label>Champ lié au produit</label>
              <select
                className="inp"
                value={sel.bind}
                onChange={(e) => patch({ bind: e.target.value as DynKey })}
              >
                {DYN_FIELDS.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </select>
              <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
                <label>Format du texte</label>
                <input
                  className="inp"
                  value={sel.pattern || ''}
                  placeholder="ex : Prix : {} FCFA"
                  onChange={(e) => patch({ pattern: e.target.value })}
                />
              </div>
              <p
                style={{
                  margin: '8px 0 0',
                  fontSize: 11,
                  color: 'var(--fg-3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <I.bind size={13} style={{ color: 'var(--fg-2)' }} /> {'{}'} est remplacé par la
                valeur du produit (laisser vide = valeur brute).
              </p>
            </div>
          )}
        </div>
      )}

      {isText && (
        <div className="props-section">
          <div className="lab">Typographie</div>
          <div className="field">
            <label>Taille · {sel.size}px</label>
            <input
              className="range"
              type="range"
              min="10"
              max="80"
              value={sel.size}
              onChange={(e) => patch({ size: parseInt(e.target.value) })}
            />
          </div>
          <div className="row2">
            <div className="field" style={{ margin: 0 }}>
              <span className="mini-lab">Graisse</span>
              <select
                className="inp"
                value={sel.weight}
                onChange={(e) => patch({ weight: parseInt(e.target.value) })}
              >
                <option value="400">Regular</option>
                <option value="500">Medium</option>
                <option value="600">Semibold</option>
                <option value="700">Bold</option>
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <span className="mini-lab">Alignement</span>
              <div className="align-group">
                <button
                  className={sel.align === 'left' ? 'on' : ''}
                  onClick={() => patch({ align: 'left' })}
                >
                  <I.align size={14} />
                </button>
                <button
                  className={sel.align === 'center' ? 'on' : ''}
                  onClick={() => patch({ align: 'center' })}
                >
                  <I.alignC size={14} />
                </button>
                <button
                  className={sel.align === 'right' ? 'on' : ''}
                  onClick={() => patch({ align: 'right' })}
                >
                  <I.alignR size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {(isText || isShape) && (
        <div className="props-section">
          <div className="lab">{isText ? 'Couleur du texte' : 'Remplissage'}</div>
          <div className="swatch-row">
            {sel.type === 'rect' && (
              <button
                className={'swatch tnone' + (sel.fill === 'none' ? ' on' : '')}
                title="Aucun"
                onClick={() => patch({ fill: 'none' })}
              />
            )}
            {SWATCHES.map((c) => {
              const cur = isText ? sel.color : sel.fill
              return (
                <button
                  key={c}
                  className={'swatch' + (cur === c ? ' on' : '')}
                  style={{ background: c }}
                  onClick={() => patch(isText ? { color: c } : { fill: c })}
                />
              )
            })}
          </div>
        </div>
      )}

      <div className="props-section">
        <div className="lab">Position &amp; taille</div>
        <div className="row2" style={{ marginBottom: 8 }}>
          <NumField k="x" label="X %" />
          <NumField k="y" label="Y %" />
        </div>
        <div className="row2">
          <NumField k="w" label="Largeur %" />
          {sel.type !== 'circle' && <NumField k="h" label="Hauteur %" />}
        </div>
        {hasRadius && (
          <div className="field" style={{ marginTop: 12 }}>
            <label>Arrondi · {sel.radius === 999 ? 'plein' : (sel.radius || 0) + 'px'}</label>
            <input
              className="range"
              type="range"
              min="0"
              max="60"
              value={sel.radius === 999 ? 60 : sel.radius || 0}
              onChange={(e) => {
                const v = parseInt(e.target.value)
                patch({ radius: v >= 60 ? 999 : v })
              }}
            />
          </div>
        )}
      </div>

      <div className="props-section" style={{ borderBottom: 0 }}>
        <button className="del-link" onClick={remove}>
          <I.trash size={14} /> Supprimer l'élément
        </button>
      </div>
    </>
  )
}
