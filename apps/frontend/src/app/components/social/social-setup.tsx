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
  children,
}: SocialSetupProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="flex max-w-md flex-col items-center text-center">
        <div
          className="flex items-center justify-center rounded-3xl"
          style={{ background: `${color}14`, color }}
        >
          {icon}
        </div>

        <div className="mt-6 mb-6">
          <h2 className="m-0 text-base font-bold text-text-primary">{title}</h2>
          <p className="m-0 text-sm leading-relaxed text-text-secondary">{description}</p>
        </div>

        {children}

        {buttonLabel && (
          <Button
            type={buttonType}
            size="large"
            loading={loading}
            onClick={onAction}
            className="h-12 px-8 text-base font-semibold"
            icon={buttonIcon}
          >
            {buttonLabel}
          </Button>
        )}
      </div>
    </div>
  )
}
