import { Button } from 'antd'
import { Sparkles, Zap, MoreHorizontal, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AgentChat } from '@app/components/agent/agent-chat'
import { AgentActionsPopover } from '@app/components/agent/agent-actions-popover'
import { HeaderHelper } from '@app/components/shared/header-helper'
import { SocialSetup } from '@app/components/social/social-setup'
import type { Agent } from '@app/lib/api/agent-api'
import type { AgentMessage } from '@app/components/agent/mock-data'

interface AgentContentProps {
  selectedAgent: Agent | null
  messages: AgentMessage[]
  pendingQuestion: AgentMessage | null
  isThinking: boolean
  setupPhase: 'analyzing-catalogs' | 'initializing' | 'error' | null
  indexingProgress: { processed: number; total: number } | null
  handleStartConfig: () => void
  handleEditResources: (agent: Agent) => void
  setActivateOpen: (open: boolean) => void
  handleDeactivate: (agentId: string) => void
  handleDelete: (agentId: string) => void
  handleSendMessage: (text: string) => void
  handleDismissQuestion: () => void
}

export function AgentContent({
  selectedAgent,
  messages,
  pendingQuestion,
  isThinking,
  setupPhase,
  indexingProgress,
  handleStartConfig,
  handleEditResources,
  setActivateOpen,
  handleDeactivate,
  handleDelete,
  handleSendMessage,
  handleDismissQuestion,
}: AgentContentProps) {
  const { t } = useTranslation()

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
