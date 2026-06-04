/* =========================================================
   Studio images catalogue — coquille plein écran.
   App bar + fil d'ariane + machine à états (galerie → éditeur
   → sélection → aperçu/export). Charge le catalogue réel via le
   cookie de session, repli sur la démo sinon.
   ========================================================= */
import { useEffect, useRef, useState } from 'react'
import { I } from './components/icons'
import { Gallery } from './screens/Gallery'
import { Editor, type EditorHandle } from './screens/Editor'
import { ImagePicker } from './screens/ImagePicker'
import { ExportPreview } from './screens/ExportPreview'
import { blankTemplate } from './lib/data'
import { getParams, loadCatalogOrDemo, loadTemplates, persistTemplates } from './lib/api'
import type { Collection, SelectionItem, Template } from './lib/types'

const NEW_ACCENT = '#f5c518'

type Screen = 'gallery' | 'editor' | 'picker' | 'export'

export default function App() {
  const params = useRef(getParams()).current
  const [screen, setScreen] = useState<Screen>('gallery')
  const [templates, setTemplates] = useState<Template[]>(() => loadTemplates(params.catalogId))
  const [active, setActive] = useState<Template | null>(null)
  const [selection, setSelection] = useState<SelectionItem[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [isDemo, setIsDemo] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const editorApi = useRef<EditorHandle | null>(null)

  // Charge le catalogue (réel ou démo) au montage.
  useEffect(() => {
    let cancelled = false
    loadCatalogOrDemo(params.catalogId).then(({ collections, isDemo }) => {
      if (cancelled) return
      setCollections(collections)
      setIsDemo(isDemo)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [params.catalogId])

  // Persiste les templates à chaque changement.
  useEffect(() => {
    persistTemplates(params.catalogId, templates)
  }, [params.catalogId, templates])

  const sample = collections[0]?.products[0] || null

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  const goGallery = () => {
    setScreen('gallery')
    setActive(null)
  }
  const openEditor = (tpl: Template) => {
    setActive(tpl)
    setScreen('editor')
  }
  const openNew = () => {
    setActive(blankTemplate(NEW_ACCENT))
    setScreen('editor')
  }
  const openPicker = (tpl: Template) => {
    setActive(tpl)
    setSelection([])
    setScreen('picker')
  }

  const upsert = (tpl: Template) =>
    setTemplates((prev) => {
      const exists = prev.some((x) => x.id === tpl.id)
      const stamped = { ...tpl, edited: "à l'instant" }
      return exists ? prev.map((x) => (x.id === tpl.id ? stamped : x)) : [stamped, ...prev]
    })

  const saveTemplate = (stayInEditor: boolean) => {
    const tpl = editorApi.current?.getTemplate() ?? active
    if (!tpl) return
    upsert(tpl)
    setActive(tpl)
    showToast('Template enregistré')
    if (!stayInEditor) goGallery()
  }
  const saveAndUse = () => {
    const tpl = editorApi.current?.getTemplate() ?? active
    if (!tpl) return
    upsert(tpl)
    openPicker(tpl)
  }

  // ── App bar pieces ──
  const Sep = () => <I.chevR size={13} className="sep" />
  function Crumbs() {
    if (screen === 'gallery')
      return (
        <div className="crumbs">
          <span className="crumb-link hide-sm">Catalogue</span>
          <Sep />
          <span className="here">Studio images</span>
        </div>
      )
    if (screen === 'editor' && active)
      return (
        <div className="crumbs">
          <button className="crumb-link" onClick={goGallery}>
            Studio images
          </button>
          <Sep />
          <span className="here">
            {active.uses === 0 && active.name === 'Template sans titre'
              ? 'Nouveau template'
              : 'Modifier le template'}
          </span>
        </div>
      )
    if (screen === 'picker')
      return (
        <div className="crumbs">
          <button className="crumb-link" onClick={goGallery}>
            Studio images
          </button>
          <Sep />
          <span className="here">Choisir les images</span>
        </div>
      )
    return (
      <div className="crumbs">
        <button className="crumb-link" onClick={goGallery}>
          Studio images
        </button>
        <Sep />
        <button className="crumb-link" onClick={() => setScreen('picker')}>
          Images
        </button>
        <Sep />
        <span className="here">Aperçu &amp; export</span>
      </div>
    )
  }

  function Actions() {
    if (screen === 'editor')
      return (
        <>
          <button className="btn btn-outline" onClick={() => saveTemplate(false)}>
            <I.check size={15} /> Enregistrer
          </button>
          <button className="btn btn-primary" onClick={saveAndUse}>
            Utiliser <I.arrowR size={15} />
          </button>
        </>
      )
    if (screen === 'picker' && active)
      return (
        <button className="btn btn-outline" onClick={() => openEditor(active)}>
          <I.sliders size={15} /> Modifier l'habillage
        </button>
      )
    if (screen === 'export')
      return (
        <button className="btn btn-outline" onClick={() => setScreen('picker')}>
          <I.arrowL size={15} /> Retour aux images
        </button>
      )
    return null
  }

  return (
    <div className="editor-app">
      <div className="appbar">
        <div className="mark">B</div>
        <Crumbs />
        {isDemo && (
          <span className="bd-badge bd-badge-dev" style={{ marginLeft: 4 }}>
            Démo
          </span>
        )}
        <div className="spacer" />
        <Actions />
        <button className="close" title="Fermer le studio" onClick={goGallery}>
          <I.x size={18} />
        </button>
      </div>

      {loading ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--fg-3)',
          }}
        >
          Chargement du catalogue…
        </div>
      ) : (
        <>
          {screen === 'gallery' && (
            <Gallery
              templates={templates}
              sample={sample}
              onUse={openPicker}
              onEdit={openEditor}
              onNew={openNew}
            />
          )}
          {screen === 'editor' && active && (
            <Editor key={active.id} template={active} sample={sample} apiRef={editorApi} />
          )}
          {screen === 'picker' && active && (
            <ImagePicker
              template={active}
              collections={collections}
              onContinue={(sel) => {
                setSelection(sel)
                setScreen('export')
              }}
            />
          )}
          {screen === 'export' && active && selection.length > 0 && (
            <ExportPreview
              template={active}
              selection={selection}
              onDone={() => {
                showToast('Export terminé')
                goGallery()
              }}
            />
          )}
        </>
      )}

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--bd-black)',
            color: '#fff',
            padding: '11px 18px',
            borderRadius: 99,
            fontSize: 13,
            fontWeight: 500,
            boxShadow: 'var(--shadow-popover)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <I.check size={15} /> {toast}
        </div>
      )}
    </div>
  )
}
