/* =========================================================
   Aperçu & export — carrousel + miniatures + génération ZIP.
   ========================================================= */
import { useEffect, useRef, useState } from 'react'
import { I } from '../components/icons'
import { TemplateCanvas } from '../components/TemplateCanvas'
import { FORMATS, DYN_FIELDS } from '../lib/data'
import { exportZip } from '../lib/export'
import type { DynKey, SelectionItem, Template } from '../lib/types'

function useSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [s, setS] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const measure = () => {
      if (ref.current) {
        const r = ref.current.getBoundingClientRect()
        setS({ w: r.width, h: r.height })
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
  return [ref, s] as const
}

export function ExportPreview({
  template,
  selection,
  onDone,
}: {
  template: Template
  selection: SelectionItem[]
  onDone: () => void
}) {
  const [idx, setIdx] = useState(0)
  const [stageRef, stageSize] = useSize()
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState(false)

  const fmt = FORMATS[template.format]
  const aspect = fmt.w / fmt.h
  const cur = selection[idx]

  let cw = 0
  if (stageSize.w && stageSize.h) {
    cw = Math.min(stageSize.w - 140, (stageSize.h - 56) * aspect)
    cw = Math.max(140, cw)
  }

  const go = (d: number) => setIdx((i) => (i + d + selection.length) % selection.length)

  const usedBinds = [
    ...new Set(
      template.elements.filter((e) => e.type === 'text' && e.bind).map((e) => e.bind as DynKey),
    ),
  ]

  const dynValue = (b: DynKey): string => {
    const map: Record<DynKey, string> = {
      name: cur.product.name,
      desc: cur.product.desc,
      code: cur.product.code,
      price: cur.product.price,
    }
    return map[b]
  }

  const startExport = async () => {
    setExporting(true)
    setProgress(0)
    setDone(false)
    setError(false)
    try {
      const name = await exportZip(template, selection, (d, total) =>
        setProgress(Math.round((d / total) * 100)),
      )
      setFileName(name)
      setDone(true)
    } catch {
      setError(true)
    }
  }

  return (
    <div className="export">
      <div className="export-main">
        <div className="carousel" ref={stageRef}>
          <button className="nav" onClick={() => go(-1)} aria-label="Précédent">
            <I.chevL size={20} />
          </button>
          {cw > 0 && cur && (
            <div className="carousel-stage" style={{ width: cw, height: cw / aspect }}>
              <span className="carousel-counter">
                {idx + 1} / {selection.length}
              </span>
              <TemplateCanvas
                template={template}
                product={cur.product}
                width={cw}
                tone={cur.img.tone}
                imageUrl={cur.img.url}
              />
            </div>
          )}
          <button className="nav" onClick={() => go(1)} aria-label="Suivant">
            <I.chevR size={20} />
          </button>
        </div>

        <div className="thumb-strip">
          {selection.map((s, i) => {
            const tw = Math.max(40, Math.min(54 * aspect, 110))
            return (
              <button
                key={s.img.id + i}
                className={'thumb' + (i === idx ? ' on' : '')}
                onClick={() => setIdx(i)}
                style={{ width: tw }}
              >
                <TemplateCanvas
                  template={template}
                  product={s.product}
                  width={tw}
                  tone={s.img.tone}
                  imageUrl={s.img.url}
                />
              </button>
            )
          })}
        </div>
      </div>

      <div className="export-side">
        <div className="head">
          <h3>Aperçu de l'export</h3>
          <p>
            {selection.length} image{selection.length > 1 ? 's' : ''} prête
            {selection.length > 1 ? 's' : ''} à générer
          </p>
        </div>

        <div className="sec">
          <div className="lab">Sortie</div>
          <div className="kv">
            <span className="k">Template</span>
            <span className="v">{template.name}</span>
          </div>
          <div className="kv">
            <span className="k">Format</span>
            <span className="v">
              {template.format} · {fmt.label}
            </span>
          </div>
          <div className="kv">
            <span className="k">Dimensions</span>
            <span
              className="v"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'nowrap' }}
            >
              {fmt.sub}
            </span>
          </div>
          <div className="kv">
            <span className="k">Fichiers</span>
            <span className="v">{selection.length} × PNG</span>
          </div>
        </div>

        {usedBinds.length > 0 && (
          <div className="sec">
            <div className="lab">Champs dynamiques — image {idx + 1}</div>
            <div className="dyn-map">
              {usedBinds.map((b) => {
                const f = DYN_FIELDS.find((d) => d.key === b)
                return (
                  <div className="item" key={b}>
                    <span className="badge">{f ? f.label : b}</span>
                    <span className="val">{dynValue(b)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="sec">
          <div className="lab">Produit courant</div>
          <div className="kv">
            <span className="k">Nom</span>
            <span className="v" style={{ maxWidth: 170 }}>
              {cur.product.name}
            </span>
          </div>
          <div className="kv">
            <span className="k">Code</span>
            <span className="v" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              {cur.product.code}
            </span>
          </div>
          <div className="kv">
            <span className="k">Prix</span>
            <span className="v">{cur.product.price}</span>
          </div>
        </div>

        <div className="foot">
          <button
            className="btn btn-primary btn-lg"
            style={{ width: '100%' }}
            onClick={startExport}
          >
            <I.zip size={16} /> Générer le ZIP · {selection.length}
          </button>
          <p
            style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--fg-3)', textAlign: 'center' }}
          >
            Un fichier .zip contenant {selection.length} image{selection.length > 1 ? 's' : ''} PNG
            nommées par code marchand.
          </p>
        </div>
      </div>

      {exporting && (
        <div className="overlay">
          <div className="modal">
            <div className="m-body">
              <div className="m-icon">{done ? <I.check size={26} /> : <I.zip size={26} />}</div>
              {error ? (
                <>
                  <h3>Échec de la génération</h3>
                  <p>
                    Impossible de composer certaines images. Les images distantes doivent autoriser
                    le CORS pour être exportées.
                  </p>
                </>
              ) : !done ? (
                <>
                  <h3>Génération en cours…</h3>
                  <p>
                    Application de « {template.name} » sur {selection.length} image
                    {selection.length > 1 ? 's' : ''}.
                  </p>
                  <div className="progress">
                    <i style={{ width: progress + '%' }} />
                  </div>
                  <p style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {progress}%
                  </p>
                </>
              ) : (
                <>
                  <h3>ZIP généré</h3>
                  <p>
                    <b>{fileName}</b>
                    <br />
                    {selection.length} image{selection.length > 1 ? 's' : ''} · {fmt.sub} · PNG
                  </p>
                </>
              )}
            </div>
            <div className="m-foot">
              {error ? (
                <button
                  className="btn btn-outline"
                  style={{ flex: 1 }}
                  onClick={() => setExporting(false)}
                >
                  Fermer
                </button>
              ) : !done ? (
                <button
                  className="btn btn-outline"
                  style={{ flex: 1 }}
                  onClick={() => setExporting(false)}
                >
                  Annuler
                </button>
              ) : (
                <>
                  <button className="btn btn-outline" onClick={() => setExporting(false)}>
                    Fermer
                  </button>
                  <button className="btn btn-primary" onClick={onDone}>
                    <I.check size={16} /> Terminer
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
