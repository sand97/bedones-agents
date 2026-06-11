import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from '@tanstack/react-router'
import { Button } from 'antd'
import { MessageSquare } from 'lucide-react'
import { SocialBadge } from '@app/components/shared/social-badge'
import type { SocialNetwork } from '@app/components/whatsapp/mock-data'
import type { Ticket } from '@app/lib/api/agent-api'

const PROVIDER_TO_NETWORK: Record<string, SocialNetwork> = {
  FACEBOOK: 'messenger',
  INSTAGRAM: 'instagram',
  WHATSAPP: 'whatsapp',
}

// Chat route channel param ($id) per provider — mirrors the chats route.
const PROVIDER_TO_CHANNEL: Record<string, string> = {
  WHATSAPP: 'whatsapp',
  INSTAGRAM: 'instagram-dm',
  FACEBOOK: 'messenger',
  TIKTOK: 'tiktok',
}

export function ContactCell({ ticket }: { ticket: Ticket }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { orgSlug } = useParams({ strict: false }) as { orgSlug?: string }
  const network = ticket.provider ? PROVIDER_TO_NETWORK[ticket.provider] : undefined

  if (!ticket.contactName && !ticket.contactId) {
    return <span className="text-sm text-text-muted">{t('tickets.no_contact')}</span>
  }

  const channel = ticket.provider ? PROVIDER_TO_CHANNEL[ticket.provider] : undefined
  const canOpen = Boolean(orgSlug && channel && ticket.conversationId && ticket.socialAccountId)

  const openConversation = () => {
    if (!orgSlug || !channel) return
    navigate({
      to: '/app/$orgSlug/chats/$id' as string,
      params: { orgSlug, id: channel },
      search: { account: ticket.socialAccountId, conv: ticket.conversationId },
    })
  }

  const name = ticket.contactName || ticket.contactId
  const phone = ticket.contactId

  return (
    <div className="flex items-center gap-2">
      {network && <SocialBadge network={network} />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-text-primary">{name}</div>
        {phone && phone !== name && <div className="truncate text-xs text-text-muted">{phone}</div>}
      </div>
      {canOpen && (
        <Button
          type="text"
          size="small"
          icon={<MessageSquare size={14} />}
          onClick={openConversation}
          title={t('tickets.open_conversation')}
          className="flex-shrink-0"
        />
      )}
    </div>
  )
}
