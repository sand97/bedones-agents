import { Button, Modal } from 'antd'
import { PartyPopper } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface AgentReadyModalProps {
  open: boolean
  onActivate: () => void
  onLater: () => void
}

/**
 * Shown when an agent's score crosses the activation threshold. Centered modal
 * with a celebratory illustration and centered copy (replaces the old
 * Modal.confirm that used a warning icon).
 */
export function AgentReadyModal({ open, onActivate, onLater }: AgentReadyModalProps) {
  const { t } = useTranslation()

  return (
    <Modal open={open} onCancel={onLater} footer={null} width={420} centered destroyOnHidden>
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-full"
          style={{ background: 'var(--ant-color-primary-bg, #eef2ff)' }}
        >
          <PartyPopper
            size={40}
            strokeWidth={1.5}
            style={{ color: 'var(--ant-color-primary)' }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="m-0 text-base font-semibold text-text-primary">
            {t('agent.score_reached_title')}
          </h3>
          <p className="m-0 text-sm text-text-secondary">{t('agent.score_reached_desc')}</p>
        </div>

        <div className="mt-2 flex w-full items-center justify-center gap-3">
          <Button onClick={onLater}>{t('common.later')}</Button>
          <Button type="primary" onClick={onActivate}>
            {t('agent.score_reached_confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
