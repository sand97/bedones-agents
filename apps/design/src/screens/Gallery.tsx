/* =========================================================
   Galerie des templates — point d'entrée depuis le catalogue.
   ========================================================= */
import { useState } from 'react'
import { I } from '../components/icons'
import { TemplateCanvas } from '../components/TemplateCanvas'
import { FORMATS } from '../lib/data'
import type { Product, Template } from '../lib/types'

function GalleryThumb({ tpl, sample }: { tpl: Template; sample: Product | null }) {
  const fmt = FORMATS[tpl.format]
  const isWide = fmt.w / fmt.h > 1.2
  const isTall = fmt.h / fmt.w > 1.3
  const w = isTall ? 124 : isWide ? 230 : 168
  const img = sample?.images.find((i) => i.url)?.url
  return (
    <div className="tpl-thumb">
      <span className="tpl-fmt-badge">
        {tpl.format} · {fmt.label}
      </span>
      <TemplateCanvas
        template={tpl}
        product={sample}
        width={w}
        tone="light"
        imageUrl={img}
        style={{ borderRadius: 3, boxShadow: '0 4px 18px rgba(0,0,0,0.14)' }}
      />
    </div>
  )
}

export function Gallery({
  templates,
  sample,
  onUse,
  onEdit,
  onNew,
}: {
  templates: Template[]
  sample: Product | null
  onUse: (tpl: Template) => void
  onEdit: (tpl: Template) => void
  onNew: () => void
}) {
  const [q, setQ] = useState('')
  const list = templates.filter((t) => t.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="gallery">
      <div className="gallery-inner">
        <div className="gallery-head">
          <div>
            <div className="eyebrow">Catalogue · Studio images</div>
            <h1>Templates d'images</h1>
            <p>
              Créez des habillages réutilisables aux formats réseaux sociaux, puis appliquez-les en
              lot aux images de votre catalogue.
            </p>
          </div>
          <button className="btn btn-primary btn-lg" onClick={onNew}>
            <I.plus size={16} /> Nouveau template
          </button>
        </div>

        <div className="gallery-toolbar">
          <div className="search-box">
            <I.search size={16} />
            <input
              placeholder="Rechercher un template…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>
            {list.length} template{list.length > 1 ? 's' : ''}
          </span>
        </div>

        <div className="tpl-grid">
          <button className="tpl-new" onClick={onNew}>
            <span className="plus-circle">
              <I.plus size={20} />
            </span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Créer un template</span>
          </button>

          {list.map((tpl) => (
            <div className="tpl-card" key={tpl.id} onClick={() => onUse(tpl)}>
              <GalleryThumb tpl={tpl} sample={sample} />
              <div className="tpl-meta">
                <div className="name">{tpl.name}</div>
                <div className="sub">
                  <span>{tpl.elements.length} éléments</span>
                  <span style={{ color: 'var(--fg-4)' }}>·</span>
                  <span>{tpl.uses} utilisations</span>
                </div>
                <div className="sub" style={{ marginTop: 2 }}>
                  Modifié {tpl.edited}
                </div>
              </div>
              <div className="tpl-actions" onClick={(e) => e.stopPropagation()}>
                <button className="btn btn-outline btn-sm" onClick={() => onEdit(tpl)}>
                  <I.sliders size={14} /> Modifier
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => onUse(tpl)}>
                  Utiliser <I.arrowR size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
