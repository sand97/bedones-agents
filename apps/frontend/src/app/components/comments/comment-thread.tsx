import { useState, useMemo, useRef, useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, Button, Input, Popover, Spin, Tooltip, App } from 'antd'
import { MessageSquare, Send, Eye, EyeOff, Trash2, ExternalLink } from 'lucide-react'
import dayjs from 'dayjs'
import { ImagePlaceholderIcon, OptionsIcon } from '@app/components/icons/social-icons'
import { $api } from '@app/lib/api/$api'
import { getAvatarColor } from '@app/lib/avatar-color'
import type { Comment, Post } from './mock-data'

type Provider = 'facebook' | 'instagram' | 'tiktok'

/* ── User profile popover ── */

function UserProfilePopover({
  comment,
  provider: _provider,
  accountId,
  children,
}: {
  comment: Comment
  provider: Provider
  accountId: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()

  const { data } = $api.useQuery(
    'get',
    '/social/accounts/{accountId}/user-stats/{fromId}',
    { params: { path: { accountId, fromId: comment.fromId } } },
    { enabled: open },
  )

  // const profileUrl = getProfileUrl(provider, comment)

  const content = !data ? (
    <div className="flex w-56 items-center justify-center py-4">
      <Spin size="small" />
    </div>
  ) : (
    <div className="w-56">
      <div className="flex items-center gap-2.5 pb-3">
        <Avatar src={comment.fromAvatar} size={36}>
          {comment.fromName?.[0]}
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{comment.fromName}</div>
        </div>
      </div>
      <div className="flex flex-col gap-1 text-xs text-text-secondary">
        <div className="flex items-center justify-between">
          <span>{t('comments.total_comments')}</span>
          <span className="font-semibold">{data.totalComments}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1">
            <EyeOff size={11} /> {t('comments.hidden_label')}
          </span>
          <span className="font-semibold">{data.hiddenComments}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Trash2 size={11} /> {t('comments.deleted_label')}
          </span>
          <span className="font-semibold">{data.deletedComments}</span>
        </div>
      </div>
    </div>
  )

  return (
    <Popover
      content={content}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomLeft"
      arrow={false}
    >
      {children}
    </Popover>
  )
}

interface CommentThreadProps {
  post: Post
  provider: Provider
  accountId: string
  isConfigured?: boolean
  onReply?: (commentId: string, message: string) => Promise<void>
  onComment?: (postId: string, message: string) => Promise<void>
  onHide?: (commentId: string) => Promise<void>
  onUnhide?: (commentId: string) => Promise<void>
  onDelete?: (commentId: string) => Promise<void>
}

interface Thread {
  root: Comment
  replies: Comment[]
}

function formatTime(timestamp: string): string {
  return dayjs(timestamp).format('HH[h]mm')
}

function formatDateLabel(timestamp: string, t: (key: string) => string): string {
  const date = dayjs(timestamp)
  const now = dayjs()

  if (date.isSame(now, 'day')) return t('date.today')
  if (date.isSame(now.subtract(1, 'day'), 'day')) return t('date.yesterday')
  return date.format('D MMMM')
}

function buildThreads(comments: Comment[]): Thread[] {
  // Dedupe by id — websocket invalidations + optimistic refetch can deliver
  // the same comment twice, which then renders as a visible duplicate.
  const seen = new Set<string>()
  const unique: Comment[] = []
  for (const c of comments) {
    if (seen.has(c.id)) continue
    seen.add(c.id)
    unique.push(c)
  }

  const roots = unique.filter((c) => !c.parentId)
  const replyMap = new Map<string, Comment[]>()

  for (const c of unique) {
    if (c.parentId) {
      const arr = replyMap.get(c.parentId) || []
      arr.push(c)
      replyMap.set(c.parentId, arr)
    }
  }

  return roots.map((root) => ({
    root,
    replies: replyMap.get(root.id) || [],
  }))
}

/** Map fromId → fromName for every comment in a post, used to resolve `@[USER_ID]` mentions. */
function buildUserNameMap(comments: Comment[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const c of comments) {
    if (c.fromId && c.fromName && !map.has(c.fromId)) {
      map.set(c.fromId, c.fromName)
    }
  }
  return map
}

/**
 * Facebook embeds user tags as `@[USER_ID]` in the raw comment text.
 * Replace each occurrence with the resolved username (in bold) so the reader
 * sees a readable name instead of a numeric ID.
 */
function renderCommentMessage(message: string, userById: Map<string, string>): ReactNode {
  if (!message) return null
  const regex = /@\[([^\]]+)\]/g
  const parts: ReactNode[] = []
  let lastIndex = 0
  let mentionKey = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(message)) !== null) {
    if (match.index > lastIndex) {
      parts.push(message.slice(lastIndex, match.index))
    }
    const userId = match[1]
    const name = userById.get(userId) ?? userId
    parts.push(
      <span key={`mention-${mentionKey++}`} className="font-semibold text-text-primary">
        @{name}
      </span>,
    )
    lastIndex = regex.lastIndex
  }
  if (lastIndex === 0) return message
  if (lastIndex < message.length) {
    parts.push(message.slice(lastIndex))
  }
  return parts
}

function groupThreadsByDate(
  threads: Thread[],
  t: (key: string) => string,
): { date: string; threads: Thread[] }[] {
  const groups: { date: string; threads: Thread[] }[] = []

  for (const thread of threads) {
    const label = formatDateLabel(thread.root.createdTime, t)
    const last = groups[groups.length - 1]

    if (last && last.date === label) {
      last.threads.push(thread)
    } else {
      groups.push({ date: label, threads: [thread] })
    }
  }

  return groups
}

/* ── Options popover for post header ── */

function PostOptionsMenu({ permalinkUrl }: { permalinkUrl?: string }) {
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()

  if (!permalinkUrl) return null

  return (
    <Popover
      content={
        <div className="w-52">
          <Button
            type="text"
            block
            onClick={() => {
              window.open(permalinkUrl, '_blank')
              setOpen(false)
            }}
            icon={<ExternalLink size={14} />}
            className="py-2.5! whitespace-nowrap"
          >
            {t('comments.view_original_post')}
          </Button>
        </div>
      }
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomLeft"
      overlayClassName="org-switcher-popover"
      arrow={false}
    >
      <Button type="text" icon={<OptionsIcon width={18} height={18} />} className="flex-shrink-0" />
    </Popover>
  )
}

/* ── Options popover for comment threads ── */

function CommentOptionsMenu({
  comment,
  onHide,
  onUnhide,
  onDelete,
}: {
  comment: Comment
  onHide?: (commentId: string) => Promise<void>
  onUnhide?: (commentId: string) => Promise<void>
  onDelete?: (commentId: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState<'hide' | 'unhide' | 'delete' | null>(null)
  const { message: messageApi } = App.useApp()
  const { t } = useTranslation()
  const isHidden = comment.status === 'HIDDEN'
  const isDeleted = comment.status === 'DELETED'

  const handleHide = async () => {
    if (!onHide) return
    setLoading('hide')
    try {
      await onHide(comment.id)
      messageApi.success(t('comments.hidden'))
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setLoading(null)
      setOpen(false)
    }
  }

  const handleUnhide = async () => {
    if (!onUnhide) return
    setLoading('unhide')
    try {
      await onUnhide(comment.id)
      messageApi.success(t('comments.unhidden'))
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setLoading(null)
      setOpen(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete) return
    setLoading('delete')
    try {
      await onDelete(comment.id)
      messageApi.success(t('comments.deleted'))
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setLoading(null)
      setOpen(false)
    }
  }

  return (
    <Popover
      content={
        <div className="w-52">
          {!isHidden && !isDeleted && (
            <Button
              type="text"
              block
              loading={loading === 'hide'}
              onClick={handleHide}
              icon={<EyeOff size={14} />}
              className="py-2.5!"
            >
              {t('comments.hide')}
            </Button>
          )}
          {isHidden && (
            <Button
              type="text"
              block
              loading={loading === 'unhide'}
              onClick={handleUnhide}
              icon={<Eye size={14} />}
              className="py-2.5!"
            >
              {t('comments.unhide')}
            </Button>
          )}
          {!isDeleted && (
            <Button
              type="text"
              danger
              block
              loading={loading === 'delete'}
              onClick={handleDelete}
              icon={<Trash2 size={14} />}
              className="py-2.5!"
            >
              {t('common.delete')}
            </Button>
          )}
        </div>
      }
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomLeft"
      overlayClassName="org-switcher-popover"
      arrow={false}
    >
      <Button type="text" size="small" icon={<OptionsIcon width={14} height={14} />}>
        {t('comments.options')}
      </Button>
    </Popover>
  )
}

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

function ThreadBlock({
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
        <div className="relative ml-[15px] pl-[20px] mt-1">
          {thread.replies.map((reply, i) => {
            const isLast = i === thread.replies.length - 1
            return (
              <div
                key={reply.id}
                className={
                  isLast
                    ? "relative flex items-start pt-[6px] before:content-[''] before:absolute before:left-[-20px] before:top-0 before:h-[6px] before:w-[1.5px] before:bg-border-default after:content-[''] after:absolute after:left-[-20px] after:top-[6px] after:h-3 after:w-4 after:border-l-[1.5px] after:border-b-[1.5px] after:border-border-default after:rounded-bl-lg after:bg-transparent"
                    : "relative flex items-start pt-[6px] before:content-[''] before:absolute before:left-[-20px] before:top-0 before:bottom-0 before:w-[1.5px] before:bg-border-default after:content-[''] after:absolute after:left-[-20px] after:top-[18px] after:w-4 after:h-[1.5px] after:bg-border-default"
                }
              >
                <CommentBubble
                  comment={reply}
                  provider={provider}
                  accountId={accountId}
                  isReply
                  userById={userById}
                />
              </div>
            )
          })}
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

function PostPreviewHeader({ post }: { post: Post }) {
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
      <PostOptionsMenu permalinkUrl={post.permalinkUrl} />
    </div>
  )
}

/* ── Main component ── */

export function CommentThread({
  post,
  provider,
  accountId,
  isConfigured = true,
  onReply,
  onComment,
  onHide,
  onUnhide,
  onDelete,
}: CommentThreadProps) {
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { message: messageApi } = App.useApp()
  const { t } = useTranslation()

  const threads = useMemo(() => buildThreads(post.comments), [post.comments])
  const groups = useMemo(() => groupThreadsByDate(threads, t), [threads, t])
  const userById = useMemo(() => buildUserNameMap(post.comments), [post.comments])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [post.id])

  const handleReplyClick = (comment: Comment) => {
    setReplyTo(comment)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const clearReply = () => {
    setReplyTo(null)
  }

  const handleSend = async () => {
    if (!inputValue.trim()) return

    setSending(true)
    try {
      if (replyTo && onReply) {
        await onReply(replyTo.id, inputValue.trim())
      } else if (onComment) {
        await onComment(post.id, inputValue.trim())
      } else {
        return
      }
      setInputValue('')
      setReplyTo(null)
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : t('social.reply_error'))
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const placeholder = replyTo
    ? replyTo.fromName
      ? t('comments.reply_to_name', { name: replyTo.fromName })
      : t('comments.reply_to_comment')
    : t('comments.write_comment')

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PostPreviewHeader post={post} />

      {/* Scrollable threads area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.date}>
            <div className="flex items-center justify-center py-3">
              <span className="rounded-full bg-bg-subtle px-3 py-1 text-xs text-text-muted">
                {group.date}
              </span>
            </div>
            {group.threads.map((thread) => (
              <ThreadBlock
                key={thread.root.id}
                thread={thread}
                provider={provider}
                accountId={accountId}
                isConfigured={isConfigured}
                onReplyClick={handleReplyClick}
                onHide={onHide}
                onUnhide={onUnhide}
                onDelete={onDelete}
                userById={userById}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Fixed input at bottom */}
      <div className="flex-shrink-0 border-t border-border-subtle px-4 pt-3 pb-6">
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-bg-subtle px-3 py-2 text-xs text-text-secondary">
            <span className="min-w-0 flex-1 truncate">
              {t('comments.reply_to')}{' '}
              <strong>{replyTo.fromName || t('comments.a_comment')}</strong> :{' '}
              {renderCommentMessage(replyTo.message, userById)}
            </span>
            <Button type="text" size="small" onClick={clearReply} className="flex-shrink-0 p-0!">
              ✕
            </Button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Input.TextArea
            ref={inputRef}
            placeholder={placeholder}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            autoSize={{ minRows: 1, maxRows: 3 }}
            className="flex-1 min-w-0 rounded-2xl!"
          />
          <Button
            type="text"
            shape="circle"
            onClick={handleSend}
            disabled={!inputValue.trim()}
            loading={sending}
            icon={<Send strokeWidth={1.5} size={18} />}
            className="flex-shrink-0"
          />
        </div>
      </div>
    </div>
  )
}
