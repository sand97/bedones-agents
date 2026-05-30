import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Button } from 'antd'
import { CheckCircle, MessageSquare, Settings, Wrench } from 'lucide-react'
import { SocialSetup } from '@app/components/social/social-setup'
import { CommentsIcon } from '@app/components/icons/social-icons'
import { useLayout } from '@app/contexts/layout-context'
import { PostList } from './post-list'
import { CommentThread } from './comment-thread'
import { CommentsConfigModal } from './comments-config'
import { PostListSkeleton, CommentThreadSkeleton } from './comments-skeleton'
import type { Post } from './mock-data'
import type { PageSettingsResponse } from '@app/lib/api'

const EMPTY_ICON_SIZE = 40

interface CommentsLayoutProps {
  posts: Post[]
  provider: 'facebook' | 'instagram' | 'tiktok'
  loading?: boolean
  pageName?: string
  accountId?: string
  organisationId?: string
  /** Whether the page settings have been configured by the user */
  isConfigured?: boolean
  /** Pre-loaded settings to populate the config modal */
  initialSettings?: PageSettingsResponse
  onReply?: (commentId: string, message: string) => Promise<void>
  onComment?: (postId: string, message: string) => Promise<void>
  onHide?: (commentId: string) => Promise<void>
  onUnhide?: (commentId: string) => Promise<void>
  onDelete?: (commentId: string) => Promise<void>
  onMarkRead?: (postId: string) => Promise<void>
  onSettingsSaved?: () => void
}

export function CommentsLayout({
  posts,
  provider,
  loading = false,
  pageName,
  accountId,
  organisationId,
  isConfigured = false,
  initialSettings,
  onReply,
  onComment,
  onHide,
  onUnhide,
  onDelete,
  onMarkRead,
  onSettingsSaved,
}: CommentsLayoutProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { isDesktop } = useLayout()
  const search = useSearch({ strict: false }) as { post?: string }
  const [configOpen, setConfigOpen] = useState(false)
  const [mobileShowComments, setMobileShowComments] = useState(false)
  const selectedPostId = search.post
  const filter =
    (search as { filter?: string }).filter === 'unread' ? ('unread' as const) : ('all' as const)

  const filteredPosts = useMemo(() => {
    if (filter === 'unread') return posts.filter((p) => p.unreadComments > 0)
    return posts
  }, [posts, filter])

  const selectedPost = posts.find((p) => p.id === selectedPostId)

  const selectPost = (post: Post) => {
    navigate({
      search: (prev: Record<string, unknown>) => ({ ...prev, post: post.id }) as never,
    })
    // Mark as read when selecting a post
    if (post.unreadComments > 0 && onMarkRead) {
      onMarkRead(post.id)
    }
  }

  const setFilter = (f: 'all' | 'unread') => {
    navigate({
      search: (prev: Record<string, unknown>) =>
        ({ ...prev, filter: f === 'unread' ? 'unread' : undefined }) as never,
    })
  }

  if (loading) {
    return (
      <div className="flex flex-1 min-h-0">
        <div className="w-[360px] max-[1023px]:w-full flex-shrink-0 flex flex-col border-r border-border-subtle overflow-hidden">
          <PostListSkeleton />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <CommentThreadSkeleton />
        </div>
      </div>
    )
  }

  // On mobile, when not configured and user hasn't asked to see comments, show config setup
  const showMobileConfigSetup = !isDesktop && !isConfigured && !mobileShowComments && !selectedPost

  if (showMobileConfigSetup) {
    return (
      <>
        <SocialSetup
          icon={<CheckCircle size={EMPTY_ICON_SIZE} strokeWidth={1.5} />}
          color="var(--color-text-muted)"
          title={t('comments.setup_description')}
          description=""
          buttonLabel={t('comments.setup_button')}
          buttonIcon={<Settings size={18} />}
          onAction={() => setConfigOpen(true)}
          secondaryButtonLabel={posts.length > 0 ? t('comments.view_comments') : undefined}
          secondaryButtonIcon={<MessageSquare size={18} />}
          onSecondaryAction={() => setMobileShowComments(true)}
          actionsLayout="stack"
        />
        {pageName && accountId && (
          <CommentsConfigModal
            pageName={pageName}
            accountId={accountId}
            organisationId={organisationId}
            open={configOpen}
            onClose={() => setConfigOpen(false)}
            onSaved={onSettingsSaved}
            initialSettings={initialSettings}
          />
        )}
      </>
    )
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* Left: post list */}
      <div
        className={`w-[360px] max-[1023px]:w-full flex-shrink-0 flex flex-col border-r border-border-subtle overflow-hidden${selectedPost ? ' max-[1023px]:hidden' : ''}`}
      >
        <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
          <Button
            type={filter === 'all' ? 'primary' : 'default'}
            size="small"
            onClick={() => setFilter('all')}
            className="h-7! px-3! text-[13px]! leading-7!"
          >
            {t('comments.all')}
          </Button>
          <Button
            type={filter === 'unread' ? 'primary' : 'default'}
            size="small"
            onClick={() => setFilter('unread')}
            className="h-7! px-3! text-[13px]! leading-7!"
          >
            {t('comments.unread')}
          </Button>
          <div className="ml-auto">
            <Button
              type="text"
              size="small"
              icon={<Wrench size={16} />}
              onClick={() => setConfigOpen(true)}
            >
              {t('chat.tools')}
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <PostList posts={filteredPosts} selectedPostId={selectedPostId} onSelect={selectPost} />
        </div>
      </div>

      {/* Right: comment thread or config setup */}
      <div
        className={`flex-1 flex-col min-w-0 max-[1023px]:hidden${selectedPost ? ' max-[1023px]:flex' : ''} flex`}
      >
        {selectedPost ? (
          <CommentThread
            post={selectedPost}
            provider={provider}
            accountId={accountId || ''}
            isConfigured={isConfigured}
            onReply={onReply}
            onComment={onComment}
            onHide={onHide}
            onUnhide={onUnhide}
            onDelete={onDelete}
          />
        ) : !isConfigured ? (
          <SocialSetup
            icon={<CheckCircle size={EMPTY_ICON_SIZE} strokeWidth={1.5} />}
            color="var(--color-text-muted)"
            title={t('comments.setup_description')}
            description=""
            buttonLabel={t('comments.setup_button')}
            buttonIcon={<Settings size={18} />}
            onAction={() => setConfigOpen(true)}
          />
        ) : (
          <SocialSetup
            icon={<CommentsIcon width={EMPTY_ICON_SIZE} height={EMPTY_ICON_SIZE} />}
            color="var(--color-text-muted)"
            title={t('comments.select_post')}
            description={t('comments.select_post_desc')}
            buttonLabel={pageName ? t('comments.edit_config') : undefined}
            buttonType="default"
            buttonIcon={<Settings size={18} />}
            onAction={() => setConfigOpen(true)}
          />
        )}
      </div>

      {pageName && accountId && (
        <CommentsConfigModal
          pageName={pageName}
          accountId={accountId}
          organisationId={organisationId}
          open={configOpen}
          onClose={() => setConfigOpen(false)}
          onSaved={onSettingsSaved}
          initialSettings={initialSettings}
        />
      )}
    </div>
  )
}
