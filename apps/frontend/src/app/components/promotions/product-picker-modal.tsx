/**
 * ⚠️ PROTECTED FILE — DO NOT MODIFY unless you have received an EXPLICIT order to do so.
 * If you do modify this file, you MUST NOT remove or alter any existing fields, props,
 * or mock data imports. Only ADD to this file, never delete or replace.
 * Any agent that removes functionality from this modal will break the product selection flow.
 */
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Modal, Input, Button, Checkbox, Select, Spin } from 'antd'
import { Search, ShoppingBag } from 'lucide-react'
import { MOCK_CATALOG_ARTICLES } from '@app/components/whatsapp/mock-data'
import { catalogApi, type Catalog } from '@app/lib/api/agent-api'

export interface PickerProduct {
  id: string
  name: string
  description: string
  imageUrl: string
  price: number
  currency: string
}

interface ProductPickerModalProps {
  open: boolean
  onClose: () => void
  onSave: (ids: string[]) => void
  initialSelection?: string[]
  /** Available catalogs — when provided, shows a catalog Select and fetches products from API */
  catalogs?: Catalog[]
  /** Called with full product objects when user saves — use this instead of onSave to get complete data */
  onSaveProducts?: (products: PickerProduct[]) => void
}

function formatPrice(price: number, currency: string) {
  return `${price.toLocaleString('fr-FR')} ${currency}`
}

export function ProductPickerModal({
  open,
  onClose,
  onSave,
  initialSelection = [],
  catalogs,
  onSaveProducts,
}: ProductPickerModalProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | undefined>(undefined)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(initialSelection))

  const effectiveCatalogId = selectedCatalogId || catalogs?.[0]?.id
  const hasCatalogs = catalogs && catalogs.length > 0

  // Fetch products from API when a catalog is selected
  const productsQuery = useQuery({
    queryKey: ['catalog-products-picker', effectiveCatalogId, search],
    queryFn: () =>
      catalogApi.getProducts(effectiveCatalogId!, {
        search: search || undefined,
        limit: 50,
      }),
    enabled: !!effectiveCatalogId && !!hasCatalogs,
    staleTime: Infinity,
    refetchOnMount: true,
  })

  // Map API products for display
  const apiArticles = useMemo(() => {
    if (!productsQuery.data?.products) return []
    return productsQuery.data.products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description || '',
      imageUrl: p.imageUrl || '',
      price: p.price || 0,
      currency: p.currency || 'FCFA',
      category: p.category || '',
      status: p.status,
    }))
  }, [productsQuery.data])

  const activeArticles = useMemo(() => {
    if (hasCatalogs) return apiArticles
    return MOCK_CATALOG_ARTICLES.filter((a) => a.status === 'published')
  }, [hasCatalogs, apiArticles])

  const filtered = useMemo(() => {
    if (hasCatalogs) return activeArticles
    if (!search) return activeArticles
    const q = search.toLowerCase()
    return activeArticles.filter(
      (a) => a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q),
    )
  }, [search, activeArticles, hasCatalogs])

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
    const ids = Array.from(selectedIds)
    onSave(ids)
    if (onSaveProducts) {
      const products: PickerProduct[] = activeArticles
        .filter((a) => selectedIds.has(a.id))
        .map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          imageUrl: a.imageUrl,
          price: a.price,
          currency: a.currency,
        }))
      onSaveProducts(products)
    }
    handleClose()
  }

  const handleClose = () => {
    setSearch('')
    onClose()
  }

  const handleAfterOpen = () => {
    setSelectedIds(new Set(initialSelection))
    setSearch('')
    if (catalogs?.length && !selectedCatalogId) {
      setSelectedCatalogId(catalogs[0].id)
    }
  }

  const isLoadingProducts = hasCatalogs && productsQuery.isLoading

  return (
    <Modal
      title={
        <div className="flex flex-col gap-2">
          {hasCatalogs && (
            <Select
              value={effectiveCatalogId}
              onChange={setSelectedCatalogId}
              options={catalogs!.map((c) => ({ value: c.id, label: c.name }))}
              style={{ fontWeight: 'normal', width: '100%' }}
              placeholder={t('promotions.picker_search')}
            />
          )}
          <Input
            placeholder={t('promotions.picker_search')}
            prefix={<Search size={16} className="text-text-muted" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ fontWeight: 'normal' }}
          />
        </div>
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
        {isLoadingProducts ? (
          <div className="flex items-center justify-center py-12">
            <Spin />
          </div>
        ) : filtered.length === 0 ? (
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
