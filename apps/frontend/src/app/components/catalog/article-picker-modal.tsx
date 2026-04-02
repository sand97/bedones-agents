import { useState, useMemo } from 'react'
import { Modal, Input, Button } from 'antd'
import { Search, Plus, Minus, ShoppingBag } from 'lucide-react'
import { MOCK_CATALOG_ARTICLES, type CatalogArticle } from '@app/components/whatsapp/mock-data'

interface SelectedEntry {
  article: CatalogArticle
  quantity: number
}

interface ArticlePickerModalProps {
  open: boolean
  onClose: () => void
  onSave: (entries: SelectedEntry[]) => void
  /** Already selected article IDs to pre-populate quantities */
  initialSelection?: SelectedEntry[]
}

function formatPrice(price: number, currency: string) {
  return `${price.toLocaleString('fr-FR')} ${currency}`
}

export function ArticlePickerModal({
  open,
  onClose,
  onSave,
  initialSelection = [],
}: ArticlePickerModalProps) {
  const [search, setSearch] = useState('')
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {}
    for (const entry of initialSelection) {
      map[entry.article.id] = entry.quantity
    }
    return map
  })

  const activeArticles = useMemo(
    () => MOCK_CATALOG_ARTICLES.filter((a) => a.status === 'active'),
    [],
  )

  const filtered = useMemo(() => {
    if (!search) return activeArticles
    const q = search.toLowerCase()
    return activeArticles.filter(
      (a) => a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q),
    )
  }, [search, activeArticles])

  const setQty = (id: string, qty: number) => {
    setQuantities((prev) => {
      const next = { ...prev }
      if (qty <= 0) {
        delete next[id]
      } else {
        next[id] = qty
      }
      return next
    })
  }

  const selectedCount = Object.values(quantities).filter((q) => q > 0).length

  const handleSave = () => {
    const entries: SelectedEntry[] = []
    for (const [id, qty] of Object.entries(quantities)) {
      if (qty <= 0) continue
      const article = MOCK_CATALOG_ARTICLES.find((a) => a.id === id)
      if (article) entries.push({ article, quantity: qty })
    }
    onSave(entries)
    handleClose()
  }

  const handleClose = () => {
    setSearch('')
    setQuantities({})
    onClose()
  }

  // Reset quantities when modal opens with new initialSelection
  const handleAfterOpen = () => {
    const map: Record<string, number> = {}
    for (const entry of initialSelection) {
      map[entry.article.id] = entry.quantity
    }
    setQuantities(map)
    setSearch('')
  }

  return (
    <Modal
      title={
        <Input
          placeholder="Rechercher un article..."
          prefix={<Search size={16} className="text-text-muted" />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ fontWeight: 'normal' }}
        />
      }
      open={open}
      onCancel={handleClose}
      afterOpenChange={(visible) => {
        if (visible) handleAfterOpen()
      }}
      closable={false}
      footer={[
        <Button onClick={handleClose}>Annuler</Button>,
        <Button type="primary" onClick={handleSave} disabled={selectedCount === 0}>
          Sauvegarder{' '}
          {selectedCount > 0 ? `${selectedCount} article${selectedCount > 1 ? 's' : ''}` : ''}
        </Button>,
      ]}
      width={540}
      styles={{ body: { padding: 0, maxHeight: '60vh', overflowY: 'auto' } }}
    >
      {/* Article list */}
      <div className="flex flex-col">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-muted">
            <ShoppingBag size={32} strokeWidth={1.5} className="mb-2 opacity-40" />
            <span className="text-sm">Aucun article trouvé</span>
          </div>
        ) : (
          filtered.map((article) => {
            const qty = quantities[article.id] || 0
            return (
              <div key={article.id} className="article-picker-item">
                <img src={article.imageUrl} alt={article.name} className="article-picker-image" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-text-primary truncate">
                    {article.name}
                  </div>
                  <div className="text-xs text-text-muted truncate">{article.description}</div>
                  <div className="text-xs font-semibold text-text-primary mt-1">
                    {formatPrice(article.price, article.currency)}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {qty === 0 ? (
                    <button
                      type="button"
                      className="ticket-product-qty-btn"
                      onClick={() => setQty(article.id, 1)}
                    >
                      <Plus size={14} />
                    </button>
                  ) : (
                    <div className="flex items-center gap-0">
                      <button
                        type="button"
                        className="ticket-product-qty-btn"
                        onClick={() => setQty(article.id, qty - 1)}
                      >
                        <Minus size={14} />
                      </button>
                      <span className="ticket-product-qty-value">{qty}</span>
                      <button
                        type="button"
                        className="ticket-product-qty-btn"
                        onClick={() => setQty(article.id, qty + 1)}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </Modal>
  )
}
