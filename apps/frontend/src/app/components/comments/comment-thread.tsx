import { useState, useMemo, useRef, useEffect } from 'react'
import { Avatar, Button, Input, Popover, Spin, Tooltip, App } from 'antd'
import { MessageSquare, Send, Eye, EyeOff, Trash2, ExternalLink, Settings } from 'lucide-react'
import dayjs from 'dayjs'
import { ImagePlaceholderIcon, OptionsIcon } from '@app/components/icons/social-icons'
import { $api } from '@app/lib/api/$api'
import type { Comment, Post } from './mock-data'

type Provider = 'facebook' | 'instagram' | 'tiktok'

// TODO: réactiver quand le bouton "Voir sur ..." sera de retour
// function getProfileUrl(provider: Provider, comment: Comment): string | undefined {
//   if (comment.isPageReply) return undefined
//   if (provider === 'facebook') return `https://facebook.com/${comment.fromId}`
//   if (provider === 'instagram') return `https://instagram.com/${comment.fromName}`
//   return undefined
// }

// TODO: réactiver quand le bouton "Voir sur ..." sera de retour
// const PROVIDER_LABEL: Record<Provider, string> = {
//   facebook: 'Facebook',
//   instagram: 'Instagram',
//   tiktok: 'TikTok',
// }

/* ── User profile popover ── */

function UserProfilePopover({
  comment,
  _provider,
  accountId,
  children,
}: {
  comment: Comment
  provider: Provider
  accountId: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

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
          <span>Commentaires</span>
          <span className="font-semibold">{data.totalComments}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1">
            <EyeOff size={11} /> Masqués
          </span>
          <span className="font-semibold">{data.hiddenComments}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Trash2 size={11} /> Supprimés
          </span>
          <span className="font-semibold">{data.deletedComments}</span>
        </div>
      </div>
      {/* TODO: lien vers profil — à activer quand l'URL sera fiable
      {profileUrl && (
        <Button
          type="default"
          block
          size="small"
          icon={<ExternalLink size={13} />}
          className="mt-3"
          onClick={() => {
            window.open(profileUrl, '_blank')
            setOpen(false)
          }}
        >
          Voir sur {PROVIDER_LABEL[provider]}
        </Button>
      )}
      */}
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

function formatDateLabel(timestamp: string): string {
  const date = dayjs(timestamp)
  const now = dayjs()

  if (date.isSame(now, 'day')) return "Aujourd'hui"
  if (date.isSame(now.subtract(1, 'day'), 'day')) return 'Hier'
  return date.format('D MMMM')
}

function buildThreads(comments: Comment[]): Thread[] {
  const roots = comments.filter((c) => !c.parentId)
  const replyMap = new Map<string, Comment[]>()

  for (const c of comments) {
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

function groupThreadsByDate(threads: Thread[]): { date: string; threads: Thread[] }[] {
  const groups: { date: string; threads: Thread[] }[] = []

  for (const thread of threads) {
    const label = formatDateLabel(thread.root.createdTime)
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
            Voir le post original
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
  const isHidden = comment.status === 'HIDDEN'
  const isDeleted = comment.status === 'DELETED'

  const handleHide = async () => {
    if (!onHide) return
    setLoading('hide')
    try {
      await onHide(comment.id)
      messageApi.success('Commentaire masqué')
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : 'Erreur')
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
      messageApi.success('Commentaire démasqué')
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : 'Erreur')
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
      messageApi.success('Commentaire supprimé')
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : 'Erreur')
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
              Masquer
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
              Démasquer
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
              Supprimer
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
        Options
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
}: {
  comment: Comment
  provider: Provider
  accountId: string
  isReply?: boolean
}) {
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
          {comment.message}
          <span className="whitespace-nowrap text-xs text-text-muted">
            {' '}
            · {formatTime(comment.createdTime)}
            {isPage && comment.fromId === 'ai' && ' (by IA)'}
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
                {isHidden ? 'Masqué' : 'Supprimé'}
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
  isConfigured,
  onReplyClick,
  onHide,
  onUnhide,
  onDelete,
}: {
  thread: Thread
  provider: Provider
  accountId: string
  isConfigured: boolean
  onReplyClick: (comment: Comment) => void
  onHide?: (commentId: string) => Promise<void>
  onUnhide?: (commentId: string) => Promise<void>
  onDelete?: (commentId: string) => Promise<void>
}) {
  const isRootDeleted = thread.root.status === 'DELETED'
  const hasReplies = thread.replies.length > 0

  return (
    <div className="px-4 py-3">
      <CommentBubble comment={thread.root} provider={provider} accountId={accountId} />

      {hasReplies && (
        <div className="thread-replies">
          {thread.replies.map((reply, i) => (
            <div
              key={reply.id}
              className={`thread-reply ${i === thread.replies.length - 1 ? 'thread-reply--last' : ''}`}
            >
              <CommentBubble comment={reply} provider={provider} accountId={accountId} isReply />
            </div>
          ))}
        </div>
      )}

      {!isRootDeleted && (
        <div className="mt-2 ml-10 flex items-center gap-1">
          {isConfigured && (
            <Button
              type="text"
              size="small"
              onClick={() => onReplyClick(thread.root)}
              icon={<MessageSquare size={12} />}
            >
              Répondre
            </Button>
          )}
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
  const displayText = post.message || 'Post sans message'

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
  const { message: messageApi } = App.useApp()

  const threads = useMemo(() => buildThreads(post.comments), [post.comments])
  const groups = useMemo(() => groupThreadsByDate(threads), [threads])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [post.id])

  const handleReplyClick = (comment: Comment) => {
    setReplyTo(comment)
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
      messageApi.error(err instanceof Error ? err.message : 'Erreur lors de la réponse')
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
    ? `Répondre à ${replyTo.fromName || 'ce commentaire'}…`
    : 'Écrire un commentaire…'

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
              />
            ))}
          </div>
        ))}
      </div>

      {/* Fixed input at bottom */}
      <div className="flex-shrink-0 border-t border-border-subtle px-4 pt-3 pb-6">
        {!isConfigured ? (
          <div className="flex items-center gap-2 rounded-lg bg-bg-subtle px-3 py-2.5 text-sm text-text-muted">
            <Settings size={16} className="flex-shrink-0" />
            <span>Configurez vos réponses pour pouvoir répondre aux commentaires</span>
          </div>
        ) : (
          <>
            {replyTo && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-bg-subtle px-3 py-2 text-xs text-text-secondary">
                <span className="min-w-0 flex-1 truncate">
                  Réponse à <strong>{replyTo.fromName || 'un commentaire'}</strong> :{' '}
                  {replyTo.message}
                </span>
                <Button
                  type="text"
                  size="small"
                  onClick={clearReply}
                  className="flex-shrink-0 p-0!"
                >
                  ✕
                </Button>
              </div>
            )}
            <div className="chat-input-row">
              <Input.TextArea
                placeholder={placeholder}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                autoSize={{ minRows: 1, maxRows: 3 }}
                className="rounded-2xl!"
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
          </>
        )}
      </div>
    </div>
  )
}
