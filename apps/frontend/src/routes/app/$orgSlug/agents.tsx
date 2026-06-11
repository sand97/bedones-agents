import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router'
import { buildShareMeta } from '@app/lib/share-meta'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Spin, Tooltip, App } from 'antd'
import { SetupSuccessModal } from '@app/components/dashboard/setup-success-modal'
import { AgentReadyModal } from '@app/components/agent/agent-ready-modal'
import {
  Plus,
  Sparkles,
  Bot,
  Zap,
  MoreHorizontal,
  Loader2,
  ArrowLeft,
  Settings,
} from 'lucide-react'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { AgentChat } from '@app/components/agent/agent-chat'
import { AgentCreateModal } from '@app/components/agent/agent-create-modal'
import { AgentActivateModal } from '@app/components/agent/agent-activate-modal'
import { AgentListItem } from '@app/components/agent/agent-list-item'
import { AgentActionsPopover } from '@app/components/agent/agent-actions-popover'
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
} from '@app/lib/api/agent-api'
import type { AgentMessage, AgentChoiceOption } from '@app/components/agent/mock-data'

export const Route = createFileRoute('/app/$orgSlug/agents')({
  head: () =>
    buildShareMeta({
      title: 'Voir les agents IA',
      description: 'Cliquez pour découvrir les agents IA de ce compte',
      image: '/og/agents.png',
    }),
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
  const navigate = useNavigate()
  const { isDesktop } = useLayout()
  const queryClient = useQueryClient()

  // Unlike chats/comments, the agents page intentionally does NOT restore the
  // last-opened agent on refresh — the user prefers to land back on the agent
  // list rather than be sent straight into a conversation. Selection is kept in
  // local state only (not mirrored in the URL).
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)

  const selectAgent = useCallback((agentId: string | null) => {
    setSelectedAgentId(agentId)
  }, [])
  const [createOpen, setCreateOpen] = useState(false)
  const [activateOpen, setActivateOpen] = useState(false)
  const [scorePromptOpen, setScorePromptOpen] = useState(false)
  const [activationSuccess, setActivationSuccess] = useState<{
    agentName: string
    remaining: number
  } | null>(null)
  const [editAgent, setEditAgent] = useState<import('@app/lib/api/agent-api').Agent | null>(null)
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [pendingQuestion, setPendingQuestion] = useState<AgentMessage | null>(null)
  const [isThinking, setIsThinking] = useState(false)
  // On mobile the list is shown first; opening an agent hides it.
  const [showList, setShowList] = useState(true)
  const [setupPhase, setSetupPhase] = useState<
    'analyzing-catalogs' | 'initializing' | 'error' | null
  >(null)
  const [indexingProgress, setIndexingProgress] = useState<{
    processed: number
    total: number
  } | null>(null)

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
      setSetupPhase(null)
      setIndexingProgress(null)

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

    const handleSetupProgress = (data: { agentId: string; phase: string }) => {
      if (data.agentId === selectedAgentId) {
        setSetupPhase(data.phase as 'analyzing-catalogs' | 'initializing')
      }
    }

    const handleSetupError = (data: { agentId: string }) => {
      if (data.agentId === selectedAgentId) {
        setSetupPhase('error')
        setIsThinking(false)
      }
    }

    const handleIndexingProgress = (data: {
      catalogId: string
      processed: number
      total: number
      percentage: number
    }) => {
      setIndexingProgress({ processed: data.processed, total: data.total })
    }

    socket.on('agent:message', handleAgentMessage)
    socket.on('agent:thinking', handleThinking)
    socket.on('agent:error', handleError)
    socket.on('catalog:analyzed', handleCatalogAnalyzed)
    socket.on('catalog:analyzing', handleCatalogAnalyzed)
    socket.on('agent:setup-progress', handleSetupProgress)
    socket.on('agent:setup-error', handleSetupError)
    socket.on('catalog:indexing-progress', handleIndexingProgress)

    return () => {
      socket.off('agent:message', handleAgentMessage)
      socket.off('agent:thinking', handleThinking)
      socket.off('agent:error', handleError)
      socket.off('catalog:analyzed', handleCatalogAnalyzed)
      socket.off('catalog:analyzing', handleCatalogAnalyzed)
      socket.off('agent:setup-progress', handleSetupProgress)
      socket.off('agent:setup-error', handleSetupError)
      socket.off('catalog:indexing-progress', handleIndexingProgress)
    }
  }, [orgSlug, selectedAgentId, queryClient])

  // ─── Prompt to activate when the score crosses the 80 threshold ───
  // We track the previous score per agent. When it goes from < 80 to >= 80 during the
  // session (and the agent isn't already active), we ask the user if they want to
  // activate — answering "yes" opens the activation modal.
  const prevScoresRef = useRef<Record<string, number>>({})

  useEffect(() => {
    if (!selectedAgent) return
    const prev = prevScoresRef.current[selectedAgent.id]
    prevScoresRef.current[selectedAgent.id] = selectedAgent.score

    if (
      prev !== undefined &&
      prev < 80 &&
      selectedAgent.score >= 80 &&
      selectedAgent.status !== 'ACTIVE'
    ) {
      setScorePromptOpen(true)
    }
  }, [selectedAgent])

  // ─── Mutations ───

  const { message } = App.useApp()

  const createMutation = useMutation({
    mutationFn: ({ name, socialAccountIds }: { name?: string; socialAccountIds: string[] }) =>
      agentApi.create({ organisationId: orgSlug, socialAccountIds, name }),
    onSuccess: (newAgent) => {
      queryClient.invalidateQueries({ queryKey: ['agents', orgSlug] })
      selectAgent(newAgent.id)
      setCreateOpen(false)
    },
  })

  const activateMutation = useMutation({
    mutationFn: (data: {
      activateAll?: boolean
      activateAds?: boolean
      activateNewConversations?: boolean
      contacts?: Record<string, string[]>
    }) => agentApi.activate(selectedAgentId!, data),
    onSuccess: async (activated) => {
      queryClient.invalidateQueries({ queryKey: ['agents', orgSlug] })
      setActivateOpen(false)

      // Reflect the activation in the setup status — if any work remains, prompt the
      // user to head back to the dashboard to continue.
      const apiUrl = import.meta.env.VITE_API_URL || 'https://api-moderator.bedones.local'
      try {
        const res = await fetch(`${apiUrl}/organisations/${orgSlug}/setup-status`, {
          credentials: 'include',
        })
        if (res.ok) {
          const status = (await res.json()) as { pendingCount: number }
          // Invalidate so the dashboard re-fetches when the user navigates back.
          queryClient.invalidateQueries({
            queryKey: [
              'get',
              '/organisations/{id}/setup-status',
              { params: { path: { id: orgSlug } } },
            ],
          })
          if (status.pendingCount > 0) {
            setActivationSuccess({
              agentName: activated.name ?? t('agent.default_name'),
              remaining: status.pendingCount,
            })
          }
        }
      } catch {
        // Setup status is non-critical here — activation already succeeded.
      }
    },
  })

  const updateModelMutation = useMutation({
    mutationFn: (tier: 'flash' | 'pro' | 'ultra') =>
      agentApi.updateLiveModelTier(selectedAgentId!, tier),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents', orgSlug] })
      message.success(t('agent.model_updated'))
    },
    onError: () => {
      message.error(t('agent.model_update_error'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (agentId: string) => agentApi.remove(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents', orgSlug] })
      if (selectedAgentId) selectAgent(null)
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: (agentId: string) => agentApi.deactivate(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents', orgSlug] })
    },
  })

  const updateSocialAccountsMutation = useMutation({
    mutationFn: ({ agentId, socialAccountIds }: { agentId: string; socialAccountIds: string[] }) =>
      agentApi.updateSocialAccounts(agentId, socialAccountIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents', orgSlug] })
      setEditAgent(null)
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
    setSetupPhase('analyzing-catalogs')
    setIndexingProgress(null)

    try {
      await agentApi.startSetup(selectedAgentId, orgSlug)
    } catch {
      setSetupPhase('error')
    }
  }, [selectedAgentId, orgSlug])

  const handleSelectAgent = (agentId: string) => {
    selectAgent(agentId)
    if (!isDesktop) setShowList(false)
  }

  const handleEditResources = useCallback((agent: import('@app/lib/api/agent-api').Agent) => {
    setEditAgent(agent)
  }, [])

  const handleDeactivate = useCallback(
    (agentId: string) => {
      deactivateMutation.mutate(agentId)
    },
    [deactivateMutation],
  )

  const handleDelete = useCallback(
    (agentId: string) => {
      deleteMutation.mutate(agentId)
    },
    [deleteMutation],
  )

  // ─── Render ───

  const agents = agentsQuery.data || []
  const socialAccounts = socialAccountsQuery.data || []
  const catalogs = catalogsQuery.data || []

  // ─── Empty state (no agents) ───

  if (!agentsQuery.isLoading && agents.length === 0 && !selectedAgentId) {
    return (
      <div className="flex h-[100dvh] flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]">
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
      // Setup in progress — show phases
      if (setupPhase === 'analyzing-catalogs' || setupPhase === 'initializing') {
        const progressLabel =
          indexingProgress && indexingProgress.total > 0
            ? t('agent.setup_indexing_progress', {
                processed: indexingProgress.processed,
                total: indexingProgress.total,
              })
            : null

        return (
          <SocialSetup
            icon={<Loader2 size={48} strokeWidth={1.5} className="animate-spin" />}
            color="var(--ant-color-primary)"
            title={
              setupPhase === 'analyzing-catalogs'
                ? t('agent.setup_phase_catalogs')
                : t('agent.setup_phase_initializing')
            }
            description={
              progressLabel ||
              (setupPhase === 'analyzing-catalogs'
                ? t('agent.setup_phase_catalogs_desc')
                : t('agent.setup_phase_initializing_desc'))
            }
          />
        )
      }

      // Setup error — show retry
      if (setupPhase === 'error') {
        return (
          <SocialSetup
            icon={<Sparkles size={48} strokeWidth={1.5} />}
            color="var(--ant-color-error)"
            title={t('agent.setup_error_title')}
            description={t('agent.setup_error_desc')}
            buttonLabel={t('agent.setup_retry')}
            buttonIcon={<Sparkles size={18} />}
            onAction={handleStartConfig}
          />
        )
      }

      // Default DRAFT state — ready to start
      return (
        <SocialSetup
          icon={<Sparkles size={48} strokeWidth={1.5} />}
          color="var(--ant-color-text-secondary)"
          title={t('agent.draft_title')}
          description={t('agent.draft_desc')}
        >
          <div className="flex flex-col items-center gap-3">
            <Button
              type="primary"
              icon={<Sparkles size={18} />}
              onClick={handleStartConfig}
              className="h-12 px-8 text-base font-semibold"
            >
              {t('agent.start_config')}
            </Button>
            <AgentActionsPopover
              agent={selectedAgent}
              onEditResources={() => handleEditResources(selectedAgent)}
              onActivationSettings={() => setActivateOpen(true)}
              onDeactivate={() => handleDeactivate(selectedAgent.id)}
              onDelete={() => handleDelete(selectedAgent.id)}
            >
              <Button
                icon={<MoreHorizontal size={18} />}
                className="h-12 px-8 text-base font-semibold"
              >
                {t('agent.other_actions')}
              </Button>
            </AgentActionsPopover>
          </div>
        </SocialSetup>
      )
    }

    // CONFIGURING / READY / ACTIVE: show chat
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        {selectedAgent.score >= 80 &&
          (selectedAgent.status === 'READY' || selectedAgent.status === 'PAUSED') && (
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
          isThinking={isThinking}
        />
      </div>
    )
  }

  // ─── Main layout (list + chat) ───

  // On mobile, viewing a single agent's detail (chat) hides the list.
  const isMobileAgentDetail = !isDesktop && !showList && !!selectedAgent

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]">
      <DashboardHeader
        title={t('agent.page_title')}
        action={
          <div className="flex items-center gap-2">
            {selectedAgent && <AgentScoreBadge score={selectedAgent.score} />}
            {/* Settings/actions for the open agent — also available from the list
                rows, but expected here in the detail header. */}
            {selectedAgent && (
              <AgentActionsPopover
                agent={selectedAgent}
                onEditResources={() => handleEditResources(selectedAgent)}
                onActivationSettings={() => setActivateOpen(true)}
                onDeactivate={() => handleDeactivate(selectedAgent.id)}
                onDelete={() => handleDelete(selectedAgent.id)}
              >
                <Button
                  icon={<Settings size={16} strokeWidth={1.5} />}
                  aria-label={t('agent.activation_settings')}
                />
              </AgentActionsPopover>
            )}
            {/* "New agent" is already on the list view — hide it on the mobile detail
                view so it doesn't crowd the agent name. */}
            {!isMobileAgentDetail && (
              <Button
                onClick={() => setCreateOpen(true)}
                icon={<Plus size={16} strokeWidth={1.5} />}
              >
                {t('agent.new_agent')}
              </Button>
            )}
          </div>
        }
        mobileLeft={
          isMobileAgentDetail ? (
            <div className="flex min-w-0 items-center gap-2">
              <Button
                type="text"
                onClick={() => setShowList(true)}
                size="small"
                aria-label={t('common.back')}
                icon={<ArrowLeft size={20} strokeWidth={1.5} />}
              />
              <Tooltip title={selectedAgent.name}>
                <span className="truncate text-sm font-medium text-text-primary">
                  {selectedAgent.name}
                </span>
              </Tooltip>
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
                    onEditResources={() => handleEditResources(agent)}
                    onActivationSettings={() => {
                      selectAgent(agent.id)
                      setActivateOpen(true)
                    }}
                    onDeactivate={() => handleDeactivate(agent.id)}
                    onDelete={() => handleDelete(agent.id)}
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
        open={createOpen || !!editAgent}
        onClose={() => {
          setCreateOpen(false)
          setEditAgent(null)
        }}
        onSubmit={(name, ids) => {
          if (editAgent) {
            updateSocialAccountsMutation.mutate({ agentId: editAgent.id, socialAccountIds: ids })
          } else {
            createMutation.mutate({ name: name || undefined, socialAccountIds: ids })
          }
        }}
        socialAccounts={socialAccounts}
        existingAgents={agents}
        catalogs={catalogs}
        loading={editAgent ? updateSocialAccountsMutation.isPending : createMutation.isPending}
        orgSlug={orgSlug}
        editAgent={editAgent}
      />

      {selectedAgent && (
        <AgentActivateModal
          open={activateOpen}
          onClose={() => setActivateOpen(false)}
          onSubmit={(data) => activateMutation.mutate(data)}
          agent={selectedAgent}
          loading={activateMutation.isPending}
          onChangeModelTier={(tier) => updateModelMutation.mutate(tier)}
          modelTierSaving={updateModelMutation.isPending}
        />
      )}

      <AgentReadyModal
        open={scorePromptOpen}
        onActivate={() => {
          setScorePromptOpen(false)
          setActivateOpen(true)
        }}
        onLater={() => setScorePromptOpen(false)}
      />

      <SetupSuccessModal
        open={Boolean(activationSuccess)}
        subjectName={activationSuccess?.agentName ?? ''}
        title={
          activationSuccess
            ? t('agent.activation_success_title', { name: activationSuccess.agentName })
            : undefined
        }
        remainingCount={activationSuccess?.remaining ?? 0}
        onContinue={() => {
          setActivationSuccess(null)
          navigate({ to: '/app/$orgSlug/dashboard', params: { orgSlug } })
        }}
        onLater={() => setActivationSuccess(null)}
      />
    </div>
  )
}
