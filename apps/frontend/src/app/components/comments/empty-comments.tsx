import type { ReactNode } from 'react'
import { Empty } from 'antd'
import { CommentsIcon } from '@app/components/icons/social-icons'

interface EmptyCommentsProps {
  icon?: ReactNode
  title?: string
  description?: string
}

export function EmptyComments({
  icon = <CommentsIcon width={48} height={48} className="text-brand-facebook" />,
  title = 'Sélectionnez un post',
  description = 'Choisissez un post dans la liste pour voir ses commentaires',
}: EmptyCommentsProps) {
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
