import dayjs from 'dayjs'
import type { Agent } from '@app/lib/api/agent-api'

const PROVIDER_COLORS: Record<string, string> = {
  WHATSAPP: 'var(--color-brand-whatsapp)',
  FACEBOOK: 'var(--color-brand-facebook)',
  INSTAGRAM: 'var(--color-brand-instagram)',
  TIKTOK: 'var(--color-brand-tiktok)',
}

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

  const lastUpdate = dayjs(agent.updatedAt).format('DD/MM/YYYY HH:mm')

  return (
    <button
      type="button"
      onClick={onClick}
      className={`chat-conv-item ${isActive ? 'chat-conv-item--active' : ''}`}
    >
      <div className="flex flex-1 flex-col gap-1 overflow-hidden">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {agent.socialAccounts.map((sa) => (
              <span
                key={sa.id}
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{ background: PROVIDER_COLORS[sa.socialAccount.provider] || '#999' }}
              />
            ))}
          </div>
          <span className="flex-1 truncate text-sm font-medium text-text-primary">
            {agent.name || socialNames}
          </span>
          <span className="flex-shrink-0 text-xs text-text-muted">{lastUpdate}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="truncate text-xs text-text-muted">{socialNames}</span>
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
      </div>
    </button>
  )
}
