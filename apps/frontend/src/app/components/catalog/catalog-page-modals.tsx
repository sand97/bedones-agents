import type { Dispatch, SetStateAction } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CatalogToolsModal } from '@app/components/catalog/catalog-tools-modal'
import { LinkedPostsModal } from '@app/components/catalog/linked-posts-modal'
import { PostLinkFlowModal } from '@app/components/catalog/post-link-flow-modal'
import type { PickerEntity } from '@app/components/catalog/product-collection-picker'
import { ProductContextDetailModal } from '@app/components/catalog/product-context-detail-modal'
import { ProductContextFlowModal } from '@app/components/catalog/product-context-flow-modal'
import { ProductModal } from '@app/components/catalog/product-modal'
import { SharedProductsModal } from '@app/components/catalog/shared-products-modal'
import { catalogApi } from '@app/lib/api/agent-api'
import type { Product, Collection, Catalog } from '@app/lib/api/agent-api'
import type {
  CatalogMutations,
  ModalProductConfig,
} from '@app/components/catalog/use-catalog-mutations'

interface CatalogPageModalsProps {
  collections: Collection[]
  products: Product[]
  selectedCatalog: Catalog | null
  orgSlug: string
  modalProductConfig: ModalProductConfig
  setModalProductConfig: Dispatch<SetStateAction<ModalProductConfig>>
  createProductMutation: CatalogMutations['createProductMutation']
  updateProductMutation: CatalogMutations['updateProductMutation']
  deleteCatalogMutation: CatalogMutations['deleteCatalogMutation']
  toolsModalOpen: boolean
  setToolsModalOpen: (open: boolean) => void
  contextFlowOpen: boolean
  setContextFlowOpen: (open: boolean) => void
  contextFlowEdit: { targets: PickerEntity[]; currentContext: string } | null
  setContextFlowEdit: Dispatch<
    SetStateAction<{ targets: PickerEntity[]; currentContext: string } | null>
  >
  postLinkFlowOpen: boolean
  setPostLinkFlowOpen: (open: boolean) => void
  contextDetailFor: Product | null
  setContextDetailFor: Dispatch<SetStateAction<Product | null>>
  sharedProductsConfig: { ids: string[] } | null
  setSharedProductsConfig: Dispatch<SetStateAction<{ ids: string[] } | null>>
  linkedPostsFor: { kind: 'product' | 'collection'; id: string; name?: string } | null
  setLinkedPostsFor: Dispatch<
    SetStateAction<{ kind: 'product' | 'collection'; id: string; name?: string } | null>
  >
}

export function CatalogPageModals({
  collections,
  products,
  selectedCatalog,
  orgSlug,
  modalProductConfig,
  setModalProductConfig,
  createProductMutation,
  updateProductMutation,
  deleteCatalogMutation,
  toolsModalOpen,
  setToolsModalOpen,
  contextFlowOpen,
  setContextFlowOpen,
  contextFlowEdit,
  setContextFlowEdit,
  postLinkFlowOpen,
  setPostLinkFlowOpen,
  contextDetailFor,
  setContextDetailFor,
  sharedProductsConfig,
  setSharedProductsConfig,
  linkedPostsFor,
  setLinkedPostsFor,
}: CatalogPageModalsProps) {
  const queryClient = useQueryClient()

  return (
    <>
      <ProductModal
        collections={collections}
        open={modalProductConfig.isOpen}
        onClose={() => setModalProductConfig({ isOpen: false })}
        onSubmit={(values) => {
          const [firstImage, ...extraImages] = values.imageUrls ?? []
          const apiData = {
            name: values.name,
            retailerId: values.retailerId,
            description: values.description,
            imageUrl: firstImage,
            additionalImageUrls: extraImages,
            price: values.price != null ? String(values.price) : undefined,
            currency: values.currency,
            category: values.category,
            url: values.url,
            availability: values.availability,
            brand: values.brand,
            condition: values.condition,
            collectionId: values.collectionId,
          }
          const editing = modalProductConfig.initialProduct
          if (editing) {
            updateProductMutation.mutate({ productId: editing.id, data: apiData })
          } else {
            createProductMutation.mutate(apiData)
          }
        }}
        product={modalProductConfig.initialProduct}
        loading={createProductMutation.isPending || updateProductMutation.isPending}
      />

      {selectedCatalog && (
        <>
          <CatalogToolsModal
            open={toolsModalOpen}
            onClose={() => setToolsModalOpen(false)}
            onOpenContextFlow={() => setContextFlowOpen(true)}
            onOpenLinkPostsFlow={() => setPostLinkFlowOpen(true)}
            onOpenStudio={() => {
              const base = import.meta.env.VITE_DESIGN_STUDIO_URL || 'https://design.bedones.com'
              const url = `${base}/?catalogId=${encodeURIComponent(
                selectedCatalog.id,
              )}&org=${encodeURIComponent(orgSlug)}`
              window.open(url, '_blank', 'noopener,noreferrer')
            }}
            catalogName={selectedCatalog.name}
            onDisconnect={() => deleteCatalogMutation.mutateAsync(selectedCatalog.id)}
          />
          <ProductContextFlowModal
            open={contextFlowOpen || !!contextFlowEdit}
            catalog={selectedCatalog}
            placeholderProducts={products}
            placeholderCollections={collections}
            editMode={contextFlowEdit ?? undefined}
            onClose={() => {
              setContextFlowOpen(false)
              setContextFlowEdit(null)
            }}
            onSaved={() => {
              // Refresh context-related queries so the detail / siblings views
              // pick the new content up next time they're opened.
              queryClient.invalidateQueries({
                queryKey: ['get', '/catalog/{catalogId}/products/{productId}/context'],
              })
            }}
          />
          <PostLinkFlowModal
            open={postLinkFlowOpen}
            catalog={selectedCatalog}
            organisationId={orgSlug}
            placeholderProducts={products}
            placeholderCollections={collections}
            onClose={() => setPostLinkFlowOpen(false)}
            onSaved={() => {
              queryClient.invalidateQueries({ queryKey: ['post-links', selectedCatalog.id] })
            }}
          />
          {contextDetailFor && (
            <ProductContextDetailModal
              open={!!contextDetailFor}
              catalogId={selectedCatalog.id}
              productId={contextDetailFor.id}
              productName={contextDetailFor.name}
              onClose={() => setContextDetailFor(null)}
              onEditOne={(detail) => {
                if (!contextDetailFor) return
                const target: PickerEntity = {
                  kind: 'product',
                  id: contextDetailFor.id,
                  retailerId: contextDetailFor.retailerId,
                  name: contextDetailFor.name,
                  imageUrl: contextDetailFor.imageUrl,
                }
                setContextFlowEdit({ targets: [target], currentContext: detail.content })
                setContextDetailFor(null)
              }}
              onEditAll={async (detail) => {
                // Hydrate every sibling so the chips that show up if the user
                // hits "back" in the flow have proper names / images.
                const ids = detail.sameContentProductIds
                const known = new Map(products.map((p) => [p.id, p]))
                const missing = ids.filter((id) => !known.has(id))
                let fetched: (Product | null)[] = []
                if (missing.length > 0) {
                  try {
                    const res = await catalogApi.getProductsByIds(selectedCatalog.id, missing)
                    fetched = res.products
                  } catch {
                    fetched = []
                  }
                }
                const fetchedMap = new Map(
                  fetched.filter((p): p is Product => p !== null).map((p) => [p.id, p]),
                )
                const targets: PickerEntity[] = ids.map((id) => {
                  const p = known.get(id) ?? fetchedMap.get(id)
                  return {
                    kind: 'product',
                    id,
                    retailerId: p?.retailerId,
                    name: p?.name ?? 'Produit',
                    imageUrl: p?.imageUrl,
                  }
                })
                setContextFlowEdit({ targets, currentContext: detail.content })
                setContextDetailFor(null)
              }}
              onViewSiblings={(detail) => {
                setSharedProductsConfig({ ids: detail.sameContentProductIds })
              }}
            />
          )}
          {sharedProductsConfig && (
            <SharedProductsModal
              open={!!sharedProductsConfig}
              catalogId={selectedCatalog.id}
              productIds={sharedProductsConfig.ids}
              placeholderProducts={products}
              onClose={() => setSharedProductsConfig(null)}
            />
          )}
          <LinkedPostsModal
            open={!!linkedPostsFor}
            catalogId={selectedCatalog.id}
            entity={linkedPostsFor}
            onClose={() => setLinkedPostsFor(null)}
          />
        </>
      )}
    </>
  )
}
