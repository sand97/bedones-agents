import type { FC } from 'react'
import { I, type IconProps } from '../../components/icons'
import type { ElementType, FormatKey, TemplateElement } from '../../lib/types'

// ─── Panneau "réglages template" ───
export function PropsTemplate({
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
