/* =========================================================
   Éditeur de template : tool-rail + canvas + propriétés.
   Sélection, glisser, édition live des propriétés (texte,
   couleur, taille, position), calques.
   ========================================================= */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FC,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { I, type IconProps } from '../components/icons'
import { TemplateCanvas } from '../components/TemplateCanvas'
import { FORMATS, FORMAT_KEYS, DYN_FIELDS, TONE } from '../lib/data'
import type {
  ElementType,
  FormatKey,
  Product,
  Template,
  TemplateElement,
  ToneKey,
} from '../lib/types'

export interface EditorHandle {
  getTemplate: () => Template
}

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

let uidCounter = 1000
function newEl(type: ElementType): TemplateElement {
  uidCounter += 1
  const id = 'n' + uidCounter
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

interface DragState {
  id: string
  startX: number
  startY: number
  ox: number
  oy: number
  cw: number
  ch: number
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
  const [els, setEls] = useState<TemplateElement[]>(() => template.elements.map((e) => ({ ...e })))
  const [selId, setSelId] = useState<string | null>(null)
  const [tone, setTone] = useState<ToneKey>('light')
  const [panelW, setPanelW] = useState(340)
  const [stageRef, stageSize] = useSize()
  const dragRef = useRef<DragState | null>(null)

  const fmt = FORMATS[format]
  const aspect = fmt.w / fmt.h
  const sampleImg = sample?.images.find((i) => i.url)?.url

  const margin = 120
  let cw = 0
  if (stageSize.w && stageSize.h) {
    cw = Math.min(stageSize.w - margin, (stageSize.h - margin) * aspect)
    cw = Math.max(160, cw)
  }
  const sel = els.find((e) => e.id === selId) || null

  const update = (id: string, patch: Partial<TemplateElement>) =>
    setEls((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  const addEl = (type: ElementType) => {
    const e = newEl(type)
    setEls((prev) => [...prev, e])
    setSelId(e.id)
  }
  const removeEl = (id: string) => {
    setEls((prev) => prev.filter((e) => e.id !== id))
    if (selId === id) setSelId(null)
  }
  const dupEl = (id: string) => {
    const e = els.find((x) => x.id === id)
    if (!e) return
    uidCounter += 1
    const ne: TemplateElement = {
      ...e,
      id: 'n' + uidCounter,
      x: Math.min(e.x + 4, 90),
      y: Math.min(e.y + 4, 90),
    }
    setEls((prev) => [...prev, ne])
    setSelId(ne.id)
  }
  const reorder = (id: string, dir: number) =>
    setEls((prev) => {
      const i = prev.findIndex((e) => e.id === id)
      if (i < 0) return prev
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const [m] = next.splice(i, 1)
      next.splice(j, 0, m)
      return next
    })

  // drag
  const onDragMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const dx = ((e.clientX - d.startX) / d.cw) * 100
    const dy = ((e.clientY - d.startY) / d.ch) * 100
    setEls((prev) =>
      prev.map((el) =>
        el.id === d.id
          ? { ...el, x: Math.round((d.ox + dx) * 10) / 10, y: Math.round((d.oy + dy) * 10) / 10 }
          : el,
      ),
    )
  }, [])
  const onDragEnd = useCallback(() => {
    dragRef.current = null
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragEnd)
  }, [onDragMove])
  const startDrag = (e: ReactPointerEvent<HTMLDivElement>, id: string) => {
    e.preventDefault()
    setSelId(id)
    const el = els.find((x) => x.id === id)
    if (!el) return
    const wrap = e.currentTarget.closest('.canvas-wrap')
    if (!wrap) return
    const cv = wrap.getBoundingClientRect()
    dragRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      ox: el.x,
      oy: el.y,
      cw: cv.width,
      ch: cv.height,
    }
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragEnd)
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

  const liveTpl: Template = { ...template, name, format, elements: els }
  apiRef.current = {
    getTemplate: () => ({ ...template, name, format, elements: els.map((e) => ({ ...e })) }),
  }

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
      {/* tool rail */}
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
          onClick={() => {
            const e = newEl('text')
            e.bind = 'price'
            e.value = '10 000 FCFA'
            setEls((p) => [...p, e])
            setSelId(e.id)
          }}
          title="Champ dynamique"
        >
          <I.tag size={18} stroke={1.6} />
          <span>Champ</span>
        </button>
      </div>

      {/* canvas stage */}
      <div
        className="editor-stage"
        ref={stageRef}
        onPointerDown={(e) => {
          const cl = (e.target as HTMLElement).classList
          if (cl.contains('editor-stage') || cl.contains('canvas-overlay-handles')) setSelId(null)
        }}
      >
        <div className="editor-stage-bar">
          <div className="seg">
            {FORMAT_KEYS.map((k) => (
              <button
                key={k}
                className={format === k ? 'on' : ''}
                onClick={() => setFormat(k)}
                title={FORMATS[k].label + ' · ' + FORMATS[k].sub}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        {cw > 0 && (
          <div className="canvas-wrap" style={{ width: cw, height: cw / aspect }}>
            <TemplateCanvas
              template={liveTpl}
              product={sample}
              width={cw}
              tone={tone}
              imageUrl={sampleImg}
            />
            <div className="canvas-overlay-handles">
              {els.map((e) => (
                <div
                  key={e.id}
                  className="el-hit"
                  style={{
                    left: e.x + '%',
                    top: e.y + '%',
                    width: e.w + '%',
                    height: (e.type === 'circle' ? e.w * aspect : e.h) + '%',
                    pointerEvents: 'auto',
                  }}
                  onPointerDown={(ev) => startDrag(ev, e.id)}
                />
              ))}
              {sel &&
                (() => {
                  const sh = sel.type === 'circle' ? sel.w * aspect : sel.h
                  return (
                    <div
                      className="el-outline sel"
                      style={{
                        left: sel.x + '%',
                        top: sel.y + '%',
                        width: sel.w + '%',
                        height: sh + '%',
                      }}
                    >
                      <span className="handle nw" />
                      <span className="handle ne" />
                      <span className="handle sw" />
                      <span className="handle se" />
                    </div>
                  )
                })()}
            </div>
          </div>
        )}

        <div className="stage-img-switch">
          <span>Image d'exemple</span>
          <div className="swatches">
            {TONES.map((tn) => (
              <button
                key={tn}
                className={'sw' + (tone === tn ? ' on' : '')}
                onClick={() => setTone(tn)}
                title={tn}
              >
                <span style={{ position: 'absolute', inset: 0, background: TONE[tn].bg }} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* resizer */}
      <div className="resizer" onPointerDown={startResize} />

      {/* properties */}
      <div className="editor-props">
        {!sel && (
          <PropsTemplate
            name={name}
            setName={setName}
            els={els}
            selId={selId}
            setSelId={setSelId}
            elIcon={elIcon}
            elName={elName}
            fmt={fmt}
            format={format}
          />
        )}
        {sel && (
          <PropsElement
            sel={sel}
            update={update}
            removeEl={removeEl}
            dupEl={dupEl}
            reorder={reorder}
          />
        )}
      </div>
    </div>
  )
}

// ─── Panneau "réglages template" ───────────────────────────
function PropsTemplate({
  name,
  setName,
  els,
  selId,
  setSelId,
  elIcon,
  elName,
  fmt,
  format,
}: {
  name: string
  setName: (v: string) => void
  els: TemplateElement[]
  selId: string | null
  setSelId: (id: string) => void
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
                onClick={() => setSelId(e.id)}
              >
                <span className="ic">
                  <Ic size={14} />
                </span>
                <span className="lt">{elName(e)}</span>
                {e.type === 'text' && e.bind && <span className="dyn">dyn</span>}
              </div>
            )
          })}
        </div>
      </div>
      <div className="props-section" style={{ borderBottom: 0 }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-3)', lineHeight: 1.5 }}>
          Sélectionnez un élément sur le canvas pour modifier ses propriétés, ou ajoutez-en depuis
          la barre d'outils.
        </p>
      </div>
    </>
  )
}

// ─── Panneau "propriétés élément" ──────────────────────────
function PropsElement({
  sel,
  update,
  removeEl,
  dupEl,
  reorder,
}: {
  sel: TemplateElement
  update: (id: string, patch: Partial<TemplateElement>) => void
  removeEl: (id: string) => void
  dupEl: (id: string) => void
  reorder: (id: string, dir: number) => void
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
          update(sel.id, { [k]: parseFloat(e.target.value) || 0 } as Partial<TemplateElement>)
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
          <button
            className="btn btn-ghost btn-sm"
            title="Avancer"
            onClick={() => reorder(sel.id, 1)}
          >
            <I.chevR size={14} style={{ transform: 'rotate(-90deg)' }} />
          </button>
          <button
            className="btn btn-ghost btn-sm"
            title="Reculer"
            onClick={() => reorder(sel.id, -1)}
          >
            <I.chevR size={14} style={{ transform: 'rotate(90deg)' }} />
          </button>
          <button className="btn btn-ghost btn-sm" title="Dupliquer" onClick={() => dupEl(sel.id)}>
            <I.copy size={14} />
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
                onClick={() => update(sel.id, { bind: null })}
              >
                Fixe
              </button>
              <button
                className={sel.bind ? 'on' : ''}
                style={{ flex: 1 }}
                onClick={() => update(sel.id, { bind: sel.bind || 'name' })}
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
                onChange={(e) => update(sel.id, { value: e.target.value })}
              />
            </div>
          ) : (
            <div className="field">
              <label>Champ lié au produit</label>
              <select
                className="inp"
                value={sel.bind}
                onChange={(e) =>
                  update(sel.id, { bind: e.target.value as TemplateElement['bind'] })
                }
              >
                {DYN_FIELDS.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </select>
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
                <I.bind size={13} style={{ color: 'var(--info)' }} /> Rempli automatiquement pour
                chaque produit.
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
              onChange={(e) => update(sel.id, { size: parseInt(e.target.value) })}
            />
          </div>
          <div className="row2">
            <div className="field" style={{ margin: 0 }}>
              <span className="mini-lab">Graisse</span>
              <select
                className="inp"
                value={sel.weight}
                onChange={(e) => update(sel.id, { weight: parseInt(e.target.value) })}
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
                  onClick={() => update(sel.id, { align: 'left' })}
                >
                  <I.align size={14} />
                </button>
                <button
                  className={sel.align === 'center' ? 'on' : ''}
                  onClick={() => update(sel.id, { align: 'center' })}
                >
                  <I.alignC size={14} />
                </button>
                <button
                  className={sel.align === 'right' ? 'on' : ''}
                  onClick={() => update(sel.id, { align: 'right' })}
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
            {isShape && sel.type === 'rect' && (
              <button
                className={'swatch tnone' + (sel.fill === 'none' ? ' on' : '')}
                title="Aucun"
                onClick={() => update(sel.id, { fill: 'none' })}
              />
            )}
            {SWATCHES.map((c) => {
              const cur = isText ? sel.color : sel.fill
              return (
                <button
                  key={c}
                  className={'swatch' + (cur === c ? ' on' : '')}
                  style={{ background: c }}
                  onClick={() => update(sel.id, isText ? { color: c } : { fill: c })}
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
                update(sel.id, { radius: v >= 60 ? 999 : v })
              }}
            />
          </div>
        )}
      </div>

      <div className="props-section" style={{ borderBottom: 0 }}>
        <button className="del-link" onClick={() => removeEl(sel.id)}>
          <I.trash size={14} /> Supprimer l'élément
        </button>
      </div>
    </>
  )
}
