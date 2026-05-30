import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Modal, Button, Empty, Spin, Alert, message } from 'antd'
import { ExternalLink, Trash2, AlertCircle } from 'lucide-react'
import { catalogApi, type PostLink } from '@app/lib/api/agent-api'

interface LinkedPostsModalProps {
  open: boolean
  catalogId: string
  /** Either a product or a collection — the modal handles both. */
  entity: { kind: 'product' | 'collection'; id: string; name?: string } | null
  onClose: () => void
}

const PAGE_SIZE = 10

export function LinkedPostsModal({ open, catalogId, entity, onClose }: LinkedPostsModalProps) {
  const qc = useQueryClient()
  const [limit, setLimit] = useState(PAGE_SIZE)

  const queryKey = entity
    ? (['post-links', catalogId, entity.kind, entity.id, limit] as const)
    : (['post-links-empty'] as const)

  const linksQuery = useQuery({
    queryKey,
    queryFn: () => {
      if (!entity) return Promise.resolve({ total: 0, links: [] })
      if (entity.kind === 'product') {
        return catalogApi.listProductPostLinks(catalogId, entity.id, { limit, offset: 0 })
      }
      return catalogApi.listCollectionPostLinks(catalogId, entity.id, { limit, offset: 0 })
    },
    enabled: open && !!entity,
  })

  const data = linksQuery.data
  const links = data?.links ?? []
  const hasMore = data ? data.total > links.length : false

  // A link is considered "broken" when the underlying post has no message AND
  // no permalink — meaning we couldn't refresh it from the provider. The cron
  // that refreshes posts marks them this way on 404. Keep heuristic loose.
  const brokenLinks = links.filter(
    (l) => !l.post.message && !l.post.imageUrl && !l.post.permalinkUrl,
  )

  const handleDelete = async (link: PostLink) => {
    if (!entity) return
    try {
      if (entity.kind === 'product') {
        await catalogApi.deleteProductPostLink(catalogId, link.id)
      } else {
        await catalogApi.deleteCollectionPostLink(catalogId, link.id)
      }
      message.success('Liaison supprimée')
      qc.invalidateQueries({ queryKey: ['post-links', catalogId, entity.kind, entity.id] })
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const handleCleanupBroken = async () => {
    if (!entity || brokenLinks.length === 0) return
    try {
      await Promise.all(
        brokenLinks.map((l) =>
          entity.kind === 'product'
            ? catalogApi.deleteProductPostLink(catalogId, l.id)
            : catalogApi.deleteCollectionPostLink(catalogId, l.id),
        ),
      )
      message.success(`${brokenLinks.length} liaison(s) supprimée(s)`)
      qc.invalidateQueries({ queryKey: ['post-links', catalogId, entity.kind, entity.id] })
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={entity?.name ? `Posts liés – ${entity.name}` : 'Posts liés'}
      footer={null}
      width={560}
    >
      {linksQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spin />
        </div>
      ) : links.length === 0 ? (
        <Empty description="Aucun post lié" style={{ padding: '32px 16px' }} />
      ) : (
        <div className="flex flex-col gap-3">
          {brokenLinks.length > 0 && (
            <Alert
              type="warning"
              showIcon
              icon={<AlertCircle size={16} />}
              message={`${brokenLinks.length} post${
                brokenLinks.length > 1 ? 's' : ''
              } n'existe${brokenLinks.length > 1 ? 'nt' : ''} plus.`}
              description={
                <Button size="small" onClick={handleCleanupBroken}>
                  Supprimer ces liaisons
                </Button>
              }
            />
          )}

          {links.map((l) => (
            <div
              key={l.id}
              className="flex gap-3 p-3 rounded-lg"
              style={{ border: '1px solid var(--color-border-default)' }}
            >
              {l.post.imageUrl ? (
                <img
                  src={l.post.imageUrl}
                  alt=""
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 8,
                    objectFit: 'cover',
                    flexShrink: 0,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 8,
                    background: 'var(--color-bg-subtle)',
                    flexShrink: 0,
                  }}
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {l.post.message || '(Sans description)'}
                </div>
                <div className="text-xs text-text-muted">
                  {l.socialAccount.pageName || l.socialAccount.provider} ·{' '}
                  {new Date(l.createdAt).toLocaleDateString('fr-FR')}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {l.post.permalinkUrl && (
                  <Button
                    type="text"
                    size="small"
                    icon={<ExternalLink size={14} />}
                    href={l.post.permalinkUrl}
                    target="_blank"
                    aria-label="Voir le post"
                  />
                )}
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<Trash2 size={14} />}
                  onClick={() => handleDelete(l)}
                  aria-label="Supprimer la liaison"
                />
              </div>
            </div>
          ))}

          {hasMore && (
            <Button block onClick={() => setLimit((l) => l + PAGE_SIZE)}>
              Afficher plus
            </Button>
          )}
        </div>
      )}
    </Modal>
  )
}
