import { useTranslation } from 'react-i18next'
import { SocialBadge } from '@app/components/shared/social-badge'
import type { SocialNetwork } from '@app/components/whatsapp/mock-data'
import type { Ticket } from '@app/lib/api/agent-api'

const PROVIDER_TO_NETWORK: Record<string, SocialNetwork> = {
  FACEBOOK: 'messenger',
  INSTAGRAM: 'instagram',
  WHATSAPP: 'whatsapp',
}

export function ContactCell({ ticket }: { ticket: Ticket }) {
  const { t } = useTranslation()
  const network = ticket.provider ? PROVIDER_TO_NETWORK[ticket.provider] : undefined

  if (!ticket.contactName && !ticket.contactId) {
    return <span className="text-sm text-text-muted">{t('tickets.no_contact')}</span>
  }

  return (
    <div className="flex items-center gap-2">
      {network && <SocialBadge network={network} />}
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-text-primary">
          {ticket.contactName || ticket.contactId}
        </div>
      </div>
    </div>
  )
}
