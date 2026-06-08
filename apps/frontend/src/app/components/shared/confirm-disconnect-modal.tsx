import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Button, Input, Modal, Typography } from 'antd'
import { useTranslation } from 'react-i18next'

const { Text } = Typography

interface ConfirmDisconnectModalProps {
  open: boolean
  onClose: () => void
  /** Called once the user typed the exact label and clicked the danger button. */
  onConfirm: () => Promise<void> | void
  /** Exact text the user must re-type to enable the danger button (resource name). */
  resourceLabel: string
  /** Modal title (e.g. "Déconnecter le catalogue"). */
  title: string
  /** Optional explanation of the consequences of the action. */
  description?: ReactNode
  /** Danger button label. Defaults to the shared "disconnect" translation. */
  confirmText?: string
}

/**
 * Reusable "type-to-confirm" danger modal. The destructive action stays disabled
 * until the user re-types the resource's exact label, mirroring the GitHub-style
 * confirmation used for irreversible operations (catalog / page / account
 * disconnect).
 */
export function ConfirmDisconnectModal({
  open,
  onClose,
  onConfirm,
  resourceLabel,
  title,
  description,
  confirmText,
}: ConfirmDisconnectModalProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Reset the typed value whenever the modal is (re)opened/closed.
  useEffect(() => {
    if (!open) setValue('')
  }, [open])

  const canConfirm = value.trim() === resourceLabel.trim() && !submitting

  const handleConfirm = async () => {
    if (!canConfirm) return
    setSubmitting(true)
    try {
      await onConfirm()
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={title}
      width={460}
      destroyOnHidden
      footer={[
        <Button key="cancel" onClick={onClose} disabled={submitting}>
          {t('common.cancel')}
        </Button>,
        <Button
          key="confirm"
          danger
          type="primary"
          loading={submitting}
          disabled={!canConfirm}
          onClick={handleConfirm}
        >
          {confirmText ?? t('confirm_disconnect.confirm')}
        </Button>,
      ]}
    >
      {description && <div className="mb-4 text-sm text-text-muted">{description}</div>}

      <div className="mb-1.5 text-sm text-text-primary">
        {t('confirm_disconnect.prompt')}{' '}
        <Text strong code>
          {resourceLabel}
        </Text>
      </div>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onPressEnter={handleConfirm}
        placeholder={resourceLabel}
        autoFocus
        status={value.length > 0 && !canConfirm ? 'error' : undefined}
      />
    </Modal>
  )
}
