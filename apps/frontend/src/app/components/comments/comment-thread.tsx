import { useState, useMemo, useRef, useEffect } from 'react'
import { Avatar, Button, Input, Popover } from 'antd'
import { MessageSquare, Send, EyeOff, Trash2, ExternalLink } from 'lucide-react'
import dayjs from 'dayjs'
import { ImagePlaceholderIcon, OptionsIcon } from '@app/components/icons/social-icons'
import type { Comment, Post } from './mock-data'

interface CommentThreadProps {
  post: Post
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
    const label = formatDateLabel(thread.root.timestamp)
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

function PostOptionsMenu() {
  const [open, setOpen] = useState(false)

  return (
    <Popover
      content={
        <div className="w-52">
          <Button
            type="text"
            block
            onClick={() => setOpen(false)}
            icon={<ExternalLink size={14} />}
            className="py-2.5! whitespace-nowrap"
          >
            Voir le post sur Facebook
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

function CommentOptionsMenu({ thread }: { thread: Thread }) {
  const [open, setOpen] = useState(false)
  const isHidden = thread.replies.some((r) => r.status === 'hidden')
  const isDeleted = thread.replies.some((r) => r.status === 'deleted')

  return (
    <Popover
      content={
        <div className="w-52">
          <Button
            type="text"
            block
            disabled={isHidden}
            onClick={() => setOpen(false)}
            icon={<EyeOff size={14} />}
            className="py-2.5!"
          >
            Masquer
          </Button>
          {!isDeleted && (
            <Button
              type="text"
              danger
              block
              onClick={() => setOpen(false)}
              icon={<Trash2 size={14} />}
              className="py-2.5!"
            >
              Supprimer
            </Button>
          )}
          <div className="mx-3 my-1 h-px bg-border-subtle" />
          <Button
            type="text"
            block
            onClick={() => setOpen(false)}
            icon={<ExternalLink size={14} />}
            className="py-2.5!"
          >
            Voir sur Facebook
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
      <Button
        type="text"
        size="small"
        icon={<OptionsIcon width={14} height={14} />}
        className="text-xs! px-0!"
      >
        Options
      </Button>
    </Popover>
  )
}

/* ── Comment bubble ── */

function CommentBubble({ comment, isReply }: { comment: Comment; isReply?: boolean }) {
  const isPage = comment.isPageReply
  const status = comment.status || 'visible'
  const isModerated = status === 'hidden' || status === 'deleted'

  if (isModerated) {
    const Icon = status === 'hidden' ? EyeOff : Trash2
    const label = status === 'hidden' ? 'Masqué' : 'Supprimé'

    return (
      <div className="flex items-center gap-3">
        <div
          className={`flex flex-shrink-0 items-center justify-center rounded-full bg-red-50 ${isReply ? 'h-6 w-6' : 'h-8 w-8'}`}
        >
          <Icon size={isReply ? 12 : 14} className="text-red-500" />
        </div>
        <span className={`text-text-muted ${isReply ? 'text-xs' : 'text-sm'}`}>
          <span className="font-semibold">{label}</span>
          {comment.statusReason && <span className="font-normal"> : {comment.statusReason}</span>}
        </span>
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      {!isPage ? (
        <Avatar src={comment.author?.avatarUrl} size={isReply ? 24 : 32} className="flex-shrink-0">
          {comment.author?.name?.[0]}
        </Avatar>
      ) : (
        <div
          className={`flex flex-shrink-0 items-center justify-center rounded-full bg-bg-subtle ${isReply ? 'h-6 w-6' : 'h-8 w-8'}`}
        >
          <MessageSquare size={isReply ? 12 : 14} className="text-text-muted" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        {!isPage && comment.author && (
          <div className={`font-semibold text-text-primary ${isReply ? 'text-xs' : 'text-sm'}`}>
            {comment.author.name}
          </div>
        )}
        <div className={`mt-0.5 text-text-primary ${isReply ? 'text-xs' : 'text-sm'}`}>
          {comment.text}
        </div>
        {comment.imageUrl && (
          <img src={comment.imageUrl} alt="" className="mt-2 max-h-48 rounded-lg object-cover" />
        )}
        <div className="mt-1 text-xs text-text-muted">
          {formatTime(comment.timestamp)}
          {isPage && ' (by IA)'}
        </div>
      </div>
    </div>
  )
}

/* ── Thread block ── */

function ThreadBlock({ thread, onReply }: { thread: Thread; onReply: (comment: Comment) => void }) {
  const hasDeletedReply = thread.replies.some((r) => r.status === 'deleted')
  const hasHiddenReply = thread.replies.some((r) => r.status === 'hidden')
  const hasReplies = thread.replies.length > 0

  return (
    <div className="px-4 py-3">
      <CommentBubble comment={thread.root} />

      {hasReplies && (
        <div className="thread-replies">
          {thread.replies.map((reply, i) => (
            <div
              key={reply.id}
              className={`thread-reply ${i === thread.replies.length - 1 ? 'thread-reply--last' : ''}`}
            >
              <CommentBubble comment={reply} isReply />
            </div>
          ))}
        </div>
      )}

      {!hasDeletedReply && (
        <div className="mt-2 ml-10 flex items-center gap-3">
          {!hasHiddenReply && (
            <Button
              type="text"
              size="small"
              onClick={() => onReply(thread.root)}
              icon={<MessageSquare size={12} />}
              className="text-xs! px-0!"
            >
              Répondre
            </Button>
          )}
          <CommentOptionsMenu thread={thread} />
        </div>
      )}
    </div>
  )
}

/* ── Post preview header ── */

function PostPreviewHeader({ post }: { post: Post }) {
  const displayText = post.content || 'Post sans message'

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
        className={`m-0 min-w-0 flex-1 truncate text-sm ${post.content ? 'text-text-secondary' : 'italic text-text-muted'}`}
      >
        {displayText}
      </p>
      <PostOptionsMenu />
    </div>
  )
}

/* ── Main component ── */

export function CommentThread({ post }: CommentThreadProps) {
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [inputValue, setInputValue] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const threads = useMemo(() => buildThreads(post.comments), [post.comments])
  const groups = useMemo(() => groupThreadsByDate(threads), [threads])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [post.id])

  const handleReply = (comment: Comment) => {
    setReplyTo(comment)
  }

  const clearReply = () => {
    setReplyTo(null)
  }

  const handleSend = () => {
    if (!inputValue.trim()) return
    setInputValue('')
    setReplyTo(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
  }

  const placeholder = replyTo
    ? `Répondre à ${replyTo.author?.name || 'ce commentaire'}…`
    : 'Ajouter un commentaire…'

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
              <ThreadBlock key={thread.root.id} thread={thread} onReply={handleReply} />
            ))}
          </div>
        ))}
      </div>

      {/* Fixed input at bottom */}
      <div className="flex-shrink-0 border-t border-border-subtle px-4 pt-3 pb-6">
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-bg-subtle px-3 py-2 text-xs text-text-secondary">
            <span className="min-w-0 flex-1 truncate">
              Réponse à <strong>{replyTo.author?.name || 'un commentaire'}</strong> : {replyTo.text}
            </span>
            <Button type="text" size="small" onClick={clearReply} className="flex-shrink-0 p-0!">
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
            icon={<Send strokeWidth={1.5} size={18} />}
            className="flex-shrink-0"
          />
        </div>
      </div>
    </div>
  )
}
