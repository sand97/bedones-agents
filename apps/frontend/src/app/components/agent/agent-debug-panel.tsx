import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Select, Button } from 'antd'
import { Bug, X } from 'lucide-react'
import type { AgentPageState } from './mock-data'

interface AgentDebugPanelProps {
  currentState: AgentPageState
  onStateChange: (state: AgentPageState) => void
  onInjectMCQ: () => void
  onInjectSCQ: () => void
}

export function AgentDebugPanel({
  currentState,
  onStateChange,
  onInjectMCQ,
  onInjectSCQ,
}: AgentDebugPanelProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const STATE_OPTIONS = [
    { value: 'empty', label: 'Empty' },
    { value: 'loading', label: 'Loading (Skeleton)' },
    { value: 'recap', label: t('agent.recap') },
    { value: 'chat', label: 'Chat' },
    { value: 'error', label: 'Erreur' },
  ]

  if (!open) {
    return (
      <Button
        type="default"
        shape="circle"
        onClick={() => setOpen(true)}
        icon={<Bug size={18} />}
        className="fixed top-4 right-4 z-50 shadow-card"
      />
    )
  }

  return (
    <div className="fixed top-4 right-4 z-50 w-64 rounded-card border border-border-default bg-bg-surface shadow-popover">
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
        <span className="text-xs font-semibold text-text-primary">Debug Panel</span>
        <Button type="text" size="small" onClick={() => setOpen(false)} icon={<X size={14} />} />
      </div>

      <div className="flex flex-col gap-3 p-4">
        <div>
          <div className="mb-1.5 text-xs text-text-muted">État de la page</div>
          <Select
            value={currentState}
            onChange={onStateChange}
            options={STATE_OPTIONS}
            className="w-full"
            size="small"
          />
        </div>

        {currentState === 'chat' && (
          <div className="flex flex-col gap-2">
            <div className="text-xs text-text-muted">Injecter un message</div>
            <Button size="small" onClick={onInjectMCQ} block>
              {t('agent.add_mcq')}
            </Button>
            <Button size="small" onClick={onInjectSCQ} block>
              {t('agent.add_scq')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
