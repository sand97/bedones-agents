import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, Popover, Popconfirm, Button, message as antdMessage } from 'antd'
import { Copy, Check, Sparkles, BotOff, Trash2 } from 'lucide-react'
import { useParams } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { OptionsIcon } from '@app/components/icons/social-icons'
import { $api } from '@app/lib/api/$api'
import { getAvatarColor } from '@app/lib/avatar-color'
import type { Conversation } from '../mock-data'

/* ── Chat header with copy-phone option ── */

export function ChatHeader({ conversation }: { conversation: Conversation }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const agentStatusQuery = $api.useQuery(
    'get',
    '/messaging/conversations/{conversationId}/agent-status',
    { params: { path: { conversationId: conversation.id } } },
  )

  const setOverrideMutation = $api.useMutation(
    'put',
    '/messaging/conversations/{conversationId}/agent-override',
  )

  const { orgSlug } = useParams({ strict: false }) as { orgSlug?: string }
  const meQuery = $api.useQuery('get', '/auth/me')
  const isAdmin = useMemo(() => {
    const org = meQuery.data?.organisations?.find((o) => o.id === orgSlug)
    return org?.role === 'OWNER' || org?.role === 'ADMIN'
  }, [meQuery.data, orgSlug])

  const clearMutation = $api.useMutation(
    'delete',
    '/messaging/conversations/{conversationId}/messages',
  )

  const agentStatus = agentStatusQuery.data
  const agent = agentStatus?.agent ?? null
  const isAgentReady =
    !!agent && agent.score >= 80 && agent.status !== 'DRAFT' && agent.status !== 'CONFIGURING'
  const isActive = agentStatus?.isActive === true
  const hasHeaderActions = Boolean(
    conversation.contact.phone || conversation.contact.username || isAgentReady || isAdmin,
  )

  const handleCopy = async () => {
    await navigator.clipboard.writeText(
      conversation.contact.phone || conversation.contact.username || '',
    )
    setCopied(true)
    setTimeout(() => {
      setCopied(false)
      setOptionsOpen(false)
    }, 1200)
  }

  const handleToggleAgent = async () => {
    const next: 'FORCE_ON' | 'FORCE_OFF' = isActive ? 'FORCE_OFF' : 'FORCE_ON'
    try {
      const result = await setOverrideMutation.mutateAsync({
        params: { path: { conversationId: conversation.id } },
        body: { override: next },
      })
      queryClient.setQueryData(
        [
          'get',
          '/messaging/conversations/{conversationId}/agent-status',
          { params: { path: { conversationId: conversation.id } } },
        ],
        result,
      )
      antdMessage.success(
        next === 'FORCE_ON' ? t('chat.agent_activated') : t('chat.agent_deactivated'),
      )
    } catch {
      antdMessage.error(t('chat.agent_toggle_error'))
    }
  }

  const handleClearConversation = async () => {
    try {
      await clearMutation.mutateAsync({
        params: { path: { conversationId: conversation.id } },
      })
      queryClient.invalidateQueries({
        queryKey: [
          'get',
          '/messaging/conversations/{conversationId}/messages',
          { params: { path: { conversationId: conversation.id } } },
        ],
      })
      queryClient.invalidateQueries({ queryKey: ['get', '/messaging/conversations/{accountId}'] })
      antdMessage.success(t('chat.conversation_cleared'))
      setOptionsOpen(false)
    } catch {
      antdMessage.error(t('chat.clear_conversation_error'))
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-2.5">
      <Avatar
        src={conversation.contact.avatarUrl}
        size={36}
        className="flex-shrink-0"
        style={{
          backgroundColor: getAvatarColor(conversation.contact.id || conversation.contact.name),
        }}
      >
        {conversation.contact.name[0]}
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-text-primary">{conversation.contact.name}</div>
        {conversation.contact.username && (
          <div className="text-xs text-text-muted">{conversation.contact.username}</div>
        )}
        {!conversation.contact.username && conversation.contact.phone && (
          <div className="text-xs text-text-muted">{conversation.contact.phone}</div>
        )}
      </div>

      {hasHeaderActions && (
        <Popover
          content={
            <div className="w-56">
              {(conversation.contact.phone || conversation.contact.username) && (
                <Button
                  type="text"
                  block
                  onClick={handleCopy}
                  icon={
                    copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />
                  }
                  className="py-2.5!"
                >
                  {copied
                    ? t('common.copied')
                    : conversation.contact.phone
                      ? t('chat.copy_phone', { phone: conversation.contact.phone })
                      : conversation.contact.username}
                </Button>
              )}
              {isAgentReady && (
                <Button
                  type="text"
                  block
                  danger={isActive}
                  onClick={handleToggleAgent}
                  loading={setOverrideMutation.isPending}
                  icon={isActive ? <BotOff size={14} /> : <Sparkles size={14} />}
                  className="py-2.5!"
                >
                  {isActive ? t('chat.deactivate_agent') : t('chat.activate_agent')}
                </Button>
              )}
              {isAdmin && (
                <Popconfirm
                  title={t('chat.clear_conversation_confirm')}
                  okText={t('chat.clear_conversation')}
                  cancelText={t('promotions.cancel')}
                  okButtonProps={{ danger: true, loading: clearMutation.isPending }}
                  onConfirm={handleClearConversation}
                  placement="left"
                >
                  <Button type="text" block danger icon={<Trash2 size={14} />} className="py-2.5!">
                    {t('chat.clear_conversation')}
                  </Button>
                </Popconfirm>
              )}
            </div>
          }
          trigger="click"
          open={optionsOpen}
          onOpenChange={setOptionsOpen}
          placement="bottomRight"
          overlayClassName="org-switcher-popover"
          arrow={false}
        >
          <Button
            type="text"
            icon={<OptionsIcon width={18} height={18} />}
            className="flex-shrink-0"
          />
        </Popover>
      )}
    </div>
  )
}
