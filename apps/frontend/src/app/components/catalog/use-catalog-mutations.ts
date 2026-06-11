import type { Dispatch, SetStateAction } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { App } from 'antd'
import { useTranslation } from 'react-i18next'
import { catalogApi, getApiErrorMessage } from '@app/lib/api/agent-api'
import type { Product, Collection, Catalog } from '@app/lib/api/agent-api'
import {
  prependDirectListCache,
  prependListItemCache,
  removeDirectListCache,
  removeListItemCache,
  updateDirectListCache,
  updateListItemCache,
} from '@app/lib/query-cache'

export interface ModalProductConfig {
  isOpen: boolean
  initialProduct?: Product
}

interface UseCatalogMutationsOptions {
  selectedCatalog: Catalog | null
  orgSlug: string
  setModalProductConfig: Dispatch<SetStateAction<ModalProductConfig>>
  setCursorStack: Dispatch<SetStateAction<string[]>>
  setAfterCursor: Dispatch<SetStateAction<string | undefined>>
  updateSearch: (updates: Record<string, string | undefined>) => void
}

export function useCatalogMutations({
  selectedCatalog,
  orgSlug,
  setModalProductConfig,
  setCursorStack,
  setAfterCursor,
  updateSearch,
}: UseCatalogMutationsOptions) {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  // Product mutations
  const createProductMutation = useMutation({
    mutationFn: async (data: Parameters<typeof catalogApi.createProduct>[1]) => {
      if (!selectedCatalog) throw new Error('No catalog selected')
      const result = await catalogApi.createProduct(selectedCatalog.id, data)
      return { result, data }
    },
    onSuccess: ({ result, data }) => {
      if (!selectedCatalog) return
      // Meta create returns only { id }. Construct an optimistic Product from the DTO.
      const optimistic: Product = {
        id: (result as unknown as { id: string }).id,
        name: data.name,
        retailerId: data.retailerId,
        description: data.description,
        imageUrl: data.imageUrl,
        additionalImageUrls: data.additionalImageUrls,
        price: data.price ? Number(data.price) : undefined,
        currency: data.currency,
        category: data.category,
        url: data.url,
        availability: data.availability,
        brand: data.brand,
        condition: data.condition,
        status: 'pending',
        needsIndexing: true,
        collectionId: data.collectionId,
      }
      prependListItemCache<Product, 'products'>(
        queryClient,
        ['catalog-products', selectedCatalog.id],
        'products',
        optimistic,
      )
      setModalProductConfig({ isOpen: false })
    },
    onError: (err) => {
      message.error(getApiErrorMessage(err, t('catalog.product_save_error')))
    },
  })

  const updateProductMutation = useMutation({
    mutationFn: async ({
      productId,
      data,
    }: {
      productId: string
      data: Parameters<typeof catalogApi.updateProduct>[2]
    }) => {
      if (!selectedCatalog) throw new Error('No catalog selected')
      await catalogApi.updateProduct(selectedCatalog.id, productId, data)
      return { productId, data }
    },
    onSuccess: ({ productId, data }) => {
      if (!selectedCatalog) return
      const patch: Partial<Product> & { id: string } = {
        id: productId,
        ...data,
        price: data.price ? Number(data.price) : undefined,
      }
      updateListItemCache<Product, 'products'>(
        queryClient,
        ['catalog-products', selectedCatalog.id],
        'products',
        patch,
      )
      setModalProductConfig({ isOpen: false })
    },
    onError: (err) => {
      message.error(getApiErrorMessage(err, t('catalog.product_save_error')))
    },
  })

  const deleteProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      if (!selectedCatalog) throw new Error('No catalog selected')
      await catalogApi.deleteProduct(selectedCatalog.id, productId)
      return productId
    },
    onSuccess: (productId) => {
      if (!selectedCatalog) return
      removeListItemCache<Product, 'products'>(
        queryClient,
        ['catalog-products', selectedCatalog.id],
        'products',
        productId,
      )
    },
  })

  // Collection mutations
  const createCollectionMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      if (!selectedCatalog) throw new Error('No catalog selected')
      const result = await catalogApi.createCollection(selectedCatalog.id, data)
      return { result, data }
    },
    onSuccess: ({ result, data }) => {
      if (!selectedCatalog) return
      const optimistic: Collection = {
        id: (result as unknown as { id: string }).id,
        name: data.name,
        product_count: 0,
      }
      prependDirectListCache<Collection>(
        queryClient,
        ['catalog-collections', selectedCatalog.id],
        optimistic,
      )
    },
  })

  const updateCollectionMutation = useMutation({
    mutationFn: async ({
      collectionId,
      data,
    }: {
      collectionId: string
      data: { name?: string }
    }) => {
      if (!selectedCatalog) throw new Error('No catalog selected')
      await catalogApi.updateCollection(selectedCatalog.id, collectionId, data)
      return { collectionId, data }
    },
    onSuccess: ({ collectionId, data }) => {
      if (!selectedCatalog) return
      updateDirectListCache<Collection>(queryClient, ['catalog-collections', selectedCatalog.id], {
        id: collectionId,
        ...data,
      })
    },
  })

  const deleteCollectionMutation = useMutation({
    mutationFn: async (collectionId: string) => {
      if (!selectedCatalog) throw new Error('No catalog selected')
      await catalogApi.deleteCollection(selectedCatalog.id, collectionId)
      return collectionId
    },
    onSuccess: (collectionId) => {
      if (!selectedCatalog) return
      removeDirectListCache<Collection>(
        queryClient,
        ['catalog-collections', selectedCatalog.id],
        collectionId,
      )
    },
  })

  // Catalog disconnect = full delete (products, collections, links cascade).
  const deleteCatalogMutation = useMutation({
    mutationFn: (catalogId: string) => catalogApi.remove(catalogId),
    onSuccess: (_res, catalogId) => {
      queryClient.setQueryData<Catalog[]>(['catalogs', orgSlug], (old) =>
        (old || []).filter((c) => c.id !== catalogId),
      )
      setCursorStack([])
      setAfterCursor(undefined)
      updateSearch({
        catalogId: undefined,
        collection: undefined,
        status: undefined,
        page: undefined,
      })
      message.success('Catalogue déconnecté')
    },
    onError: (err) => {
      message.error(getApiErrorMessage(err, 'Échec de la déconnexion du catalogue'))
    },
  })

  return {
    createProductMutation,
    updateProductMutation,
    deleteProductMutation,
    createCollectionMutation,
    updateCollectionMutation,
    deleteCollectionMutation,
    deleteCatalogMutation,
  }
}

export type CatalogMutations = ReturnType<typeof useCatalogMutations>
