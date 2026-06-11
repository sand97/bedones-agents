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
import { Canvas, Ellipse, FabricImage, Rect, Textbox } from 'fabric'
import { initAligningGuidelines } from 'fabric/extensions'
import { I, type IconProps } from '../components/icons'
import { FORMATS, FORMAT_KEYS, DYN_FIELDS, TONE } from '../lib/data'
import { resolveText } from '../components/TemplateCanvas'
import {
  CONTROL,
  TONES,
  asEl,
  getMeta,
  newEl,
  sampleProduct,
  setMeta,
  useSize,
} from './editor/editor-helpers'
import { useObjectMapper } from './editor/use-object-mapper'
import { useEditorHistory } from './editor/use-editor-history'
import { PropsElement } from './editor/PropsElement'
import { PropsTemplate } from './editor/PropsTemplate'
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

  const { pxX, pxY, buildObject, readObject } = useObjectMapper({
    dims,
    template,
    sample,
    sampleImg,
    tone,
    cw,
    ch,
    fontScale,
  })

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

  const { pushHistory, undo, redo } = useEditorHistory({ elsRef, buildScene, setSelId })

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
    const stopGuides = initAligningGuidelines(canvas, { color: '#111b21', width: 1, margin: 5 })

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
      stopGuides()
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
