import { useEffect, useState } from 'react'
import { Modal, Input, Button, Radio, Skeleton, message } from 'antd'
import { catalogApi } from '@app/lib/api/agent-api'

interface ProductContextDetailModalProps {
  open: boolean
  catalogId: string
  productId: string
  productName?: string
  onClose: () => void
  onSaved?: () => void
}

export function ProductContextDetailModal({
  open,
  catalogId,
  productId,
  productName,
  onClose,
  onSaved,
}: ProductContextDetailModalProps) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [sameContentCount, setSameContentCount] = useState(0)
  const [applyToSiblings, setApplyToSiblings] = useState<'this' | 'all'>('this')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    catalogApi
      .getProductContext(catalogId, productId)
      .then((res) => {
        if (cancelled) return
        setContent(res.content)
        setOriginalContent(res.content)
        setSameContentCount(res.sameContentCount)
        setApplyToSiblings('this')
      })
      .catch((e) => message.error((e as Error).message))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, catalogId, productId])

  const handleSave = async () => {
    setSaving(true)
    try {
      await catalogApi.updateProductContext(catalogId, productId, {
        content,
        applyToSiblings: applyToSiblings === 'all',
      })
      message.success('Contexte mis à jour')
      onSaved?.()
      onClose()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const siblingsCount = Math.max(0, sameContentCount - 1)
  const hasSiblings = siblingsCount > 0
  const isDirty = content !== originalContent

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={productName ? `Contexte – ${productName}` : 'Contexte du produit'}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Annuler
        </Button>,
        <Button key="save" type="primary" loading={saving} disabled={!isDirty} onClick={handleSave}>
          Enregistrer
        </Button>,
      ]}
      width={520}
    >
      {loading ? (
        <Skeleton active />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="text-xs text-text-muted">
            {hasSiblings
              ? `${siblingsCount} autre${siblingsCount > 1 ? 's' : ''} produit${
                  siblingsCount > 1 ? 's partagent' : ' partage'
                } ce contexte.`
              : 'Ce contexte n’est utilisé que pour ce produit.'}
          </div>
          <Input.TextArea
            autoSize={{ minRows: 5, maxRows: 12 }}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Aucun contexte enregistré"
          />
          {hasSiblings && isDirty && (
            <div className="rounded-lg p-3" style={{ background: 'var(--color-bg-subtle)' }}>
              <div className="text-sm font-medium mb-2">Appliquer la modification à :</div>
              <Radio.Group
                value={applyToSiblings}
                onChange={(e) => setApplyToSiblings(e.target.value as 'this' | 'all')}
              >
                <div className="flex flex-col gap-1">
                  <Radio value="this">Ce produit uniquement</Radio>
                  <Radio value="all">
                    Ce produit et les {siblingsCount} autre{siblingsCount > 1 ? 's' : ''} produit
                    {siblingsCount > 1 ? 's' : ''} partageant ce contexte
                  </Radio>
                </div>
              </Radio.Group>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
