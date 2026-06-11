import { useState, useMemo, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, App } from 'antd'
import { Send } from 'lucide-react'
import type { Comment, Post } from './mock-data'
import {
  buildThreads,
  buildUserNameMap,
  groupThreadsByDate,
  renderCommentMessage,
  type Provider,
} from './comment-thread/helpers'
import { PostPreviewHeader, ThreadBlock } from './comment-thread/thread-block'

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
        <div className="chat-input-row">
          <Input.TextArea
            ref={inputRef}
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
      </div>
    </div>
  )
}
