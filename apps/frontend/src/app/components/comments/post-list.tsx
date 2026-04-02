import { Badge } from 'antd'
import { ImagePlaceholderIcon } from '@app/components/icons/social-icons'
import type { Post } from './mock-data'

interface PostListProps {
  posts: Post[]
  selectedPostId?: string
  onSelect: (post: Post) => void
}

function PostAvatar({ post }: { post: Post }) {
  return (
    <div className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-bg-muted">
      <ImagePlaceholderIcon width={20} height={20} className="text-text-muted" />
      {post.imageUrl && (
        <img
          src={post.imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full rounded-lg object-cover"
        />
      )}
    </div>
  )
}

export function PostList({ posts, selectedPostId, onSelect }: PostListProps) {
  const sorted = [...posts].sort((a, b) => {
    if (a.unreadComments > 0 && b.unreadComments === 0) return -1
    if (a.unreadComments === 0 && b.unreadComments > 0) return 1
    return 0
  })

  return (
    <div className="flex flex-col">
      {sorted.map((post) => {
        const isSelected = post.id === selectedPostId
        const hasUnread = post.unreadComments > 0
        const displayText = post.content || 'Post sans message'

        return (
          <button
            key={post.id}
            type="button"
            onClick={() => onSelect(post)}
            className={`comments-post-item ${isSelected ? 'comments-post-item--active' : ''}`}
          >
            <Badge dot={hasUnread} offset={[-4, 4]} color="#111b21">
              <PostAvatar post={post} />
            </Badge>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                className={`truncate text-sm ${post.content ? 'text-text-primary' : 'italic text-text-muted'}`}
              >
                {displayText}
              </span>
              <span
                className={`text-xs ${hasUnread ? 'font-semibold text-text-primary' : 'text-text-muted'}`}
              >
                {hasUnread
                  ? `${post.unreadComments} non lu${post.unreadComments > 1 ? 's' : ''}`
                  : `${post.totalComments} commentaire${post.totalComments > 1 ? 's' : ''}`}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
