import { useEffect, useState } from 'react'
import { Modal, Button, Skeleton, message } from 'antd'
import { Pencil, Users } from 'lucide-react'
import { catalogApi } from '@app/lib/api/agent-api'
import { MarkdownContent } from '@app/components/shared/markdown-content'

export interface ContextDetail {
  content: string
  sameContentCount: number
  sameContentProductIds: string[]
}

interface ProductContextDetailModalProps {
  open: boolean
  catalogId: string
  productId: string
  productName?: string
  onClose: () => void
  /** "Modifier le contexte de ce produit". */
  onEditOne: (detail: ContextDetail) => void
  /** "Modifier le contexte des N produits" (this one + siblings). */
  onEditAll: (detail: ContextDetail) => void
  /** "Voir les N autres produits". */
  onViewSiblings: (detail: ContextDetail) => void
}

export function ProductContextDetailModal({
  open,
  catalogId,
  productId,
  productName,
  onClose,
  onEditOne,
  onEditAll,
  onViewSiblings,
}: ProductContextDetailModalProps) {
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<ContextDetail | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setDetail(null)
    catalogApi
      .getProductContext(catalogId, productId)
      .then((res) => {
        if (cancelled) return
        setDetail(res)
      })
      .catch((e) => message.error((e as Error).message))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, catalogId, productId])

  const siblingsCount = Math.max(0, (detail?.sameContentCount ?? 0) - 1)
  const totalSharing = detail?.sameContentCount ?? 0
  const hasSiblings = siblingsCount > 0
  const hasContent = !!detail?.content?.trim()

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={productName ? `Contexte – ${productName}` : 'Contexte du produit'}
      footer={null}
      width={520}
      centered
    >
      {loading ? (
        <Skeleton active />
      ) : !hasContent ? (
        <div className="py-2 text-sm text-text-muted">
          Aucun contexte enregistré pour ce produit.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg p-3" style={{ background: 'var(--color-bg-subtle)' }}>
            <MarkdownContent content={detail!.content} />
          </div>

          <Button
            type="primary"
            block
            icon={<Pencil size={14} />}
            onClick={() => detail && onEditOne(detail)}
          >
            Modifier le contexte de ce produit
          </Button>

          {hasSiblings && (
            <div className="flex flex-col gap-2 border-t border-[var(--color-border-default)] pt-3">
              <div className="text-sm text-text-muted">
                {siblingsCount} autre{siblingsCount > 1 ? 's' : ''} produit
                {siblingsCount > 1 ? 's partagent' : ' partage'} ce contexte.
              </div>
              <Button block icon={<Pencil size={14} />} onClick={() => detail && onEditAll(detail)}>
                Modifier le contexte des {totalSharing} produits
              </Button>
              <Button
                type="text"
                block
                icon={<Users size={14} />}
                onClick={() => detail && onViewSiblings(detail)}
              >
                Voir les {siblingsCount} autre{siblingsCount > 1 ? 's' : ''} produit
                {siblingsCount > 1 ? 's' : ''}
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
