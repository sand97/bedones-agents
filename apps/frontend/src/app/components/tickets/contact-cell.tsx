import { Button } from 'antd'
import { ExternalLink } from 'lucide-react'
import { SocialBadge } from '@app/components/shared/social-badge'
import type { TicketListEntry } from '@app/components/whatsapp/mock-data'

export function ContactCell({ entry }: { entry: TicketListEntry }) {
  return (
    <div className="flex items-center gap-2">
      <SocialBadge network={entry.socialNetwork} />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-text-primary">
          {entry.contact.identifier}
        </div>
      </div>
      <Button icon={<ExternalLink size={13} />} size="small" type="text" />
    </div>
  )
}
