import { useMemo } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Button } from 'antd'
import { PostList } from './post-list'
import { CommentThread } from './comment-thread'
import { EmptyComments } from './empty-comments'
import { PostListSkeleton, CommentThreadSkeleton } from './comments-skeleton'
import type { Post } from './mock-data'

interface CommentsLayoutProps {
  posts: Post[]
  loading?: boolean
}

export function CommentsLayout({ posts, loading = false }: CommentsLayoutProps) {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { post?: string }
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

      {/* Right: comment thread */}
      <div
        className={`comments-split__right ${selectedPost ? 'comments-split__right--visible' : ''}`}
      >
        {selectedPost ? <CommentThread post={selectedPost} /> : <EmptyComments />}
      </div>
    </div>
  )
}
