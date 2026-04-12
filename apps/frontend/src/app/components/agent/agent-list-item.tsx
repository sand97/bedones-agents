import { SocialBadge } from '@app/components/shared/social-badge'
import type { SocialNetwork } from '@app/components/whatsapp/mock-data'
import type { Agent } from '@app/lib/api/agent-api'

interface AgentListItemProps {
  agent: Agent
  isActive: boolean
  onClick: () => void
}

export function AgentListItem({ agent, isActive, onClick }: AgentListItemProps) {
  const socialNames = agent.socialAccounts
    .map(
      (sa) => sa.socialAccount.pageName || sa.socialAccount.username || sa.socialAccount.provider,
    )
    .join(', ')

  return (
    <button
      type="button"
      onClick={onClick}
      className={`chat-conv-item ${isActive ? 'chat-conv-item--active' : ''}`}
    >
      <div className="flex flex-1 flex-col gap-1 overflow-hidden">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {agent.socialAccounts.map((sa) => {
              const network = (
                sa.socialAccount.provider === 'FACEBOOK'
                  ? 'messenger'
                  : sa.socialAccount.provider.toLowerCase()
              ) as SocialNetwork
              return <SocialBadge key={sa.id} network={network} size={18} />
            })}
          </div>
          <span className="flex-1 truncate text-sm font-medium text-text-primary">
            {agent.name || socialNames}
          </span>
          <span
            className="flex-shrink-0 text-xs"
            style={{
              color:
                agent.score >= 80 ? 'var(--ant-color-success)' : 'var(--ant-color-text-secondary)',
            }}
          >
            {agent.score}/100
          </span>
        </div>
        {agent.name && <span className="truncate text-xs text-text-muted">{socialNames}</span>}
      </div>
    </button>
  )
}
