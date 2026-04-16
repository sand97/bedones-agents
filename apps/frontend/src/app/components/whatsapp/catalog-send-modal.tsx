import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Input, Button, message } from 'antd'
import type { Catalog } from '@app/lib/api/agent-api'

interface CatalogSendModalProps {
  open: boolean
  onClose: () => void
  catalog: Catalog
  onSend: (data: {
    productRetailerIds: string[]
    catalogId: string
    format: 'catalog_message'
    bodyText?: string
    footerText?: string
  }) => Promise<void>
}

export function CatalogSendModal({ open, onClose, catalog, onSend }: CatalogSendModalProps) {
  const { t } = useTranslation()
  const [bodyText, setBodyText] = useState('')
  const [footerText, setFooterText] = useState('')
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    setSending(true)
    try {
      await onSend({
        productRetailerIds: [],
        catalogId: catalog.providerId || catalog.id,
        format: 'catalog_message',
        bodyText: bodyText || undefined,
        footerText: footerText || undefined,
      })
      handleClose()
    } catch {
      message.error(t('chat.product_send_error'))
    } finally {
      setSending(false)
    }
  }

  const handleClose = () => {
    setBodyText('')
    setFooterText('')
    onClose()
  }

  return (
    <Modal
      title={t('chat.send_catalog')}
      open={open}
      onCancel={handleClose}
      destroyOnHidden
      footer={[
        <Button key="cancel" onClick={handleClose}>
          {t('promotions.cancel')}
        </Button>,
        <Button key="send" type="primary" onClick={handleSend} loading={sending}>
          {t('chat.send')}
        </Button>,
      ]}
      width={480}
    >
      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-1 text-sm text-text-secondary">{t('chat.product_body')}</div>
          <Input.TextArea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            placeholder={t('chat.catalog_body_placeholder')}
            autoSize={{ minRows: 2, maxRows: 4 }}
            maxLength={1024}
          />
        </div>
        <div>
          <div className="mb-1 text-sm text-text-secondary">{t('chat.catalog_footer')}</div>
          <Input
            value={footerText}
            onChange={(e) => setFooterText(e.target.value)}
            placeholder={t('chat.catalog_footer_placeholder')}
            maxLength={60}
          />
        </div>
      </div>
    </Modal>
  )
}
