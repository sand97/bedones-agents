/* =========================================================
   Sélection des images — par collection, ligne par produit,
   avec recherche et sélection multiple.
   ========================================================= */
import { useMemo, useState } from 'react'
import { I } from '../components/icons'
import { ProductImage } from '../components/TemplateCanvas'
import type { Collection, SelectionItem, Template } from '../lib/types'

export function ImagePicker({
  template,
  collections,
  onContinue,
}: {
  template: Template
  collections: Collection[]
  onContinue: (selection: SelectionItem[]) => void
}) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<string>>(() => new Set())
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())

  const ql = q.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      collections
        .map((c) => ({
          ...c,
          products: c.products.filter(
            (p) =>
              !ql ||
              p.name.toLowerCase().includes(ql) ||
              p.code.toLowerCase().includes(ql) ||
              c.name.toLowerCase().includes(ql),
          ),
        }))
        .filter((c) => c.products.length > 0),
    [collections, ql],
  )

  const toggle = (id: string) =>
    setSel((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const selectMany = (ids: string[], on: boolean) =>
    setSel((prev) => {
      const n = new Set(prev)
      ids.forEach((i) => (on ? n.add(i) : n.delete(i)))
      return n
    })
  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const totalSel = sel.size

  const buildSelection = (): SelectionItem[] => {
    const out: SelectionItem[] = []
    collections.forEach((c) =>
      c.products.forEach((p) =>
        p.images.forEach((img) => {
          if (sel.has(img.id)) out.push({ product: p, img })
        }),
      ),
    )
    return out
  }

  return (
    <div className="picker">
      <div className="picker-sub">
        <div className="using">
          <span>Habillage&nbsp;:</span>
          <span className="chip">
            <I.layers size={14} /> {template.name}{' '}
            <span style={{ color: 'var(--fg-3)', fontWeight: 400 }}>· {template.format}</span>
          </span>
        </div>
        <div className="search-box" style={{ maxWidth: 320 }}>
          <I.search size={16} />
          <input
            placeholder="Rechercher un produit, un code…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--fg-3)' }}>
          {filtered.reduce((a, c) => a + c.products.length, 0)} produits
        </div>
      </div>

      <div className="picker-body">
        <div className="picker-inner">
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--fg-3)' }}>
              <div style={{ marginBottom: 10 }}>
                <I.search size={28} />
              </div>
              Aucun produit ne correspond à « {q} ».
            </div>
          )}
          {filtered.map((c) => {
            const allIds = c.products.flatMap((p) => p.images.map((i) => i.id))
            const selCount = allIds.filter((id) => sel.has(id)).length
            const allOn = selCount === allIds.length && allIds.length > 0
            const isCol = collapsed.has(c.id)
            return (
              <div className="col-block" key={c.id}>
                <div className="col-head">
                  <button className="chev" onClick={() => toggleCollapse(c.id)}>
                    <I.chevD
                      size={16}
                      style={{
                        transform: isCol ? 'rotate(-90deg)' : 'none',
                        transition: 'transform .15s',
                      }}
                    />
                  </button>
                  <span
                    className="col-head-folder"
                    style={{ color: 'var(--fg-3)', display: 'flex' }}
                  >
                    <I.folder size={16} />
                  </span>
                  <span className="ct">{c.name}</span>
                  <span className="cc">
                    · {c.products.length} produits · {allIds.length} images
                  </span>
                  <span className="selall">
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => selectMany(allIds, !allOn)}
                    >
                      {allOn
                        ? 'Tout désélectionner'
                        : `Tout sélectionner${selCount ? ` (${selCount}/${allIds.length})` : ''}`}
                    </button>
                  </span>
                </div>

                {!isCol &&
                  c.products.map((p) => {
                    const pIds = p.images.map((i) => i.id)
                    const pSel = pIds.filter((id) => sel.has(id)).length
                    const pAll = pSel === pIds.length
                    return (
                      <div className="product-row" key={p.id}>
                        <div className="product-info">
                          <div className="pn">{p.name}</div>
                          <div className="pc">{p.code}</div>
                          <div className="pp">{p.price}</div>
                          <div className="pcount">
                            {pSel ? (
                              <span style={{ color: 'var(--fg-1)', fontWeight: 600 }}>
                                {pSel} sélectionnée{pSel > 1 ? 's' : ''}
                              </span>
                            ) : (
                              `${p.images.length} images`
                            )}
                            {' · '}
                            <button
                              style={{
                                color: 'var(--fg-2)',
                                textDecoration: 'underline',
                                textUnderlineOffset: 2,
                              }}
                              onClick={() => selectMany(pIds, !pAll)}
                            >
                              {pAll ? 'retirer' : 'tout'}
                            </button>
                          </div>
                        </div>
                        <div className="img-strip">
                          {p.images.map((img) => {
                            const on = sel.has(img.id)
                            return (
                              <button
                                key={img.id}
                                className={'img-tile' + (on ? ' sel' : '')}
                                onClick={() => toggle(img.id)}
                              >
                                {img.url ? (
                                  <img
                                    src={img.url}
                                    alt={p.name}
                                    style={{
                                      position: 'absolute',
                                      inset: 0,
                                      width: '100%',
                                      height: '100%',
                                      objectFit: 'cover',
                                    }}
                                  />
                                ) : (
                                  <ProductImage product={p} tone={img.tone || 'light'} />
                                )}
                                <span className="img-check">
                                  <I.check size={13} />
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
              </div>
            )
          })}
        </div>
      </div>

      <div className="picker-foot">
        <div className="count">
          <b>{totalSel}</b> image{totalSel > 1 ? 's' : ''} sélectionnée{totalSel > 1 ? 's' : ''}
        </div>
        <div style={{ flex: 1 }} />
        {totalSel > 0 && (
          <button className="btn btn-ghost" onClick={() => setSel(new Set())}>
            Réinitialiser
          </button>
        )}
        <button
          className="btn btn-primary btn-lg"
          disabled={totalSel === 0}
          onClick={() => onContinue(buildSelection())}
        >
          Aperçu &amp; export <I.arrowR size={16} />
        </button>
      </div>
    </div>
  )
}
