import type { ComponentProps } from 'react'
import { Bot, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { AgentCreateModal } from '@app/components/agent/agent-create-modal'
import { SocialSetup } from '@app/components/social/social-setup'

type AgentCreateModalProps = ComponentProps<typeof AgentCreateModal>

interface AgentsEmptyStateProps {
  createOpen: boolean
  setCreateOpen: (open: boolean) => void
  onSubmit: AgentCreateModalProps['onSubmit']
  socialAccounts: AgentCreateModalProps['socialAccounts']
  agents: AgentCreateModalProps['existingAgents']
  catalogs: AgentCreateModalProps['catalogs']
  loading: boolean
  orgSlug: string
}

export function AgentsEmptyState({
  createOpen,
  setCreateOpen,
  onSubmit,
  socialAccounts,
  agents,
  catalogs,
  loading,
  orgSlug,
}: AgentsEmptyStateProps) {
  const { t } = useTranslation()

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
        onSubmit={onSubmit}
        socialAccounts={socialAccounts}
        existingAgents={agents}
        catalogs={catalogs}
        loading={loading}
        orgSlug={orgSlug}
      />
    </div>
  )
}
