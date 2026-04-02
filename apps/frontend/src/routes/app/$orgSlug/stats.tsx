import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { DatePicker } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import 'dayjs/locale/fr'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { useLayout } from '@app/contexts/layout-context'
import { StatCard } from '@app/components/stats/stat-card'
import { CreditUsageCard } from '@app/components/stats/credit-usage-card'
import { ActivityChart } from '@app/components/stats/activity-chart'
import { NetworkPieChart } from '@app/components/stats/network-pie-chart'
import {
  PERIOD_CONFIG,
  STATS_BY_PERIOD,
  TIME_SERIES,
  MESSAGES_BY_NETWORK,
  COMMENTS_BY_NETWORK,
  type Period,
} from '@app/components/stats/mock-data'

dayjs.extend(isoWeek)
dayjs.locale('fr')

const PICKER_MAP: Record<Period, 'week' | 'month' | 'year'> = {
  week: 'week',
  month: 'month',
  year: 'year',
}

function formatPickerValue(value: Dayjs, period: Period) {
  if (period === 'year') return value.format('YYYY')
  if (period === 'month') return value.format('MMMM YYYY')

  const start = value.startOf('isoWeek')
  const end = value.endOf('isoWeek')
  return `${start.format('ddd DD')} - ${end.format('DD MMM')}`
}

export const Route = createFileRoute('/app/$orgSlug/stats')({
  component: StatsPage,
})

function StatsPage() {
  const { isDesktop } = useLayout()
  const [period, setPeriod] = useState<Period>('week')
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs())
  const [visibleSeries, setVisibleSeries] = useState<Set<string>>(
    new Set(['messages', 'commentaires', 'credits']),
  )

  const stats = STATS_BY_PERIOD[period]
  const chartData = TIME_SERIES[period]

  const toggleSeries = (key: string) => {
    setVisibleSeries((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        if (next.size > 1) next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Statistiques et usages" />

      <div className="flex-1 p-4 lg:p-6">
        <div className="mb-4">
          <CreditUsageCard />
        </div>

        <div className="stats-grid mb-4 lg:mb-6">
          {stats.map((s) => (
            <StatCard key={s.label} {...s} />
          ))}
        </div>

        <div className="mb-4 lg:mb-6 stats-card">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="flex gap-2">
              {(Object.keys(PERIOD_CONFIG) as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`stats-period-btn ${period === p ? 'stats-period-btn--active' : ''}`}
                >
                  {PERIOD_CONFIG[p].label}
                </button>
              ))}
            </div>

            <DatePicker
              allowClear={false}
              inputReadOnly
              picker={PICKER_MAP[period]}
              value={selectedDate}
              format={(value) => formatPickerValue(value, period)}
              className="stats-date-picker"
              onChange={(value) => {
                if (value) setSelectedDate(value)
              }}
            />
          </div>

          <ActivityChart
            data={chartData}
            visibleSeries={visibleSeries}
            onToggleSeries={toggleSeries}
            height={isDesktop ? 280 : 200}
          />
        </div>

        <div className={`grid gap-4 lg:gap-6 ${isDesktop ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <NetworkPieChart title="Messages par réseau" data={MESSAGES_BY_NETWORK} />
          <NetworkPieChart title="Commentaires par réseau" data={COMMENTS_BY_NETWORK} />
        </div>
      </div>
    </div>
  )
}
