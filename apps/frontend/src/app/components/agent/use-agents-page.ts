import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { useLayout } from '@app/contexts/layout-context'
import { getSocket } from '@app/lib/socket'
import {
  agentApi,
  catalogApi,
  socialApi,
  type AgentMessage as ApiAgentMessage,
} from '@app/lib/api/agent-api'
import type { AgentMessage, AgentChoiceOption } from '@app/components/agent/mock-data'

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

export function useAgentsPage() {
  const { t } = useTranslation()
  const { orgSlug } = useParams({ strict: false }) as { orgSlug: string }
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

  const agents = agentsQuery.data || []
  const socialAccounts = socialAccountsQuery.data || []
  const catalogs = catalogsQuery.data || []

  return {
    selectedAgentId,
    selectAgent,
    createOpen,
    setCreateOpen,
    activateOpen,
    setActivateOpen,
    scorePromptOpen,
    setScorePromptOpen,
    activationSuccess,
    setActivationSuccess,
    editAgent,
    setEditAgent,
    messages,
    pendingQuestion,
    isThinking,
    showList,
    setShowList,
    setupPhase,
    indexingProgress,
    agentsQuery,
    selectedAgent,
    createMutation,
    activateMutation,
    updateSocialAccountsMutation,
    handleSendMessage,
    handleDismissQuestion,
    handleStartConfig,
    handleSelectAgent,
    handleEditResources,
    handleDeactivate,
    handleDelete,
    agents,
    socialAccounts,
    catalogs,
  }
}
