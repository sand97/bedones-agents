import type { ReactNode } from 'react'
import { Button } from 'antd'
import { Plus } from 'lucide-react'

interface SocialSetupProps {
  icon: ReactNode
  color: string
  title: string
  description: string
  buttonLabel?: string
  buttonType?: 'primary' | 'default'
  buttonIcon?: ReactNode
  onAction?: () => void
  loading?: boolean
  /** Secondary action — rendered next to the primary button by default. */
  secondaryButtonLabel?: string
  secondaryButtonType?: 'primary' | 'default'
  secondaryButtonIcon?: ReactNode
  onSecondaryAction?: () => void
  secondaryLoading?: boolean
  actionsLayout?: 'row' | 'stack'
  children?: ReactNode
}

export function SocialSetup({
  icon,
  color,
  title,
  description,
  buttonLabel,
  buttonType = 'primary',
  buttonIcon = <Plus size={18} />,
  onAction,
  loading,
  secondaryButtonLabel,
  secondaryButtonType = 'default',
  secondaryButtonIcon,
  onSecondaryAction,
  secondaryLoading,
  actionsLayout = 'row',
  children,
}: SocialSetupProps) {
  const actionsClassName =
    actionsLayout === 'stack'
      ? 'flex flex-col items-center justify-center gap-3'
      : 'flex flex-wrap items-center justify-center gap-3'

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="flex items-center justify-center rounded-3xl" style={{ color }}>
          {icon}
        </div>

        <div className="mt-6 mb-6">
          <h2 className="m-0 text-base font-semibold text-text-primary">{title}</h2>
          <p className="m-0 text-sm leading-relaxed text-text-secondary">{description}</p>
        </div>

        {children}

        {(buttonLabel || secondaryButtonLabel) && (
          <div className={actionsClassName}>
            {buttonLabel && (
              <Button
                type={buttonType}
                loading={loading}
                onClick={onAction}
                className="h-12 px-8 text-base font-semibold"
                icon={buttonIcon}
              >
                {buttonLabel}
              </Button>
            )}
            {secondaryButtonLabel && (
              <Button
                type={secondaryButtonType}
                loading={secondaryLoading}
                onClick={onSecondaryAction}
                className="h-12 px-8 text-base font-semibold"
                icon={secondaryButtonIcon}
              >
                {secondaryButtonLabel}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
