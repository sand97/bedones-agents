interface PieLegendProps {
  data: { name: string; value: number; color: string }[]
}

export function PieLegend({ data }: PieLegendProps) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div className="flex flex-col gap-2">
      {data.map((d) => (
        <div key={d.name} className="flex items-center gap-2 text-sm">
          <span
            className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
            style={{ background: d.color }}
          />
          <span className="flex-1 text-text-secondary">{d.name}</span>
          <span className="font-medium text-text-primary">
            {Math.round((d.value / total) * 100)}%
          </span>
        </div>
      ))}
    </div>
  )
}
