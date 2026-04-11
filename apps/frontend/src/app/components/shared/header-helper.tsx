import type { ReactNode } from 'react'
import { Button } from 'antd'

interface HeaderHelperAction {
  title: string
  onClick: () => void
}

interface HeaderHelperProps {
  icon?: ReactNode
  title: string
  subtitle: string
  primaryAction?: HeaderHelperAction
  secondaryAction?: HeaderHelperAction
}

export function HeaderHelper({
  icon,
  title,
  subtitle,
  primaryAction,
  secondaryAction,
}: HeaderHelperProps) {
  return (
    <div className="flex items-center gap-3 border-b border-border-subtle bg-bg-subtle px-4 py-3">
      {icon && <div className="flex-shrink-0 text-text-muted">{icon}</div>}
      <div className="flex flex-1 flex-col">
        <span className="text-sm font-medium text-text-primary">{title}</span>
        <span className="text-xs text-text-muted">{subtitle}</span>
      </div>
      <div className="flex items-center gap-2">
        {secondaryAction && (
          <Button size="small" type="text" onClick={secondaryAction.onClick}>
            {secondaryAction.title}
          </Button>
        )}
        {primaryAction && (
          <Button size="small" onClick={primaryAction.onClick}>
            {primaryAction.title}
          </Button>
        )}
      </div>
    </div>
  )
}
