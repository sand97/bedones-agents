import type { ReactNode } from 'react'
import { Empty } from 'antd'
import { WhatsAppIcon } from '@app/components/icons/social-icons'

interface EmptyChatProps {
  icon?: ReactNode
  title?: string
  description?: string
}

export function EmptyChat({
  icon = <WhatsAppIcon width={48} height={48} className="text-brand-whatsapp" />,
  title = 'Sélectionnez une conversation',
  description = 'Choisissez un contact dans la liste pour voir ses messages',
}: EmptyChatProps) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Empty
        image={icon}
        description={
          <div className="mt-2">
            <div className="text-sm font-medium text-text-primary">{title}</div>
            <div className="mt-1 text-xs text-text-muted">{description}</div>
          </div>
        }
      />
    </div>
  )
}
