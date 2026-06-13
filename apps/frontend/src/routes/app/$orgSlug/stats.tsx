import { useMemo, useState } from 'react'
import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router'
import { buildShareMeta } from '@app/lib/share-meta'
import { useTranslation } from 'react-i18next'
import { DatePicker, Skeleton } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import 'dayjs/locale/fr'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { useLayout } from '@app/contexts/layout-context'
import { StatCard } from '@app/components/stats/stat-card'
import { CreditUsageCard } from '@app/components/stats/credit-usage-card'
import { ActivityChart } from '@app/components/stats/activity-chart'
import { NetworkPieChart } from '@app/components/stats/network-pie-chart'
import { $api } from '@app/lib/api/$api'
import {
  PERIOD_CONFIG,
  STAT_CARD_ICONS,
  STAT_CARD_LABELS,
  MESSAGE_NETWORK_DISPLAY,
  COMMENT_NETWORK_DISPLAY,
  type Period,
  type TimeSeriesPoint,
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

function getDateRange(period: Period, anchor: Dayjs): { from: Dayjs; to: Dayjs } {
  if (period === 'week') {
    const from = anchor.startOf('isoWeek').startOf('day')
    return { from, to: from.add(1, 'week') }
  }
  if (period === 'month') {
    const from = anchor.startOf('month').startOf('day')
    return { from, to: from.add(1, 'month') }
  }
  const from = anchor.startOf('year').startOf('day')
  return { from, to: from.add(1, 'year') }
}

function formatBucketLabel(date: string, period: Period): string {
  const d = dayjs(date)
  if (period === 'week') return d.format('ddd')
  if (period === 'year') return d.format('MMM')
  const monthStart = d.startOf('month')
  const weekIndex = Math.floor(d.diff(monthStart, 'day') / 7) + 1
  return `S${weekIndex}`
}

export const Route = createFileRoute('/app/$orgSlug/stats')({
  head: () =>
    buildShareMeta({
      title: 'Voir les statistiques',
      description: 'Cliquez pour consulter les statistiques de ce compte',
      image: '/og/stats.png',
    }),
  component: StatsPage,
})

function StatsPage() {
  const { t } = useTranslation()
  const { isDesktop } = useLayout()
  const navigate = useNavigate()
  const { orgSlug } = useParams({ strict: false }) as { orgSlug: string }
  const [period, setPeriod] = useState<Period>('week')
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs())
  const [visibleSeries, setVisibleSeries] = useState<Set<string>>(
    new Set(['messages', 'commentaires', 'credits']),
  )

  const { from, to } = useMemo(() => getDateRange(period, selectedDate), [period, selectedDate])
  const bucket = PERIOD_CONFIG[period].bucket

  const statsQuery = $api.useQuery('get', '/stats/org/{organisationId}', {
    params: {
      path: { organisationId: orgSlug },
      query: { from: from.toISOString(), to: to.toISOString(), bucket },
    },
  })

  const creditsQuery = $api.useQuery('get', '/stats/org/{organisationId}/credits', {
    params: { path: { organisationId: orgSlug } },
  })

  // Le quota affiché correspond au forfait actif (free=200, pro=1000,
  // business=3000). Selon le forfait, on propose soit de monter d'offre, soit
  // d'acheter des crédits supplémentaires (cf. issues #101 et #102).
  const plan = creditsQuery.data?.plan ?? 'free'
  const creditActionLabel = plan === 'free' ? t('stats.upgrade_plan') : t('stats.buy_credits')
  const goToPlanPage = () => navigate({ to: '/app/$orgSlug/plan', params: { orgSlug } })

  const overviewCards = useMemo(() => {
    const overview = statsQuery.data?.overview
    return (['comments', 'messages', 'aiResponses'] as const).map((key) => ({
      label: STAT_CARD_LABELS[key],
      value: overview?.[key]?.value ?? 0,
      change: overview?.[key]?.change ?? 0,
      icon: STAT_CARD_ICONS[key],
    }))
  }, [statsQuery.data])

  const chartData = useMemo<TimeSeriesPoint[]>(() => {
    return (statsQuery.data?.activity ?? []).map((p) => ({
      label: formatBucketLabel(p.date, period),
      messages: p.messages,
      commentaires: p.commentaires,
      credits: p.credits,
    }))
  }, [statsQuery.data, period])

  const messagesByNetwork = useMemo(() => {
    return (statsQuery.data?.messagesByNetwork ?? [])
      .map((row) => {
        const display = MESSAGE_NETWORK_DISPLAY[row.provider]
        if (!display) return null
        return { name: display.name, value: row.count, color: display.color }
      })
      .filter((d): d is { name: string; value: number; color: string } => d !== null)
  }, [statsQuery.data])

  const commentsByNetwork = useMemo(() => {
    return (statsQuery.data?.commentsByNetwork ?? [])
      .map((row) => {
        const display = COMMENT_NETWORK_DISPLAY[row.provider]
        if (!display) return null
        return { name: display.name, value: row.count, color: display.color }
      })
      .filter((d): d is { name: string; value: number; color: string } => d !== null)
  }, [statsQuery.data])

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

  const isLoading = statsQuery.isLoading

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title={t('stats.title')} />

      <div className="flex-1 p-4 lg:p-6">
        <div className="mb-4">
          <CreditUsageCard
            used={creditsQuery.data?.used ?? 0}
            total={creditsQuery.data?.total ?? 0}
            loading={creditsQuery.isLoading}
            actionLabel={creditsQuery.isLoading ? undefined : creditActionLabel}
            onAction={goToPlanPage}
          />
        </div>

        <div className="stats-grid mb-4 lg:mb-6">
          {overviewCards.map((s) => (
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

          {isLoading ? (
            <Skeleton active paragraph={{ rows: isDesktop ? 6 : 4 }} title={false} />
          ) : (
            <ActivityChart
              data={chartData}
              visibleSeries={visibleSeries}
              onToggleSeries={toggleSeries}
              height={isDesktop ? 280 : 200}
            />
          )}
        </div>

        <div className={`grid gap-4 lg:gap-6 ${isDesktop ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <NetworkPieChart title={t('stats.messages_by_network')} data={messagesByNetwork} />
          <NetworkPieChart title={t('stats.comments_by_network')} data={commentsByNetwork} />
        </div>
      </div>
    </div>
  )
}
