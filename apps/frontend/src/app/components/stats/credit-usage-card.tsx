import { Progress } from 'antd'
import { Zap } from 'lucide-react'
import { CREDIT_USAGE } from './mock-data'

export function CreditUsageCard() {
  const creditPercent = Math.round((CREDIT_USAGE.used / CREDIT_USAGE.total) * 100)

  return (
    <div className="stats-card flex-1">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-subtle">
          <Zap size={18} strokeWidth={1} />
        </div>
        <div>
          <div className="text-sm font-semibold text-text-primary">Usage des crédits</div>
          <div className="text-xs text-text-secondary">Période en cours</div>
        </div>
      </div>
      <Progress
        percent={creditPercent}
        strokeColor="#000000"
        trailColor="var(--color-bg-subtle)"
        showInfo={false}
        size={{ height: 8 }}
        className="mb-2"
      />
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-secondary">
          <span className="font-semibold text-text-primary">
            {CREDIT_USAGE.used.toLocaleString('fr-FR')}
          </span>{' '}
          / {CREDIT_USAGE.total.toLocaleString('fr-FR')} {CREDIT_USAGE.label}
        </span>
        <span className="font-medium text-text-primary">{creditPercent}%</span>
      </div>
    </div>
  )
}
