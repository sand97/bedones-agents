import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { ChartTooltip } from './chart-tooltip'
import { SERIES_CONFIG, type TimeSeriesPoint } from './mock-data'

interface ActivityChartProps {
  data: TimeSeriesPoint[]
  visibleSeries: Set<string>
  onToggleSeries: (key: string) => void
  height: number
}

export function ActivityChart({ data, visibleSeries, onToggleSeries, height }: ActivityChartProps) {
  return (
    <div className="">
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              {SERIES_CONFIG.map((s) => (
                <linearGradient key={s.key} id={`gradient-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: '#494949' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis tick={{ fontSize: 12, fill: '#494949' }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />
            {SERIES_CONFIG.map((s) =>
              visibleSeries.has(s.key) ? (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.color}
                  fill={`url(#gradient-${s.key})`}
                  strokeWidth={2}
                  dot={false}
                />
              ) : null,
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {SERIES_CONFIG.map((s) => {
          const active = visibleSeries.has(s.key)
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onToggleSeries(s.key)}
              className={`stats-toggle ${active ? 'stats-toggle--active' : ''}`}
              style={active ? { borderColor: s.color, background: `${s.color}0d` } : undefined}
            >
              <span
                className="stats-toggle__check"
                style={active ? { background: s.color, borderColor: s.color } : undefined}
              >
                {active && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path
                      d="M2 5L4.5 7.5L8 3"
                      stroke="#fff"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              <span className="text-sm">{s.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
