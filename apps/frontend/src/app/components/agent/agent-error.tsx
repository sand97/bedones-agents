import { Empty, Button } from 'antd'
import { useTranslation } from 'react-i18next'
import { AlertCircle } from 'lucide-react'

interface AgentErrorProps {
  onRetry: () => void
}

export function AgentError({ onRetry }: AgentErrorProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-1 items-center justify-center">
      <Empty
        image={<AlertCircle size={48} className="text-text-muted" />}
        description={
          <div className="mt-2">
            <div className="text-sm font-medium text-text-primary">{t('agent.loading_error')}</div>
            <div className="mt-1 text-xs text-text-muted">{t('agent.load_context_error')}</div>
            <Button className="mt-4" onClick={onRetry}>
              {t('common.retry')}
            </Button>
          </div>
        }
      />
    </div>
  )
}
