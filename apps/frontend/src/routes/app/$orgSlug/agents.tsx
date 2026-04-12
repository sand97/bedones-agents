import { useState, useCallback, useEffect, useMemo } from 'react'
import { createFileRoute, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Empty, Spin } from 'antd'
import { Plus, Sparkles, Bot, Zap } from 'lucide-react'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { AgentChat } from '@app/components/agent/agent-chat'
import { AgentCreateModal } from '@app/components/agent/agent-create-modal'
import { AgentActivateModal } from '@app/components/agent/agent-activate-modal'
import { AgentListItem } from '@app/components/agent/agent-list-item'
import { AgentScoreBadge } from '@app/components/agent/agent-score-badge'
import { HeaderHelper } from '@app/components/shared/header-helper'
import { SocialSetup } from '@app/components/social/social-setup'
import { useLayout } from '@app/contexts/layout-context'
import { getSocket } from '@app/lib/socket'
import {
  agentApi,
  catalogApi,
  socialApi,
  type AgentMessage as ApiAgentMessage,
  type LabelItem,
} from '@app/lib/api/agent-api'
import type { AgentMessage, AgentChoiceOption } from '@app/components/agent/mock-data'

export const Route = createFileRoute('/app/$orgSlug/agents')({
  component: AgentsPage,
})

function mapApiMessage(m: ApiAgentMessage): AgentMessage {
  return {
    id: m.id,
    type: (m.type as 'text' | 'mcq' | 'scq') || 'text',
    from: m.role === 'user' ? 'user' : 'agent',
    text: m.content,
    timestamp: m.createdAt,
    options: Array.isArray(m.metadata?.options)
      ? (m.metadata.options as (string | AgentChoiceOption)[]).map((o, i) =>
          typeof o === 'string' ? { id: `opt-${i}`, label: o } : o,
        )
      : undefined,
  }
}

function AgentsPage() {
  const { t } = useTranslation()
  const { orgSlug } = useParams({ strict: false }) as { orgSlug: string }
  const { isDesktop } = useLayout()
  const queryClient = useQueryClient()

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [activateOpen, setActivateOpen] = useState(false)
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [pendingQuestion, setPendingQuestion] = useState<AgentMessage | null>(null)
  const [isThinking, setIsThinking] = useState(false)
  const [showList, setShowList] = useState(true)

  // ─── Queries ───

  const agentsQuery = useQuery({
    queryKey: ['agents', orgSlug],
    queryFn: () => agentApi.list(orgSlug),
    staleTime: 10_000,
  })

  const socialAccountsQuery = useQuery({
    queryKey: ['social-accounts', orgSlug],
    queryFn: () => socialApi.listAccounts(orgSlug),
    staleTime: 30_000,
  })

  const catalogsQuery = useQuery({
    queryKey: ['catalogs', orgSlug],
    queryFn: () => catalogApi.list(orgSlug),
    staleTime: 30_000,
  })

  const selectedAgent = useMemo(
    () => agentsQuery.data?.find((a) => a.id === selectedAgentId) ?? null,
    [agentsQuery.data, selectedAgentId],
  )

  const labelsQuery = useQuery({
    queryKey: ['agent-labels', selectedAgentId],
    queryFn: () => agentApi.getLabels(selectedAgentId!),
    enabled: !!selectedAgentId,
    staleTime: 30_000,
  })

  // ─── Load messages when agent selected ───

  useEffect(() => {
    if (!selectedAgentId) {
      setMessages([])
      return
    }

    agentApi.getMessages(selectedAgentId).then((msgs) => {
      setMessages(msgs.map(mapApiMessage))

      // Check if last message is MCQ/SCQ
      const last = msgs[msgs.length - 1]
      if (last && (last.type === 'mcq' || last.type === 'scq') && last.role === 'agent') {
        setPendingQuestion(mapApiMessage(last))
      } else {
        setPendingQuestion(null)
      }
    })
  }, [selectedAgentId])

  // ─── WebSocket for real-time updates ───

  useEffect(() => {
    if (!orgSlug) return

    const socket = getSocket(orgSlug)

    const handleAgentMessage = (data: {
      agentId: string
      message: ApiAgentMessage
      score?: number
    }) => {
      if (data.agentId !== selectedAgentId) return

      const mapped = mapApiMessage(data.message)
      setMessages((prev) => [...prev, mapped])
      setIsThinking(false)

      if (mapped.type === 'mcq' || mapped.type === 'scq') {
        setPendingQuestion(mapped)
      }

      // Update agent in cache
      if (data.score !== undefined) {
        queryClient.invalidateQueries({ queryKey: ['agents', orgSlug] })
      }
    }

    const handleThinking = (data: { agentId: string }) => {
      if (data.agentId === selectedAgentId) {
        setIsThinking(true)
      }
    }

    const handleError = (data: { agentId: string }) => {
      if (data.agentId === selectedAgentId) {
        setIsThinking(false)
      }
    }

    const handleCatalogAnalyzed = () => {
      queryClient.invalidateQueries({ queryKey: ['catalogs', orgSlug] })
      queryClient.invalidateQueries({ queryKey: ['agents', orgSlug] })
    }

    socket.on('agent:message', handleAgentMessage)
    socket.on('agent:thinking', handleThinking)
    socket.on('agent:error', handleError)
    socket.on('catalog:analyzed', handleCatalogAnalyzed)
    socket.on('catalog:analyzing', handleCatalogAnalyzed)

    return () => {
      socket.off('agent:message', handleAgentMessage)
      socket.off('agent:thinking', handleThinking)
      socket.off('agent:error', handleError)
      socket.off('catalog:analyzed', handleCatalogAnalyzed)
      socket.off('catalog:analyzing', handleCatalogAnalyzed)
    }
  }, [orgSlug, selectedAgentId, queryClient])

  // ─── Mutations ───

  const createMutation = useMutation({
    mutationFn: ({ name, socialAccountIds }: { name?: string; socialAccountIds: string[] }) =>
      agentApi.create({ organisationId: orgSlug, socialAccountIds, name }),
    onSuccess: (newAgent) => {
      queryClient.invalidateQueries({ queryKey: ['agents', orgSlug] })
      setSelectedAgentId(newAgent.id)
      setCreateOpen(false)
    },
  })

  const activateMutation = useMutation({
    mutationFn: (data: {
      mode: 'CONTACTS' | 'LABELS' | 'EXCLUDE_LABELS'
      labelIds?: string[]
      contacts?: Record<string, string[]>
    }) => agentApi.activate(selectedAgentId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents', orgSlug] })
      setActivateOpen(false)
    },
  })

  // ─── Handlers ───

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!selectedAgentId || !text.trim()) return

      const userMsg: AgentMessage = {
        id: `msg-${Date.now()}`,
        type: 'text',
        from: 'user',
        text,
        timestamp: dayjs().toISOString(),
      }
      setMessages((prev) => [...prev, userMsg])
      setPendingQuestion(null)
      setIsThinking(true)

      try {
        await agentApi.sendMessage(selectedAgentId, text, orgSlug)
      } catch {
        setIsThinking(false)
      }
    },
    [selectedAgentId, orgSlug],
  )

  const handleDismissQuestion = useCallback(() => {
    setPendingQuestion(null)
  }, [])

  const handleStartConfig = useCallback(async () => {
    if (!selectedAgentId) return
    setIsThinking(true)

    try {
      // First analyze catalogs
      await agentApi.analyzeCatalogs(selectedAgentId, orgSlug)

      // Then start initial evaluation
      await agentApi.initialEvaluation(selectedAgentId, orgSlug)
    } catch {
      setIsThinking(false)
    }
  }, [selectedAgentId, orgSlug])

  const handleSelectAgent = (agentId: string) => {
    setSelectedAgentId(agentId)
    if (!isDesktop) setShowList(false)
  }

  // ─── Render ───

  const agents = agentsQuery.data || []
  const socialAccounts = socialAccountsQuery.data || []
  const catalogs = catalogsQuery.data || []

  // ─── Empty state (no agents) ───

  if (!agentsQuery.isLoading && agents.length === 0 && !selectedAgentId) {
    return (
      <div className="flex h-screen flex-col">
        <DashboardHeader title={t('agent.page_title')} />
        <SocialSetup
          icon={<Bot size={48} strokeWidth={1.5} />}
          color="var(--ant-color-text-secondary)"
          title={t('agent.empty_title')}
          description={t('agent.empty_desc')}
          buttonLabel={t('common.start')}
          buttonIcon={<Sparkles size={18} />}
          onAction={() => setCreateOpen(true)}
        />

        <AgentCreateModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onSubmit={(name, ids) =>
            createMutation.mutate({ name: name || undefined, socialAccountIds: ids })
          }
          socialAccounts={socialAccounts}
          existingAgents={agents}
          catalogs={catalogs}
          loading={createMutation.isPending}
          orgSlug={orgSlug}
        />
      </div>
    )
  }

  // ─── Agent selected: DRAFT state ───

  const renderAgentContent = () => {
    if (!selectedAgent) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center text-sm text-text-muted">{t('agent.select_agent')}</div>
        </div>
      )
    }

    // DRAFT: agent just created, no messages yet
    if (selectedAgent.status === 'DRAFT' && messages.length === 0) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <Empty
            image={<Sparkles size={48} strokeWidth={1.5} className="text-text-muted" />}
            description={
              <div className="mt-2">
                <div className="text-sm font-medium text-text-primary">
                  {t('agent.draft_title')}
                </div>
                <div className="mt-1 text-xs text-text-muted">{t('agent.draft_desc')}</div>
                <Button
                  type="primary"
                  className="mt-4"
                  loading={isThinking}
                  onClick={handleStartConfig}
                >
                  {t('agent.start_config')}
                </Button>
              </div>
            }
          />
        </div>
      )
    }

    // CONFIGURING / READY / ACTIVE: show chat
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        {selectedAgent.score >= 80 && selectedAgent.status === 'READY' && (
          <HeaderHelper
            icon={<Zap size={20} />}
            title={t('agent.activate_banner_title')}
            subtitle={t('agent.activate_banner_desc')}
            primaryAction={{
              title: t('agent.activate_banner_btn'),
              onClick: () => setActivateOpen(true),
            }}
          />
        )}
        <AgentChat
          messages={messages}
          onSendMessage={handleSendMessage}
          pendingQuestion={pendingQuestion}
          onDismissQuestion={handleDismissQuestion}
        />
        {isThinking && (
          <div className="flex items-center justify-center gap-2 py-2 text-xs text-text-muted">
            <Spin size="small" />
            <span>{t('agent.thinking')}</span>
          </div>
        )}
      </div>
    )
  }

  // ─── Main layout (list + chat) ───

  return (
    <div className="flex h-screen flex-col">
      <DashboardHeader
        title={t('agent.page_title')}
        action={
          <div className="flex items-center gap-2">
            {selectedAgent && <AgentScoreBadge score={selectedAgent.score} />}
            <Button onClick={() => setCreateOpen(true)} icon={<Plus size={16} strokeWidth={1.5} />}>
              {t('agent.new_agent')}
            </Button>
          </div>
        }
        mobileLeft={
          !showList && selectedAgent ? (
            <div className="flex items-center gap-2">
              <Button type="text" onClick={() => setShowList(true)} size="small">
                {t('common.back')}
              </Button>
              <span className="truncate text-sm font-medium text-text-primary">
                {selectedAgent.name}
              </span>
            </div>
          ) : undefined
        }
      />

      <div className="chat-split flex-1 overflow-hidden">
        {/* Agent List */}
        {(isDesktop || showList) && (
          <div
            className={`chat-split__left ${!isDesktop && !showList ? 'chat-split__left--hidden-mobile' : ''}`}
          >
            <div className="flex flex-col overflow-y-auto">
              {agentsQuery.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Spin />
                </div>
              ) : (
                agents.map((agent) => (
                  <AgentListItem
                    key={agent.id}
                    agent={agent}
                    isActive={agent.id === selectedAgentId}
                    onClick={() => handleSelectAgent(agent.id)}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {/* Agent Chat — full remaining width */}
        {(isDesktop || !showList) && (
          <div
            className={`chat-split__right ${!isDesktop && !showList ? 'chat-split__right--visible' : ''}`}
          >
            {renderAgentContent()}
          </div>
        )}
      </div>

      <AgentCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={(name, ids) =>
          createMutation.mutate({ name: name || undefined, socialAccountIds: ids })
        }
        socialAccounts={socialAccounts}
        existingAgents={agents}
        catalogs={catalogs}
        loading={createMutation.isPending}
        orgSlug={orgSlug}
      />

      {selectedAgent && (
        <AgentActivateModal
          open={activateOpen}
          onClose={() => setActivateOpen(false)}
          onSubmit={(data) => activateMutation.mutate(data)}
          agent={selectedAgent}
          labels={(labelsQuery.data as LabelItem[]) || []}
          loading={activateMutation.isPending}
        />
      )}
    </div>
  )
}
