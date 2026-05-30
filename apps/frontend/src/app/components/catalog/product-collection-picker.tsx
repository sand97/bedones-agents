import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Input, Segmented, Spin, Button } from 'antd'
import { Search, X, ShoppingBag, Layers } from 'lucide-react'
import { SocialSetup } from '@app/components/social/social-setup'
import { catalogApi, type Catalog, type Collection, type Product } from '@app/lib/api/agent-api'

export type PickerEntity =
  | {
      kind: 'product'
      id: string
      retailerId?: string
      name: string
      imageUrl?: string
    }
  | {
      kind: 'collection'
      id: string
      name: string
      productCount?: number
    }

type Mode = 'products' | 'collections'

interface ProductCollectionPickerProps {
  catalog: Catalog
  /** Currently selected entries (kept by the parent so they survive mode switches). */
  selected: PickerEntity[]
  onChange: (next: PickerEntity[]) => void
  /** Show a Next button at the bottom — disabled when `selected` is empty. */
  onNext: () => void
  nextLabel?: string
}

/**
 * Picker step shared by the "Add context" and "Link posts" flows.
 *
 * - Toggle between products / collections.
 * - Newly picked items are pushed to the top of the selected list (most recent first).
 */
export function ProductCollectionPicker({
  catalog,
  selected,
  onChange,
  onNext,
  nextLabel = 'Suivant',
}: ProductCollectionPickerProps) {
  const [mode, setMode] = useState<Mode>('products')
  const [search, setSearch] = useState('')

  const productsQuery = useQuery({
    queryKey: ['catalog-products-picker', catalog.id, search],
    queryFn: () => catalogApi.getProducts(catalog.id, { search: search || undefined, limit: 50 }),
    enabled: mode === 'products',
    staleTime: 60_000,
  })

  const collectionsQuery = useQuery({
    queryKey: ['catalog-collections-picker', catalog.id],
    queryFn: () => catalogApi.listCollections(catalog.id),
    enabled: mode === 'collections',
    staleTime: 5 * 60_000,
  })

  const products = productsQuery.data?.products ?? []
  const collections = collectionsQuery.data ?? []

  const selectedIds = useMemo(() => new Set(selected.map((s) => `${s.kind}:${s.id}`)), [selected])

  const toggleProduct = (p: Product) => {
    const key = `product:${p.id}`
    if (selectedIds.has(key)) {
      onChange(selected.filter((s) => !(s.kind === 'product' && s.id === p.id)))
    } else {
      onChange([
        {
          kind: 'product',
          id: p.id,
          retailerId: p.retailerId,
          name: p.name,
          imageUrl: p.imageUrl,
        },
        ...selected,
      ])
    }
  }

  const toggleCollection = (c: Collection) => {
    const key = `collection:${c.id}`
    if (selectedIds.has(key)) {
      onChange(selected.filter((s) => !(s.kind === 'collection' && s.id === c.id)))
    } else {
      onChange([
        { kind: 'collection', id: c.id, name: c.name, productCount: c.product_count },
        ...selected,
      ])
    }
  }

  const removeSelected = (entry: PickerEntity) => {
    onChange(selected.filter((s) => !(s.kind === entry.kind && s.id === entry.id)))
  }

  const isEmpty =
    mode === 'products'
      ? !productsQuery.isLoading && products.length === 0
      : !collectionsQuery.isLoading && collections.length === 0

  const filteredCollections = useMemo(() => {
    if (!search) return collections
    const q = search.toLowerCase()
    return collections.filter((c) => c.name.toLowerCase().includes(q))
  }, [collections, search])

  return (
    <div className="flex flex-col" style={{ minHeight: 480 }}>
      <div className="flex flex-col gap-2 p-4 border-b border-[var(--color-border-default)]">
        <Segmented
          block
          value={mode}
          onChange={(v) => setMode(v as Mode)}
          options={[
            { label: 'Produits', value: 'products' },
            { label: 'Collections', value: 'collections' },
          ]}
        />
        <Input
          allowClear
          placeholder={
            mode === 'products' ? 'Rechercher un produit…' : 'Rechercher une collection…'
          }
          prefix={<Search size={16} className="text-text-muted" />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {selected.length > 0 && (
          <div className="context-flow-selected-list">
            {selected.map((s) => (
              <div key={`${s.kind}:${s.id}`} className="context-flow-selected-item">
                {s.kind === 'product' ? (
                  <ShoppingBag size={14} className="text-text-muted" />
                ) : (
                  <Layers size={14} className="text-text-muted" />
                )}
                <span className="truncate">{s.name}</span>
                <button
                  type="button"
                  className="context-flow-selected-item__remove"
                  onClick={() => removeSelected(s)}
                  aria-label="Retirer"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto" style={{ maxHeight: 360 }}>
        {(productsQuery.isLoading && mode === 'products') ||
        (collectionsQuery.isLoading && mode === 'collections') ? (
          <div className="flex items-center justify-center py-12">
            <Spin />
          </div>
        ) : isEmpty ? (
          <SocialSetup
            icon={
              mode === 'products' ? (
                <ShoppingBag size={28} strokeWidth={1.5} />
              ) : (
                <Layers size={28} strokeWidth={1.5} />
              )
            }
            color="#111b21"
            title={mode === 'products' ? 'Aucun produit trouvé' : 'Aucune collection trouvée'}
            description={
              mode === 'products'
                ? 'Ajoutez des produits à votre catalogue avant de leur attacher du contexte.'
                : 'Créez une collection pour regrouper plusieurs produits.'
            }
          />
        ) : mode === 'products' ? (
          products.map((p) => {
            const isSelected = selectedIds.has(`product:${p.id}`)
            return (
              <button
                key={p.id}
                type="button"
                className="article-picker-item"
                onClick={() => toggleProduct(p)}
                style={{
                  background: isSelected ? 'var(--color-bg-subtle)' : undefined,
                  width: '100%',
                  textAlign: 'left',
                }}
              >
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={p.name} className="article-picker-image" />
                ) : (
                  <div
                    className="article-picker-image flex items-center justify-center"
                    style={{ background: 'var(--color-bg-subtle)' }}
                  >
                    <ShoppingBag size={18} className="text-text-muted" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  {p.collectionName && (
                    <div className="text-xs text-text-muted truncate">{p.collectionName}</div>
                  )}
                </div>
                <input type="checkbox" checked={isSelected} readOnly className="flex-shrink-0" />
              </button>
            )
          })
        ) : (
          filteredCollections.map((c) => {
            const isSelected = selectedIds.has(`collection:${c.id}`)
            return (
              <button
                key={c.id}
                type="button"
                className="article-picker-item"
                onClick={() => toggleCollection(c)}
                style={{
                  background: isSelected ? 'var(--color-bg-subtle)' : undefined,
                  width: '100%',
                  textAlign: 'left',
                }}
              >
                <div
                  className="article-picker-image flex items-center justify-center"
                  style={{ background: 'var(--color-bg-subtle)' }}
                >
                  <Layers size={18} className="text-text-muted" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{c.name}</div>
                  {typeof c.product_count === 'number' && (
                    <div className="text-xs text-text-muted">{c.product_count} produits</div>
                  )}
                </div>
                <input type="checkbox" checked={isSelected} readOnly className="flex-shrink-0" />
              </button>
            )
          })
        )}
      </div>

      <div
        className="flex justify-end gap-2 p-4"
        style={{ borderTop: '1px solid var(--color-border-default)' }}
      >
        <Button type="primary" disabled={selected.length === 0} onClick={onNext}>
          {nextLabel}
          {selected.length > 0 ? ` (${selected.length})` : ''}
        </Button>
      </div>
    </div>
  )
}
