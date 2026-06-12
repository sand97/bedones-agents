import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Modal, Button, Select, Spin, Empty, Input, Checkbox, message } from 'antd'
import { ArrowLeft, Link2, Search } from 'lucide-react'
import { catalogApi, type Catalog, type Collection, type Product } from '@app/lib/api/agent-api'
import {
  getSocialAccounts,
  getProviderPostsForAccount,
  type SocialAccountResponse,
} from '@app/lib/api'
import {
  ProductCollectionPicker,
  type PickerEntity,
} from '@app/components/catalog/product-collection-picker'
import { FacebookIcon, InstagramIcon, TikTokIcon } from '@app/components/icons/social-icons'

interface PostLinkFlowModalProps {
  open: boolean
  catalog: Catalog
  organisationId: string
  onClose: () => void
  onSaved: () => void
  placeholderProducts?: Product[]
  placeholderCollections?: Collection[]
  /** Pre-select these entities (e.g. the article the user is already viewing). */
  initialSelected?: PickerEntity[]
  /** Start on this step (e.g. 'page' when the article is already chosen). */
  initialStep?: Step
}

function ProviderAvatar({
  provider,
  profilePictureUrl,
  size = 20,
}: {
  provider: string
  profilePictureUrl?: string | null
  size?: number
}) {
  if (profilePictureUrl) {
    return (
      <img
        src={profilePictureUrl}
        alt=""
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }}
      />
    )
  }
  const style = { width: size, height: size }
  if (provider === 'FACEBOOK') return <FacebookIcon style={{ ...style, color: '#1877F2' }} />
  if (provider === 'INSTAGRAM') return <InstagramIcon style={{ ...style, color: '#E1306C' }} />
  if (provider === 'TIKTOK') return <TikTokIcon style={{ ...style, color: '#111b21' }} />
  return null
}

type Step = 'pick' | 'page' | 'posts'

export function PostLinkFlowModal({
  open,
  catalog,
  organisationId,
  onClose,
  onSaved,
  placeholderProducts,
  placeholderCollections,
  initialSelected,
  initialStep,
}: PostLinkFlowModalProps) {
  const [step, setStep] = useState<Step>('pick')
  const [selected, setSelected] = useState<PickerEntity[]>([])
  const [accountId, setAccountId] = useState<string | undefined>(undefined)
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set())
  const [postSearch, setPostSearch] = useState('')
  const [saving, setSaving] = useState(false)

  // Seed the flow each time it opens: pre-select the caller's entities and jump
  // to the requested step (e.g. straight to page selection when the article is
  // already known). Keyed on `open` only, so a parent re-render won't clobber the
  // user's in-progress selection.
  useEffect(() => {
    if (!open) return
    setSelected(initialSelected ?? [])
    setStep(initialStep ?? 'pick')
  }, [open])

  const accountsQuery = useQuery({
    queryKey: ['social-accounts', organisationId],
    queryFn: () => getSocialAccounts(organisationId),
    enabled: open,
  })

  const postsQuery = useQuery({
    queryKey: ['provider-posts', accountId, postSearch],
    queryFn: () =>
      getProviderPostsForAccount(accountId!, {
        search: postSearch || undefined,
        limit: 50,
      }),
    enabled: !!accountId && step === 'posts',
  })

  // Pages that can serve a post feed. WhatsApp numbers don't expose one;
  // everything else (FB, IG, TikTok) does.
  const linkableAccounts = useMemo(
    () =>
      (accountsQuery.data ?? []).filter((a: SocialAccountResponse) => a.provider !== 'WHATSAPP'),
    [accountsQuery.data],
  )

  const accountOptions = useMemo(
    () =>
      linkableAccounts.map((a: SocialAccountResponse) => ({
        value: a.id,
        label: (
          <span className="flex items-center gap-2">
            <ProviderAvatar
              provider={a.provider}
              profilePictureUrl={a.profilePictureUrl}
              size={18}
            />
            <span className="truncate">{a.pageName || a.username || a.provider}</span>
          </span>
        ),
      })),
    [linkableAccounts],
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
    setPostSearch('')
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

  const posts = postsQuery.data?.posts ?? []

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      destroyOnHidden
      width={560}
      centered
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
          placeholderProducts={placeholderProducts}
          placeholderCollections={placeholderCollections}
        />
      )}

      {step === 'page' && (
        <div className="flex flex-col" style={{ minHeight: 320 }}>
          <div className="p-6">
            <h3 className="mb-2 text-base font-semibold">Choisir une page</h3>
            <p className="mb-4 text-sm text-text-muted">
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
            className="mt-auto flex justify-between gap-2 p-4"
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
          <div className="flex flex-col gap-3 border-b border-[var(--color-border-default)] p-4">
            <div>
              <h3 className="m-0 text-base font-semibold">Sélectionner des posts</h3>
              <p className="m-0 text-xs text-text-muted">
                Sélection multiple — un même post peut être lié à plusieurs produits/collections.
              </p>
            </div>
            <Input
              allowClear
              placeholder="Rechercher dans les posts…"
              prefix={<Search size={16} className="text-text-muted" />}
              value={postSearch}
              onChange={(e) => setPostSearch(e.target.value)}
            />
          </div>
          <div className="flex-1 overflow-y-auto" style={{ maxHeight: 360 }}>
            {postsQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Spin />
              </div>
            ) : posts.length === 0 ? (
              <Empty description="Aucun post sur cette page" style={{ padding: '48px 16px' }} />
            ) : (
              posts.map((p) => {
                const isSelected = selectedPostIds.has(p.id)
                return (
                  <div
                    key={p.id}
                    className="article-picker-item"
                    onClick={() => togglePost(p.id)}
                    style={{
                      background: isSelected ? 'var(--color-bg-subtle)' : undefined,
                      cursor: 'pointer',
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
                      <div className="truncate text-sm font-medium">
                        {p.message || '(Sans description)'}
                      </div>
                      {p.createdTime && (
                        <div className="text-xs text-text-muted">
                          {new Date(p.createdTime).toLocaleDateString('fr-FR')}
                        </div>
                      )}
                    </div>
                    <Checkbox checked={isSelected} className="flex-shrink-0" />
                  </div>
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
