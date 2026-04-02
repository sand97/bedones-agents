import { useState, useCallback } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { AgentEmpty } from '@app/components/agent/agent-empty'
import { AgentSkeleton } from '@app/components/agent/agent-skeleton'
import { AgentError } from '@app/components/agent/agent-error'
import { AgentRecap } from '@app/components/agent/agent-recap'
import { AgentChat } from '@app/components/agent/agent-chat'
import { AgentDebugPanel } from '@app/components/agent/agent-debug-panel'
import type { AgentPageState, AgentMessage } from '@app/components/agent/mock-data'
import {
  MOCK_AGENT_MESSAGES,
  MOCK_AGENT_CONTEXT,
  MOCK_MCQ_MESSAGE,
  MOCK_SCQ_MESSAGE,
} from '@app/components/agent/mock-data'

export const Route = createFileRoute('/app/$orgSlug/agent')({
  component: AgentPage,
})

function AgentPage() {
  const [pageState, setPageState] = useState<AgentPageState>('empty')
  const [messages, setMessages] = useState<AgentMessage[]>([...MOCK_AGENT_MESSAGES])
  const [pendingQuestion, setPendingQuestion] = useState<AgentMessage | null>(null)

  const handleStart = useCallback(() => {
    setPageState('chat')
  }, [])

  const handleEdit = useCallback(() => {
    setPageState('chat')
  }, [])

  const handleRetry = useCallback(() => {
    setPageState('loading')
  }, [])

  const handleSendMessage = useCallback((text: string) => {
    const newMessage: AgentMessage = {
      id: `msg-${Date.now()}`,
      type: 'text',
      from: 'user',
      text,
      timestamp: dayjs().toISOString(),
    }
    setMessages((prev) => [...prev, newMessage])
    // Dismiss pending question when user sends any message
    setPendingQuestion(null)
  }, [])

  const handleDismissQuestion = useCallback(() => {
    setPendingQuestion(null)
  }, [])

  const handleStateChange = useCallback((state: AgentPageState) => {
    setPageState(state)
    setPendingQuestion(null)
    if (state === 'chat') {
      setMessages([...MOCK_AGENT_MESSAGES])
    }
  }, [])

  const handleInjectMCQ = useCallback(() => {
    const msg: AgentMessage = {
      ...MOCK_MCQ_MESSAGE,
      id: `msg-mcq-${Date.now()}`,
      timestamp: dayjs().toISOString(),
    }
    // Add the question text as an agent text bubble in messages
    setMessages((prev) => [...prev, { ...msg, type: 'text' as const }])
    setPendingQuestion(msg)
  }, [])

  const handleInjectSCQ = useCallback(() => {
    const msg: AgentMessage = {
      ...MOCK_SCQ_MESSAGE,
      id: `msg-scq-${Date.now()}`,
      timestamp: dayjs().toISOString(),
    }
    setMessages((prev) => [...prev, { ...msg, type: 'text' as const }])
    setPendingQuestion(msg)
  }, [])

  const renderContent = () => {
    switch (pageState) {
      case 'empty':
        return <AgentEmpty onStart={handleStart} />
      case 'loading':
        return <AgentSkeleton />
      case 'recap':
        return <AgentRecap context={MOCK_AGENT_CONTEXT} onEdit={handleEdit} />
      case 'chat':
        return (
          <AgentChat
            messages={messages}
            onSendMessage={handleSendMessage}
            pendingQuestion={pendingQuestion}
            onDismissQuestion={handleDismissQuestion}
          />
        )
      case 'error':
        return <AgentError onRetry={handleRetry} />
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <DashboardHeader title="Mon Agent" />
      {renderContent()}
      <AgentDebugPanel
        currentState={pageState}
        onStateChange={handleStateChange}
        onInjectMCQ={handleInjectMCQ}
        onInjectSCQ={handleInjectSCQ}
      />
    </div>
  )
}
