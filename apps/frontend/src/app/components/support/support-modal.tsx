import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Input, Button, Typography } from 'antd'

const SUPPORT_EMAIL = 'support@bedones.com'

interface SupportModalProps {
  open: boolean
  onClose: () => void
  /** Subject line for the support request. */
  subject?: string
  /** Pre-filled, editable message body. */
  defaultMessage?: string
}

/**
 * Lightweight support contact modal. Shows an editable, pre-filled message and
 * hands it off to the user's email client (mailto) so they can reach the
 * Bedones support team without leaving the current flow.
 */
export function SupportModal({ open, onClose, subject, defaultMessage }: SupportModalProps) {
  const { t } = useTranslation()
  const [message, setMessage] = useState(defaultMessage ?? '')

  // Re-seed the editable body whenever the modal is (re)opened with a new prefill.
  useEffect(() => {
    if (open) setMessage(defaultMessage ?? '')
  }, [open, defaultMessage])

  const send = () => {
    const subjectLine = subject || t('support.default_subject')
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      subjectLine,
    )}&body=${encodeURIComponent(message)}`
    window.location.href = url
    onClose()
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={t('support.title')}
      centered
      footer={[
        <Button key="cancel" onClick={onClose}>
          {t('support.cancel')}
        </Button>,
        <Button key="send" type="primary" onClick={send} disabled={!message.trim()}>
          {t('support.send')}
        </Button>,
      ]}
    >
      <Typography.Paragraph type="secondary" className="text-sm">
        {t('support.lede', { email: SUPPORT_EMAIL })}
      </Typography.Paragraph>
      <Input.TextArea
        autoSize={{ minRows: 5, maxRows: 12 }}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t('support.placeholder')}
      />
    </Modal>
  )
}
