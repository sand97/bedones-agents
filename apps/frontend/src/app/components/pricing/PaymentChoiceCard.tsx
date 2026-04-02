import { Radio } from 'antd'
import type { ReactNode } from 'react'

interface PaymentChoiceCardProps {
  active: boolean
  description: string
  disabled?: boolean
  icon: ReactNode
  title: string
  onClick: () => void
}

export function PaymentChoiceCard({
  active,
  description,
  disabled,
  icon,
  title,
  onClick,
}: PaymentChoiceCardProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
      className={`group w-full appearance-none rounded-panel border bg-bg-surface p-5 text-left transition focus:outline-none ${
        disabled
          ? 'cursor-not-allowed border-transparent opacity-55 shadow-card'
          : active
            ? 'cursor-pointer border-text-primary shadow-none'
            : 'cursor-pointer border-transparent shadow-card hover:border-transparent hover:bg-bg-surface hover:shadow-[var(--shadow-card),0_0_0_1px_var(--color-text-primary)] focus:border-transparent focus:bg-bg-surface focus:shadow-[var(--shadow-card),0_0_0_1px_var(--color-text-primary)]'
      }`}
    >
      <div className="pointer-events-none flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-accent text-[22px] text-text-primary">
            {icon}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="m-0 text-base font-semibold text-text-primary">{title}</p>
            </div>
            <p className="mt-2 mb-0 text-sm leading-6 text-text-secondary">{description}</p>
          </div>
        </div>

        <Radio checked={active} disabled={disabled} className="pointer-events-none" />
      </div>
    </button>
  )
}
