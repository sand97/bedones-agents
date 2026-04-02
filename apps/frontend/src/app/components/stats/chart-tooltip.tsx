import { TOOLTIP_LABELS } from './mock-data'

interface ChartTooltipProps {
  active?: boolean
  payload?: { value: number; name: string; color: string }[]
  label?: string
}

export function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="stats-tooltip">
      <div className="text-xs font-medium text-text-secondary">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-sm">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-text-secondary">{TOOLTIP_LABELS[p.name] ?? p.name}</span>
          <span className="font-semibold text-text-primary">{p.value.toLocaleString('fr-FR')}</span>
        </div>
      ))}
    </div>
  )
}
