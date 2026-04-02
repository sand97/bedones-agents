import type { ReactNode } from 'react'
import { Button } from 'antd'
import { Plus } from 'lucide-react'

interface SocialSetupProps {
  icon: ReactNode
  color: string
  title: string
  description: string
  buttonLabel: string
  onConnect?: () => void
  loading?: boolean
  children?: ReactNode
}

export function SocialSetup({
  icon,
  color,
  title,
  description,
  buttonLabel,
  onConnect,
  loading,
  children,
}: SocialSetupProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="flex max-w-md flex-col items-center text-center">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-3xl"
          style={{ background: `${color}14`, color }}
        >
          {icon}
        </div>

        <div className="mt-6 mb-6">
          <h2 className="m-0 mb-2 text-2xl font-bold text-text-primary">{title}</h2>

          <p className="m-0 text-base leading-relaxed text-text-secondary">{description}</p>
        </div>

        {children}

        <Button
          type="primary"
          size="large"
          loading={loading}
          onClick={onConnect}
          className="h-12 px-8 text-base font-semibold"
          icon={<Plus size={18} />}
        >
          {buttonLabel}
        </Button>
      </div>
    </div>
  )
}
