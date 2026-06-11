import { useTranslation } from 'react-i18next'
import { Avatar, Button, Tooltip } from 'antd'
import { MessageSquare, EyeOff, Trash2 } from 'lucide-react'
import { ImagePlaceholderIcon } from '@app/components/icons/social-icons'
import { getAvatarColor } from '@app/lib/avatar-color'
import type { Comment, Post } from '../mock-data'
import { formatTime, renderCommentMessage, type Provider, type Thread } from './helpers'
import { CommentOptionsMenu, PostOptionsMenu, UserProfilePopover } from './menus'

/* ── Comment bubble ── */

function CommentBubble({
  comment,
  provider,
  accountId,
  isReply,
  userById,
}: {
  comment: Comment
  provider: Provider
  accountId: string
  isReply?: boolean
  userById: Map<string, string>
}) {
  const { t } = useTranslation()
  const isPage = comment.isPageReply
  const status = comment.status
  const isHidden = status === 'HIDDEN'
  const isDeleted = status === 'DELETED'
  const isClickable = !isPage

  const avatarEl = !isPage ? (
    <Avatar
      src={comment.fromAvatar}
      size={isReply ? 24 : 32}
      className={`flex-shrink-0 ${isClickable ? 'cursor-pointer' : ''}`}
      style={{ backgroundColor: getAvatarColor(comment.fromId || comment.fromName) }}
    >
      {comment.fromName?.[0]}
    </Avatar>
  ) : (
    <div
      className={`flex flex-shrink-0 items-center justify-center rounded-full bg-bg-subtle ${isReply ? 'h-6 w-6' : 'h-8 w-8'}`}
    >
      <MessageSquare size={isReply ? 12 : 14} className="text-text-muted" />
    </div>
  )

  return (
    <div className="flex gap-3">
      {isClickable ? (
        <UserProfilePopover comment={comment} provider={provider} accountId={accountId}>
          <span className="flex-shrink-0 cursor-pointer">{avatarEl}</span>
        </UserProfilePopover>
      ) : (
        avatarEl
      )}
      <div className="min-w-0 flex-1">
        {!isPage && (
          <div className={`font-semibold text-text-primary ${isReply ? 'text-xs' : 'text-sm'}`}>
            <UserProfilePopover comment={comment} provider={provider} accountId={accountId}>
              <span className="cursor-pointer hover:underline">{comment.fromName}</span>
            </UserProfilePopover>
          </div>
        )}
        <div className={`mt-0.5 text-text-primary ${isReply ? 'text-xs' : 'text-sm'}`}>
          {renderCommentMessage(comment.message, userById)}
          <span className="whitespace-nowrap text-xs text-text-muted">
            {' '}
            · {formatTime(comment.createdTime)}
            {isPage && comment.fromId === 'ai' && ` (${t('comments.by_ai')})`}
          </span>
        </div>
        {(isHidden || isDeleted) && (
          <Tooltip title={comment.actionReason} placement="bottom">
            <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs text-red-500">
              {isHidden ? (
                <EyeOff size={12} className="flex-shrink-0" />
              ) : (
                <Trash2 size={12} className="flex-shrink-0" />
              )}
              <span className="font-semibold flex-shrink-0">
                {isHidden ? t('comments.hidden_status') : t('comments.deleted_status')}
              </span>
              {comment.actionReason && (
                <span className="truncate font-normal text-text-muted">
                  : {comment.actionReason}
                </span>
              )}
            </div>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

/* ── Thread block ── */

export function ThreadBlock({
  thread,
  provider,
  accountId,
  isConfigured: _isConfigured,
  onReplyClick,
  onHide,
  onUnhide,
  onDelete,
  userById,
}: {
  thread: Thread
  provider: Provider
  accountId: string
  isConfigured: boolean
  onReplyClick: (comment: Comment) => void
  onHide?: (commentId: string) => Promise<void>
  onUnhide?: (commentId: string) => Promise<void>
  onDelete?: (commentId: string) => Promise<void>
  userById: Map<string, string>
}) {
  const { t } = useTranslation()
  const isRootDeleted = thread.root.status === 'DELETED'
  const hasReplies = thread.replies.length > 0

  return (
    <div className="px-4 py-3">
      <CommentBubble
        comment={thread.root}
        provider={provider}
        accountId={accountId}
        userById={userById}
      />

      {hasReplies && (
        <div className="thread-replies">
          {thread.replies.map((reply, i) => (
            <div
              key={reply.id}
              className={`thread-reply ${i === thread.replies.length - 1 ? 'thread-reply--last' : ''}`}
            >
              <CommentBubble
                comment={reply}
                provider={provider}
                accountId={accountId}
                isReply
                userById={userById}
              />
            </div>
          ))}
        </div>
      )}

      {!isRootDeleted && (
        <div className="mt-2 ml-10 flex items-center gap-1">
          <Button
            type="text"
            size="small"
            onClick={() => onReplyClick(thread.root)}
            icon={<MessageSquare size={12} />}
          >
            {t('comments.reply')}
          </Button>
          <CommentOptionsMenu
            comment={thread.root}
            onHide={onHide}
            onUnhide={onUnhide}
            onDelete={onDelete}
          />
        </div>
      )}
    </div>
  )
}

/* ── Post preview header ── */

export function PostPreviewHeader({ post }: { post: Post }) {
  const { t } = useTranslation()
  const displayText = post.message || t('comments.post_no_message')

  return (
    <div className="flex items-center gap-2 border-b border-border-subtle px-2 py-2">
      <div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-bg-muted">
        <ImagePlaceholderIcon width={18} height={18} className="text-text-muted" />
        {post.imageUrl && (
          <img
            src={post.imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full rounded-lg object-cover"
          />
        )}
      </div>
      <p
        className={`m-0 min-w-0 flex-1 truncate text-sm ${post.message ? 'text-text-secondary' : 'italic text-text-muted'}`}
      >
        {displayText}
      </p>
      <PostOptionsMenu post={post} />
    </div>
  )
}
