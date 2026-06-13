import { Button, Progress, Skeleton } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import { Zap } from 'lucide-react'

interface CreditUsageCardProps {
  used: number
  total: number
  loading?: boolean
  actionLabel?: string
  onAction?: () => void
}

export function CreditUsageCard({
  used,
  total,
  loading,
  actionLabel,
  onAction,
}: CreditUsageCardProps) {
  const safeTotal = total > 0 ? total : 1
  const creditPercent = Math.min(100, Math.round((used / safeTotal) * 100))

  return (
    <div className="stats-card flex-1">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-subtle">
            <Zap size={18} strokeWidth={1} />
          </div>
          <div>
            <div className="text-sm font-semibold text-text-primary">Usage des crédits</div>
            <div className="text-xs text-text-secondary">Période en cours</div>
          </div>
        </div>
        {actionLabel && onAction ? (
          <Button
            type="primary"
            onClick={onAction}
            icon={<ArrowRightOutlined />}
            iconPosition="end"
          >
            {actionLabel}
          </Button>
        ) : null}
      </div>
      {loading ? (
        <Skeleton.Input active size="small" block style={{ height: 8, marginBottom: 12 }} />
      ) : (
        <Progress
          percent={creditPercent}
          strokeColor="#000000"
          trailColor="var(--color-bg-subtle)"
          showInfo={false}
          size={{ height: 8 }}
          className="mb-2"
        />
      )}
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-secondary">
          <span className="font-semibold text-text-primary">{used.toLocaleString('fr-FR')}</span> /{' '}
          {total.toLocaleString('fr-FR')} crédits IA
        </span>
        <span className="font-medium text-text-primary">{creditPercent}%</span>
      </div>
    </div>
  )
}
