import { Button, Modal } from 'antd'
import { CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface SetupSuccessModalProps {
  open: boolean
  /** Name of the page / channel that was just configured. */
  subjectName: string
  /** Optional message override (e.g. "Agent activated") — defaults to the page-configured copy. */
  title?: string
  description?: string
  /** Number of remaining setup actions across the organisation. */
  remainingCount: number
  onContinue: () => void
  onLater: () => void
}

export function SetupSuccessModal({
  open,
  subjectName,
  title,
  description,
  remainingCount,
  onContinue,
  onLater,
}: SetupSuccessModalProps) {
  const { t } = useTranslation()

  return (
    <Modal open={open} onCancel={onLater} footer={null} width={420} centered destroyOnHidden>
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
          <CheckCircle2 size={28} className="text-green-500" strokeWidth={2} />
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="m-0 text-base font-semibold text-text-primary">
            {title ?? t('dashboard.setup_success_title', { subject: subjectName })}
          </h3>
          <p className="m-0 text-sm text-text-secondary">
            {description ?? t('dashboard.setup_success_desc', { count: remainingCount })}
          </p>
        </div>

        <div className="mt-2 flex w-full items-center justify-end gap-3">
          <Button onClick={onLater}>{t('dashboard.setup_success_later')}</Button>
          <Button type="primary" onClick={onContinue}>
            {t('dashboard.setup_success_continue')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
