import { Progress, Tooltip } from 'antd'
import { useTranslation } from 'react-i18next'

interface AgentScoreBadgeProps {
  score: number
}

export function AgentScoreBadge({ score }: AgentScoreBadgeProps) {
  const { t } = useTranslation()
  const isReady = score >= 80

  return (
    <Tooltip title={isReady ? t('agent.score_ready_tooltip') : t('agent.score_not_ready_tooltip')}>
      <Progress
        type="circle"
        percent={score}
        size={40}
        strokeColor="var(--ant-color-text)"
        format={(p) => <span style={{ fontSize: 11, fontWeight: 600 }}>{p}</span>}
      />
    </Tooltip>
  )
}
