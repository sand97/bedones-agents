import { useMemo, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Button } from 'antd'
import { Settings } from 'lucide-react'
import { SocialSetup } from '@app/components/social/social-setup'
import { CommentsIcon } from '@app/components/icons/social-icons'
import { PostList } from './post-list'
import { CommentThread } from './comment-thread'
import { CommentsConfigModal } from './comments-config'
import { PostListSkeleton, CommentThreadSkeleton } from './comments-skeleton'
import type { Post } from './mock-data'

const EMPTY_ICON_SIZE = 40

interface CommentsLayoutProps {
  posts: Post[]
  loading?: boolean
  pageName?: string
}

export function CommentsLayout({ posts, loading = false, pageName }: CommentsLayoutProps) {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { post?: string }
  const [configOpen, setConfigOpen] = useState(false)
  const selectedPostId = search.post
  const filter =
    (search as { filter?: string }).filter === 'unread' ? ('unread' as const) : ('all' as const)

  const filteredPosts = useMemo(() => {
    if (filter === 'unread') return posts.filter((p) => p.unreadComments > 0)
    return posts
  }, [posts, filter])

  const selectedPost = posts.find((p) => p.id === selectedPostId)

  const selectPost = (post: Post) => {
    navigate({ search: { post: post.id } as never })
  }

  const setFilter = (f: 'all' | 'unread') => {
    navigate({
      search: (f === 'unread' ? { filter: 'unread' } : {}) as never,
    })
  }

  if (loading) {
    return (
      <div className="comments-split">
        <div className="comments-split__left">
          <PostListSkeleton />
        </div>
        <div className="comments-split__right comments-split__right--visible">
          <CommentThreadSkeleton />
        </div>
      </div>
    )
  }

  return (
    <div className="comments-split">
      {/* Left: post list */}
      <div
        className={`comments-split__left ${selectedPost ? 'comments-split__left--hidden-mobile' : ''}`}
      >
        <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
          <Button
            type={filter === 'all' ? 'primary' : 'default'}
            size="small"
            onClick={() => setFilter('all')}
            className="comments-filter-btn"
          >
            Tout
          </Button>
          <Button
            type={filter === 'unread' ? 'primary' : 'default'}
            size="small"
            onClick={() => setFilter('unread')}
            className="comments-filter-btn"
          >
            Non lus
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <PostList posts={filteredPosts} selectedPostId={selectedPostId} onSelect={selectPost} />
        </div>
      </div>

      {/* Right: comment thread or empty */}
      <div
        className={`comments-split__right ${selectedPost ? 'comments-split__right--visible' : ''}`}
      >
        {selectedPost ? (
          <CommentThread post={selectedPost} />
        ) : (
          <SocialSetup
            icon={<CommentsIcon width={EMPTY_ICON_SIZE} height={EMPTY_ICON_SIZE} />}
            color="var(--color-text-muted)"
            title="Sélectionnez un post"
            description="Choisissez un post dans la liste pour voir ses commentaires"
            buttonLabel={pageName ? 'Modifier la configuration' : undefined}
            buttonType="default"
            buttonIcon={<Settings size={18} />}
            onAction={() => setConfigOpen(true)}
          />
        )}
      </div>

      {pageName && (
        <CommentsConfigModal
          pageName={pageName}
          open={configOpen}
          onClose={() => setConfigOpen(false)}
        />
      )}
    </div>
  )
}
