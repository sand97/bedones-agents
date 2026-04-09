/**
 * ⚠️ PROTECTED FILE — DO NOT MODIFY unless you have received an EXPLICIT order to do so.
 * If you do modify this file, you MUST NOT remove or alter any existing fields, props,
 * or mock data imports. Only ADD to this file, never delete or replace.
 * Any agent that removes functionality from this modal will break the product selection flow.
 */
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Input, Button, Checkbox } from 'antd'
import { Search, ShoppingBag } from 'lucide-react'
// TODO(mock): Remplacer MOCK_CATALOG_ARTICLES par un appel API réel (catalogApi.getProducts)
import { MOCK_CATALOG_ARTICLES } from '@app/components/whatsapp/mock-data'

interface ProductPickerModalProps {
  open: boolean
  onClose: () => void
  onSave: (ids: string[]) => void
  initialSelection?: string[]
}

function formatPrice(price: number, currency: string) {
  return `${price.toLocaleString('fr-FR')} ${currency}`
}

export function ProductPickerModal({
  open,
  onClose,
  onSave,
  initialSelection = [],
}: ProductPickerModalProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(initialSelection))

  const activeArticles = useMemo(
    () => MOCK_CATALOG_ARTICLES.filter((a) => a.status === 'published'),
    [],
  )

  const filtered = useMemo(() => {
    if (!search) return activeArticles
    const q = search.toLowerCase()
    return activeArticles.filter(
      (a) => a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q),
    )
  }, [search, activeArticles])

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectedCount = selectedIds.size

  const handleSave = () => {
    onSave(Array.from(selectedIds))
    handleClose()
  }

  const handleClose = () => {
    setSearch('')
    onClose()
  }

  const handleAfterOpen = () => {
    setSelectedIds(new Set(initialSelection))
    setSearch('')
  }

  return (
    <Modal
      title={
        <Input
          placeholder={t('promotions.picker_search')}
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
        <Button key="cancel" onClick={handleClose}>
          {t('promotions.cancel')}
        </Button>,
        <Button key="save" type="primary" onClick={handleSave} disabled={selectedCount === 0}>
          {t('promotions.picker_save', { count: selectedCount })}
        </Button>,
      ]}
      width={540}
      styles={{ body: { padding: 0, maxHeight: '60vh', overflowY: 'auto' } }}
    >
      <div className="flex flex-col">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-muted">
            <ShoppingBag size={32} strokeWidth={1.5} className="mb-2 opacity-40" />
            <span className="text-sm">{t('promotions.picker_no_results')}</span>
          </div>
        ) : (
          filtered.map((article) => {
            const checked = selectedIds.has(article.id)
            return (
              <div
                key={article.id}
                className="article-picker-item cursor-pointer"
                onClick={() => toggle(article.id)}
              >
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
                  <Checkbox checked={checked} />
                </div>
              </div>
            )
          })
        )}
      </div>
    </Modal>
  )
}
