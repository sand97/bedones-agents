/* Historique undo / redo de l'éditeur : snapshots du modèle % (elsRef), avec
   restauration via rebuild complet de la scène Fabric. */
import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type { TemplateElement } from '../../lib/types'

export function useEditorHistory({
  elsRef,
  buildScene,
  setSelId,
}: {
  elsRef: RefObject<TemplateElement[]>
  buildScene: () => void
  setSelId: (id: string | null) => void
}) {
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
  }, [elsRef])

  const restore = useCallback(
    (snap: TemplateElement[]) => {
      isRestoring.current = true
      elsRef.current = JSON.parse(JSON.stringify(snap)) as TemplateElement[]
      buildSceneRef.current()
      setSelId(null)
      isRestoring.current = false
    },
    [elsRef, setSelId],
  )

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

  return { pushHistory, undo, redo }
}
