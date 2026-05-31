import { useState } from 'react'
import { Modal, Input, Button, message } from 'antd'
import { ArrowLeft, Send, Sparkles, AlertTriangle, Check } from 'lucide-react'
import { SocialSetup } from '@app/components/social/social-setup'
import { MarkdownContent } from '@app/components/shared/markdown-content'
import { catalogApi, type Catalog, type Collection, type Product } from '@app/lib/api/agent-api'
import {
  ProductCollectionPicker,
  type PickerEntity,
} from '@app/components/catalog/product-collection-picker'

interface ProductContextFlowModalProps {
  open: boolean
  catalog: Catalog
  onClose: () => void
  onSaved: () => void
  placeholderProducts?: Product[]
  placeholderCollections?: Collection[]
}

type Step = 'pick' | 'chat'

interface AiProposal {
  hasConflict: boolean
  conflictReason: string
  suggestedContent: string
}

type ChatMessage =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'ai'; proposal: AiProposal; saved?: boolean }

export function ProductContextFlowModal({
  open,
  catalog,
  onClose,
  onSaved,
  placeholderProducts,
  placeholderCollections,
}: ProductContextFlowModalProps) {
  const [step, setStep] = useState<Step>('pick')
  const [selected, setSelected] = useState<PickerEntity[]>([])
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [savingMessageId, setSavingMessageId] = useState<string | null>(null)

  const reset = () => {
    setStep('pick')
    setSelected([])
    setDraft('')
    setMessages([])
    setAnalyzing(false)
    setSavingMessageId(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSend = async () => {
    const text = draft.trim()
    if (!text || analyzing) return
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', text }
    setMessages((prev) => [...prev, userMsg])
    setDraft('')
    setAnalyzing(true)
    try {
      const productIds = selected.filter((s) => s.kind === 'product').map((s) => s.id)
      const collectionIds = selected.filter((s) => s.kind === 'collection').map((s) => s.id)
      const result = await catalogApi.analyzeContext(catalog.id, {
        prompt: text,
        productIds,
        collectionIds,
      })
      setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: 'ai', proposal: result }])
    } catch (e) {
      message.error((e as Error).message || "Échec de l'analyse")
    } finally {
      setAnalyzing(false)
    }
  }

  const handleSaveProposal = async (msgId: string, content: string) => {
    setSavingMessageId(msgId)
    try {
      const productIds = selected.filter((s) => s.kind === 'product').map((s) => s.id)
      const collectionIds = selected.filter((s) => s.kind === 'collection').map((s) => s.id)
      await catalogApi.saveContext(catalog.id, { content, productIds, collectionIds })
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.role === 'ai'
            ? { ...m, proposal: { ...m.proposal, suggestedContent: content }, saved: true }
            : m,
        ),
      )
      message.success('Contexte enregistré')
      onSaved()
    } catch (e) {
      message.error((e as Error).message || "Échec de l'enregistrement")
    } finally {
      setSavingMessageId(null)
    }
  }

  const handleEditProposal = (msgId: string, value: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.role === 'ai'
          ? { ...m, proposal: { ...m.proposal, suggestedContent: value }, saved: false }
          : m,
      ),
    )
  }

  const hasMessages = messages.length > 0
  const lastAiId = [...messages].reverse().find((m) => m.role === 'ai')?.id

  const modalTitle =
    step === 'chat' && hasMessages ? (
      <div className="flex items-center gap-2">
        <Button
          type="text"
          size="small"
          shape="circle"
          icon={<ArrowLeft size={16} />}
          onClick={() => setStep('pick')}
          aria-label="Modifier la sélection"
        />
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">
            {selected.length}{' '}
            {selected.length > 1 ? 'éléments sélectionnés' : 'élément sélectionné'}
          </span>
          <span className="text-xs font-normal text-text-muted">Modifications du contexte</span>
        </div>
      </div>
    ) : null

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      destroyOnHidden
      width={560}
      centered
      styles={{ body: { padding: 0 } }}
      title={modalTitle}
    >
      {step === 'pick' && (
        <ProductCollectionPicker
          catalog={catalog}
          selected={selected}
          onChange={setSelected}
          onNext={() => setStep('chat')}
          placeholderProducts={placeholderProducts}
          placeholderCollections={placeholderCollections}
        />
      )}

      {step === 'chat' && (
        <div className="flex flex-col" style={{ minHeight: 480 }}>
          {/* Top-right "back to selection" — outlined secondary action available
              before the first prompt is sent. Once the chat starts the header
              takes over with a compact icon variant. */}
          {!hasMessages && (
            <div className="flex items-center justify-end px-4 pt-4">
              <Button size="small" onClick={() => setStep('pick')}>
                Modifier la sélection
              </Button>
            </div>
          )}

          {!hasMessages && (
            <div className="px-4 pt-2 pb-2">
              <SocialSetup
                icon={<Sparkles size={28} strokeWidth={1.5} />}
                color="#111b21"
                title={`${selected.length} ${
                  selected.length > 1 ? 'éléments sélectionnés' : 'élément sélectionné'
                }`}
                description="Quelle modification souhaitez-vous apporter au contexte des produits/collections sélectionnés ?"
              />
            </div>
          )}

          <div
            className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
            style={{ maxHeight: hasMessages ? 480 : 220 }}
          >
            {messages.map((m) => {
              if (m.role === 'user') {
                return (
                  <div
                    key={m.id}
                    className="context-flow-mini-chat__bubble"
                    style={{ alignSelf: 'flex-end', maxWidth: '85%' }}
                  >
                    {m.text}
                  </div>
                )
              }
              const isLast = m.id === lastAiId
              const isSaving = savingMessageId === m.id
              return (
                <div
                  key={m.id}
                  className="flex flex-col gap-2"
                  style={{ alignSelf: 'flex-start', maxWidth: '92%', width: '100%' }}
                >
                  {m.proposal.hasConflict && m.proposal.conflictReason && (
                    <div className="context-flow-mini-chat__bubble context-flow-mini-chat__bubble--warning">
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="mb-1 text-sm font-semibold">Incohérence détectée</div>
                          <div className="text-sm">{m.proposal.conflictReason}</div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="context-flow-mini-chat__bubble">
                    {isLast && !m.saved ? (
                      <>
                        <div className="mb-2 text-xs text-text-muted">
                          Contexte proposé — vous pouvez l&apos;éditer
                        </div>
                        <Input.TextArea
                          autoSize={{ minRows: 4, maxRows: 12 }}
                          value={m.proposal.suggestedContent}
                          onChange={(e) => handleEditProposal(m.id, e.target.value)}
                        />
                        <div className="mt-3 flex justify-end">
                          <Button
                            type="primary"
                            icon={<Check size={14} />}
                            loading={isSaving}
                            disabled={!m.proposal.suggestedContent.trim()}
                            onClick={() => handleSaveProposal(m.id, m.proposal.suggestedContent)}
                          >
                            Enregistrer
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <MarkdownContent content={m.proposal.suggestedContent} />
                        {m.saved && (
                          <div className="mt-2 flex items-center gap-1 text-xs text-success">
                            <Check size={12} /> Enregistré
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
            {analyzing && (
              <div
                className="context-flow-mini-chat__bubble text-text-muted"
                style={{ alignSelf: 'flex-start' }}
              >
                Analyse en cours…
              </div>
            )}
          </div>

          <div className="context-flow-mini-chat__footer">
            <Input.TextArea
              placeholder="Décrivez la modification…"
              autoSize={{ minRows: 1, maxRows: 4 }}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              disabled={analyzing}
              className="rounded-2xl!"
            />
            <Button
              type="text"
              shape="circle"
              icon={<Send size={18} />}
              onClick={handleSend}
              loading={analyzing}
              disabled={!draft.trim() || analyzing}
              aria-label="Envoyer"
              className="flex-shrink-0"
            />
          </div>
        </div>
      )}
    </Modal>
  )
}
