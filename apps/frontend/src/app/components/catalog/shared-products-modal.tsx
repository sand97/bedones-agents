import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Modal, Skeleton } from 'antd'
import { ShoppingBag } from 'lucide-react'
import { catalogApi, type Product } from '@app/lib/api/agent-api'

interface SharedProductsModalProps {
  open: boolean
  catalogId: string
  /** Meta product IDs of every product sharing the same context (including the one we came from). */
  productIds: string[]
  /** Products already loaded on the parent page — rendered immediately. */
  placeholderProducts?: Product[]
  onClose: () => void
}

export function SharedProductsModal({
  open,
  catalogId,
  productIds,
  placeholderProducts,
  onClose,
}: SharedProductsModalProps) {
  const knownMap = useMemo(() => {
    const m = new Map<string, Product>()
    for (const p of placeholderProducts ?? []) m.set(p.id, p)
    return m
  }, [placeholderProducts])

  const missingIds = useMemo(
    () => productIds.filter((id) => !knownMap.has(id)),
    [productIds, knownMap],
  )

  // Only hit the network for IDs we don't already have. If everything is in
  // the local store we skip the query entirely.
  const missingQuery = useQuery({
    queryKey: ['catalog-products-by-ids', catalogId, missingIds],
    queryFn: () => catalogApi.getProductsByIds(catalogId, missingIds),
    enabled: open && missingIds.length > 0,
    staleTime: 5 * 60_000,
  })

  const fetchedMap = useMemo(() => {
    const m = new Map<string, Product>()
    for (const p of missingQuery.data?.products ?? []) {
      if (p) m.set(p.id, p)
    }
    return m
  }, [missingQuery.data])

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={`Produits partageant ce contexte (${productIds.length})`}
      footer={null}
      width={520}
      centered
    >
      <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
        {productIds.map((id) => {
          const product = knownMap.get(id) ?? fetchedMap.get(id) ?? null
          if (!product) {
            return (
              <div
                key={id}
                className="flex items-center gap-3 rounded-lg p-2"
                style={{ border: '1px solid var(--color-border-default)' }}
              >
                <Skeleton.Avatar shape="square" active size={44} />
                <div className="flex-1">
                  <Skeleton active title={{ width: '60%' }} paragraph={{ rows: 1, width: '40%' }} />
                </div>
              </div>
            )
          }
          return (
            <div
              key={id}
              className="flex items-center gap-3 rounded-lg p-2"
              style={{ border: '1px solid var(--color-border-default)' }}
            >
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 8,
                    objectFit: 'cover',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 8,
                    background: 'var(--color-bg-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ShoppingBag size={18} className="text-text-muted" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{product.name}</div>
                {product.collectionName && (
                  <div className="text-xs text-text-muted truncate">{product.collectionName}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
