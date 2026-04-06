import { Empty, Button } from 'antd'
import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'

interface AgentEmptyProps {
  onStart: () => void
}

export function AgentEmpty({ onStart }: AgentEmptyProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-1 items-center justify-center">
      <Empty
        image={<Sparkles size={48} strokeWidth={1.5} className="text-text-muted" />}
        description={
          <div className="mt-2">
            <div className="text-sm font-medium text-text-primary">{t('agent.setup_title')}</div>
            <div className="mt-1 text-xs text-text-muted">{t('agent.setup_desc')}</div>
            <Button type="primary" className="mt-4" onClick={onStart}>
              {t('common.start')}
            </Button>
          </div>
        }
      />
    </div>
  )
}
