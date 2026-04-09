import { Button } from 'antd'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'

interface AgentSetupBannerProps {
  provider: string
}

const PROVIDER_LABELS: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  FACEBOOK: 'Facebook Messenger',
  INSTAGRAM: 'Instagram DM',
}

/**
 * Banner shown in messaging pages when no agent is configured
 * for the current social media. This is a priority banner that
 * overlays the chat interface.
 */
export function AgentSetupBanner({ provider }: AgentSetupBannerProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { orgSlug } = useParams({ strict: false }) as { orgSlug: string }

  return (
    <div className="flex items-center gap-3 border-b border-border-subtle bg-bg-subtle px-4 py-3">
      <Sparkles size={18} strokeWidth={1.5} className="flex-shrink-0 text-text-muted" />
      <div className="flex flex-1 flex-col">
        <span className="text-sm font-medium text-text-primary">
          {t('agent.no_agent_configured')}
        </span>
        <span className="text-xs text-text-muted">
          {t('agent.setup_banner_desc', { provider: PROVIDER_LABELS[provider] || provider })}
        </span>
      </div>
      <Button
        size="small"
        onClick={() =>
          navigate({
            to: '/app/$orgSlug/agents' as string,
            params: { orgSlug },
          })
        }
      >
        {t('agent.configure')}
      </Button>
    </div>
  )
}
