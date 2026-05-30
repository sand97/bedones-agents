import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { PieLegend } from './pie-legend'

interface NetworkPieChartProps {
  title: string
  data: { name: string; value: number; color: string }[]
}

export function NetworkPieChart({ title, data }: NetworkPieChartProps) {
  return (
    <div className="stats-card">
      <div className="mb-4 text-sm font-semibold text-text-primary">{title}</div>
      <div className="flex items-center gap-6">
        <div style={{ width: 140, height: 140 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={65}
                dataKey="value"
                strokeWidth={0}
              >
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <PieLegend data={data} />
      </div>
    </div>
  )
}
