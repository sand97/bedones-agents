import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router'
import { Button, Spin, Tooltip } from 'antd'
import { SetupSuccessModal } from '@app/components/dashboard/setup-success-modal'
import { AgentReadyModal } from '@app/components/agent/agent-ready-modal'
import { Plus, ArrowLeft, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { AgentCreateModal } from '@app/components/agent/agent-create-modal'
import { AgentActivateModal } from '@app/components/agent/agent-activate-modal'
import { AgentListItem } from '@app/components/agent/agent-list-item'
import { AgentActionsPopover } from '@app/components/agent/agent-actions-popover'
import { AgentScoreBadge } from '@app/components/agent/agent-score-badge'
import { AgentContent } from '@app/components/agent/agent-content'
import { AgentsEmptyState } from '@app/components/agent/agents-empty-state'
import { useAgentsPage } from '@app/components/agent/use-agents-page'
import { useLayout } from '@app/contexts/layout-context'

export const Route = createFileRoute('/app/$orgSlug/agents')({
  component: AgentsPage,
})

function AgentsPage() {
  const { t } = useTranslation()
  const { orgSlug } = useParams({ strict: false }) as { orgSlug: string }
  const navigate = useNavigate()
  const { isDesktop } = useLayout()

  const {
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
  } = useAgentsPage()

  // ─── Empty state (no agents) ───

  if (!agentsQuery.isLoading && agents.length === 0 && !selectedAgentId) {
    return (
      <AgentsEmptyState
        createOpen={createOpen}
        setCreateOpen={setCreateOpen}
        onSubmit={(name, ids) =>
          createMutation.mutate({ name: name || undefined, socialAccountIds: ids })
        }
        socialAccounts={socialAccounts}
        agents={agents}
        catalogs={catalogs}
        loading={createMutation.isPending}
        orgSlug={orgSlug}
      />
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
            <AgentContent
              selectedAgent={selectedAgent}
              messages={messages}
              pendingQuestion={pendingQuestion}
              isThinking={isThinking}
              setupPhase={setupPhase}
              indexingProgress={indexingProgress}
              handleStartConfig={handleStartConfig}
              handleEditResources={handleEditResources}
              setActivateOpen={setActivateOpen}
              handleDeactivate={handleDeactivate}
              handleDelete={handleDelete}
              handleSendMessage={handleSendMessage}
              handleDismissQuestion={handleDismissQuestion}
            />
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
