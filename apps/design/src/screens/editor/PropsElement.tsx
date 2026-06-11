import { I } from '../../components/icons'
import { DYN_FIELDS } from '../../lib/data'
import type { DynKey, TemplateElement } from '../../lib/types'
import { SWATCHES } from './editor-helpers'

// ─── Panneau "propriétés élément" ───
export function PropsElement({
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
