import { useState } from 'react'
import { Modal, Input, Button, message } from 'antd'
import { ArrowLeft, Send, Sparkles, AlertTriangle } from 'lucide-react'
import { SocialSetup } from '@app/components/social/social-setup'
import { catalogApi, type Catalog } from '@app/lib/api/agent-api'
import {
  ProductCollectionPicker,
  type PickerEntity,
} from '@app/components/catalog/product-collection-picker'

interface ProductContextFlowModalProps {
  open: boolean
  catalog: Catalog
  onClose: () => void
  onSaved: () => void
}

type Step = 'pick' | 'chat'

interface AiProposal {
  hasConflict: boolean
  conflictReason: string
  suggestedContent: string
}

export function ProductContextFlowModal({
  open,
  catalog,
  onClose,
  onSaved,
}: ProductContextFlowModalProps) {
  const [step, setStep] = useState<Step>('pick')
  const [selected, setSelected] = useState<PickerEntity[]>([])
  const [prompt, setPrompt] = useState('')
  const [proposal, setProposal] = useState<AiProposal | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setStep('pick')
    setSelected([])
    setPrompt('')
    setProposal(null)
    setAnalyzing(false)
    setSaving(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleAnalyze = async () => {
    if (!prompt.trim()) return
    setAnalyzing(true)
    try {
      const productIds = selected.filter((s) => s.kind === 'product').map((s) => s.id)
      const collectionIds = selected.filter((s) => s.kind === 'collection').map((s) => s.id)
      const result = await catalogApi.analyzeContext(catalog.id, {
        prompt: prompt.trim(),
        productIds,
        collectionIds,
      })
      setProposal(result)
    } catch (e) {
      message.error((e as Error).message || "Échec de l'analyse")
    } finally {
      setAnalyzing(false)
    }
  }

  const handleSave = async () => {
    if (!proposal) return
    setSaving(true)
    try {
      const productIds = selected.filter((s) => s.kind === 'product').map((s) => s.id)
      const collectionIds = selected.filter((s) => s.kind === 'collection').map((s) => s.id)
      await catalogApi.saveContext(catalog.id, {
        content: proposal.suggestedContent,
        productIds,
        collectionIds,
      })
      message.success('Contexte enregistré')
      onSaved()
      handleClose()
    } catch (e) {
      message.error((e as Error).message || "Échec de l'enregistrement")
    } finally {
      setSaving(false)
    }
  }

  const handleEditProposal = (value: string) => {
    setProposal((prev) => (prev ? { ...prev, suggestedContent: value } : prev))
  }

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      destroyOnHidden
      width={560}
      styles={{ body: { padding: 0 } }}
      title={null}
      closable={false}
    >
      {step === 'pick' && (
        <ProductCollectionPicker
          catalog={catalog}
          selected={selected}
          onChange={setSelected}
          onNext={() => setStep('chat')}
        />
      )}

      {step === 'chat' && (
        <div className="flex flex-col" style={{ minHeight: 480 }}>
          <div className="p-4">
            <SocialSetup
              icon={<Sparkles size={28} strokeWidth={1.5} />}
              color="#111b21"
              title={`${selected.length} ${
                selected.length > 1 ? 'éléments sélectionnés' : 'élément sélectionné'
              }`}
              description="Quelle modification souhaitez-vous apporter au contexte des produits/collections sélectionnés ?"
            />
          </div>

          <div className="flex flex-col gap-3 p-4 flex-1 overflow-y-auto" style={{ maxHeight: 320 }}>
            {prompt && (
              <div className="px-[14px] py-3 rounded-xl bg-bg-subtle text-[13px] leading-[1.5] whitespace-pre-wrap" style={{ alignSelf: 'flex-end' }}>
                {prompt}
              </div>
            )}
            {analyzing && (
              <div className="px-[14px] py-3 rounded-xl bg-bg-subtle text-[13px] leading-[1.5] whitespace-pre-wrap text-text-muted">
                Analyse en cours…
              </div>
            )}
            {proposal && !analyzing && (
              <>
                {proposal.hasConflict && proposal.conflictReason && (
                  <div className="px-[14px] py-3 rounded-xl text-[13px] leading-[1.5] whitespace-pre-wrap bg-[#fff7e6] border border-[#ffd591]">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-sm mb-1">Incohérence détectée</div>
                        <div className="text-sm">{proposal.conflictReason}</div>
                      </div>
                    </div>
                  </div>
                )}
                <div className="px-[14px] py-3 rounded-xl bg-bg-subtle text-[13px] leading-[1.5] whitespace-pre-wrap">
                  <div className="text-xs text-text-muted mb-2">
                    Contexte proposé — vous pouvez l&apos;éditer avant d&apos;enregistrer
                  </div>
                  <Input.TextArea
                    autoSize={{ minRows: 4, maxRows: 12 }}
                    value={proposal.suggestedContent}
                    onChange={(e) => handleEditProposal(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 px-4 py-3 border-t border-border-default">
            <Button
              type="text"
              icon={<ArrowLeft size={16} />}
              onClick={() => setStep('pick')}
              aria-label="Retour à la sélection"
            />
            <Input.TextArea
              placeholder="Décrivez la modification…"
              autoSize={{ minRows: 1, maxRows: 4 }}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault()
                  if (proposal) handleSave()
                  else handleAnalyze()
                }
              }}
              disabled={analyzing || saving}
            />
            {proposal ? (
              <Button
                type="primary"
                onClick={handleSave}
                loading={saving}
                disabled={!proposal.suggestedContent.trim()}
              >
                Enregistrer
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<Send size={14} />}
                onClick={handleAnalyze}
                loading={analyzing}
                disabled={!prompt.trim()}
              >
                Envoyer
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
