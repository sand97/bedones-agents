import { Tooltip } from 'antd'

interface AgentScoreBadgeProps {
  score: number
}

export function AgentScoreBadge({ score }: AgentScoreBadgeProps) {
  const isReady = score >= 80

  return (
    <Tooltip
      title={
        isReady
          ? 'Votre agent peut être activé.'
          : 'Votre agent doit avoir un score > 80 pour être activé.'
      }
    >
      <div
        className="flex cursor-help items-center gap-2 rounded-full border px-3 py-1"
        style={{
          borderColor: isReady ? 'var(--ant-color-success)' : 'var(--ant-color-border)',
          color: isReady ? 'var(--ant-color-success)' : 'var(--ant-color-text)',
        }}
      >
        <div
          className="h-2 w-2 rounded-full"
          style={{
            background: isReady ? 'var(--ant-color-success)' : 'var(--ant-color-border)',
          }}
        />
        <span className="text-xs font-medium">{score}/100</span>
      </div>
    </Tooltip>
  )
}
