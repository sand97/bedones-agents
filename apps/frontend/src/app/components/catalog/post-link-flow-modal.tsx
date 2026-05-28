import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Modal, Button, Select, Spin, Empty, message } from 'antd'
import { ArrowLeft, Link2 } from 'lucide-react'
import { catalogApi, type Catalog } from '@app/lib/api/agent-api'
import { getSocialAccounts, getPostsForAccount, type SocialAccountResponse } from '@app/lib/api'
import {
  ProductCollectionPicker,
  type PickerEntity,
} from '@app/components/catalog/product-collection-picker'

interface PostLinkFlowModalProps {
  open: boolean
  catalog: Catalog
  organisationId: string
  onClose: () => void
  onSaved: () => void
}

type Step = 'pick' | 'page' | 'posts'

interface PostItem {
  id: string
  message?: string
  imageUrl?: string
  permalinkUrl?: string
}

export function PostLinkFlowModal({
  open,
  catalog,
  organisationId,
  onClose,
  onSaved,
}: PostLinkFlowModalProps) {
  const [step, setStep] = useState<Step>('pick')
  const [selected, setSelected] = useState<PickerEntity[]>([])
  const [accountId, setAccountId] = useState<string | undefined>(undefined)
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const accountsQuery = useQuery({
    queryKey: ['social-accounts', organisationId],
    queryFn: () => getSocialAccounts(organisationId),
    enabled: open,
  })

  const postsQuery = useQuery({
    queryKey: ['social-account-posts', accountId],
    queryFn: () => getPostsForAccount(accountId!),
    enabled: !!accountId && step === 'posts',
  })

  const accountOptions = useMemo(
    () =>
      (accountsQuery.data ?? []).map((a: SocialAccountResponse) => ({
        value: a.id,
        label: a.pageName || a.username || a.provider,
      })),
    [accountsQuery.data],
  )

  const togglePost = (postId: string) => {
    setSelectedPostIds((prev) => {
      const next = new Set(prev)
      if (next.has(postId)) next.delete(postId)
      else next.add(postId)
      return next
    })
  }

  const reset = () => {
    setStep('pick')
    setSelected([])
    setAccountId(undefined)
    setSelectedPostIds(new Set())
    setSaving(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSave = async () => {
    if (selectedPostIds.size === 0) return
    setSaving(true)
    try {
      const productIds = selected.filter((s) => s.kind === 'product').map((s) => s.id)
      const collectionIds = selected.filter((s) => s.kind === 'collection').map((s) => s.id)
      await catalogApi.linkPosts(catalog.id, {
        postIds: Array.from(selectedPostIds),
        productIds,
        collectionIds,
      })
      message.success('Liaisons enregistrées')
      onSaved()
      handleClose()
    } catch (e) {
      message.error((e as Error).message || 'Échec de la liaison')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      destroyOnHidden
      width={560}
      styles={{ body: { padding: 0 } }}
      title={null}
      closable={false}
    >
      {step === 'pick' && (
        <ProductCollectionPicker
          catalog={catalog}
          selected={selected}
          onChange={setSelected}
          onNext={() => setStep('page')}
        />
      )}

      {step === 'page' && (
        <div className="flex flex-col" style={{ minHeight: 320 }}>
          <div className="p-6">
            <h3 className="text-base font-semibold mb-2">Choisir une page</h3>
            <p className="text-sm text-text-muted mb-4">
              Sélectionnez la page dont vous voulez voir les posts.
            </p>
            <Select
              style={{ width: '100%' }}
              placeholder="Sélectionner une page"
              options={accountOptions}
              loading={accountsQuery.isLoading}
              value={accountId}
              onChange={setAccountId}
            />
          </div>
          <div
            className="flex justify-between gap-2 p-4 mt-auto"
            style={{ borderTop: '1px solid var(--color-border-default)' }}
          >
            <Button icon={<ArrowLeft size={14} />} onClick={() => setStep('pick')}>
              Retour
            </Button>
            <Button type="primary" disabled={!accountId} onClick={() => setStep('posts')}>
              Suivant
            </Button>
          </div>
        </div>
      )}

      {step === 'posts' && (
        <div className="flex flex-col" style={{ minHeight: 480 }}>
          <div className="p-4 border-b border-[var(--color-border-default)]">
            <h3 className="text-base font-semibold m-0">Sélectionner des posts</h3>
            <p className="text-xs text-text-muted m-0">
              Sélection multiple — un même post peut être lié à plusieurs produits/collections.
            </p>
          </div>
          <div className="flex-1 overflow-y-auto" style={{ maxHeight: 360 }}>
            {postsQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Spin />
              </div>
            ) : (postsQuery.data ?? []).length === 0 ? (
              <Empty description="Aucun post sur cette page" style={{ padding: '48px 16px' }} />
            ) : (
              (postsQuery.data ?? []).map((p: PostItem) => {
                const isSelected = selectedPostIds.has(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="article-picker-item"
                    onClick={() => togglePost(p.id)}
                    style={{
                      background: isSelected ? 'var(--color-bg-subtle)' : undefined,
                      width: '100%',
                      textAlign: 'left',
                    }}
                  >
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" className="article-picker-image" />
                    ) : (
                      <div
                        className="article-picker-image flex items-center justify-center"
                        style={{ background: 'var(--color-bg-subtle)' }}
                      >
                        <Link2 size={18} className="text-text-muted" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {p.message || '(Sans description)'}
                      </div>
                      <div className="text-xs text-text-muted">{p.id}</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      readOnly
                      className="flex-shrink-0"
                    />
                  </button>
                )
              })
            )}
          </div>
          <div
            className="flex justify-between gap-2 p-4"
            style={{ borderTop: '1px solid var(--color-border-default)' }}
          >
            <Button icon={<ArrowLeft size={14} />} onClick={() => setStep('page')}>
              Retour
            </Button>
            <Button
              type="primary"
              disabled={selectedPostIds.size === 0}
              loading={saving}
              onClick={handleSave}
            >
              Lier ({selectedPostIds.size})
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
