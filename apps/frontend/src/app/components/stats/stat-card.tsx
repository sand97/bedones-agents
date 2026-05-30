import { TrendingUp, TrendingDown } from 'lucide-react'

interface StatCardProps {
  label: string
  value: number
  change: number
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>
}

export function StatCard({ label, value, change, icon: Icon }: StatCardProps) {
  const isPositive = change >= 0
  return (
    <div className="stats-card">
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-subtle">
          <Icon size={18} strokeWidth={1} />
        </div>
        <span
          className="flex items-center gap-1 text-xs font-medium"
          style={{ color: isPositive ? '#10b981' : '#ef4444' }}
        >
          {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {isPositive ? '+' : ''}
          {change}%
        </span>
      </div>
      <div className="mt-3">
        <div className="text-2xl font-semibold text-text-primary">
          {value.toLocaleString('fr-FR')}
        </div>
        <div className="mt-0.5 text-sm text-text-secondary">{label}</div>
      </div>
    </div>
  )
}
