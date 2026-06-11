import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, Button, Popover, Spin, App } from 'antd'
import { Eye, EyeOff, Trash2, ExternalLink, Sparkles, BotOff } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { OptionsIcon } from '@app/components/icons/social-icons'
import { $api } from '@app/lib/api/$api'
import type { Comment, Post } from '../mock-data'
import type { Provider } from './helpers'

/* ── User profile popover ── */

export function UserProfilePopover({
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

/* ── Options popover for post header ── */

export function PostOptionsMenu({ post }: { post: Post }) {
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()
  const { message: antdMessage } = App.useApp()
  const queryClient = useQueryClient()

  // Agent activation status for this post's comments (lazy — only when the menu opens).
  const agentStatusQuery = $api.useQuery(
    'get',
    '/social/posts/{postId}/agent-status',
    { params: { path: { postId: post.id } } },
    { enabled: open },
  )
  const setOverrideMutation = $api.useMutation('put', '/social/posts/{postId}/agent-override')

  const agentStatus = agentStatusQuery.data
  const agent = agentStatus?.agent ?? null
  const isAgentReady =
    !!agent && agent.score >= 80 && agent.status !== 'DRAFT' && agent.status !== 'CONFIGURING'
  const isActive = agentStatus?.isActive === true

  const handleToggleAgent = async () => {
    const next: 'FORCE_ON' | 'FORCE_OFF' = isActive ? 'FORCE_OFF' : 'FORCE_ON'
    try {
      const result = await setOverrideMutation.mutateAsync({
        params: { path: { postId: post.id } },
        body: { override: next },
      })
      queryClient.setQueryData(
        ['get', '/social/posts/{postId}/agent-status', { params: { path: { postId: post.id } } }],
        result,
      )
      antdMessage.success(
        next === 'FORCE_ON' ? t('comments.agent_activated') : t('comments.agent_deactivated'),
      )
    } catch {
      antdMessage.error(t('comments.agent_toggle_error'))
    }
  }

  return (
    <Popover
      content={
        <div className="w-56">
          {post.permalinkUrl && (
            <Button
              type="text"
              block
              onClick={() => {
                window.open(post.permalinkUrl, '_blank')
                setOpen(false)
              }}
              icon={<ExternalLink size={14} />}
              className="py-2.5! whitespace-nowrap"
            >
              {t('comments.view_original_post')}
            </Button>
          )}
          {isAgentReady && (
            <Button
              type="text"
              block
              onClick={handleToggleAgent}
              loading={setOverrideMutation.isPending}
              icon={isActive ? <BotOff size={14} /> : <Sparkles size={14} />}
              className="py-2.5! whitespace-nowrap"
            >
              {isActive ? t('comments.deactivate_agent') : t('comments.activate_agent')}
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
      <Button type="text" icon={<OptionsIcon width={18} height={18} />} className="flex-shrink-0" />
    </Popover>
  )
}

/* ── Options popover for comment threads ── */

export function CommentOptionsMenu({
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
