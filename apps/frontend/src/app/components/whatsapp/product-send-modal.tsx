import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Select, Input, Button, message } from 'antd'
import {
  ProductPickerModal,
  type PickerProduct,
} from '@app/components/promotions/product-picker-modal'
import type { Catalog } from '@app/lib/api/agent-api'

type ProductFormat = 'product' | 'product_list' | 'carousel'

// Per Meta WhatsApp Cloud API spec:
// - product: body + footer supported (no header)
// - product_list: header (required) + body (required) + footer (optional)
// - carousel: body only (no header, no footer)
const HEADER_FORMATS: ProductFormat[] = ['product_list']
const FOOTER_FORMATS: ProductFormat[] = ['product', 'product_list']

interface ProductSendModalProps {
  open: boolean
  onClose: () => void
  catalog: Catalog
  onSend: (data: {
    productRetailerIds: string[]
    catalogId: string
    format: ProductFormat
    headerText?: string
    bodyText?: string
    footerText?: string
  }) => Promise<void>
}

export function ProductSendModal({ open, onClose, catalog, onSend }: ProductSendModalProps) {
  const { t } = useTranslation()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedProducts, setSelectedProducts] = useState<PickerProduct[]>([])
  const [format, setFormat] = useState<ProductFormat>('product_list')
  const [headerText, setHeaderText] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [footerText, setFooterText] = useState('')
  const [sending, setSending] = useState(false)

  const supportsHeader = HEADER_FORMATS.includes(format)
  const supportsFooter = FOOTER_FORMATS.includes(format)

  const handlePickerSave = (_ids: string[]) => {
    // We use onSaveProducts instead
  }

  const handlePickerSaveProducts = (products: PickerProduct[]) => {
    setSelectedProducts(products)
    // Auto-select format based on count
    if (products.length === 1) {
      setFormat('product')
    } else {
      setFormat('product_list')
    }
  }

  const handleSend = async () => {
    if (selectedProducts.length === 0) return

    if (selectedProducts.length > 30) {
      message.warning(t('chat.product_max_limit'))
      return
    }

    setSending(true)
    try {
      await onSend({
        productRetailerIds: selectedProducts.map((p) => p.retailerId || p.id),
        catalogId: catalog.providerId || catalog.id,
        format,
        headerText: supportsHeader ? headerText || undefined : undefined,
        bodyText: bodyText || undefined,
        footerText: supportsFooter ? footerText || undefined : undefined,
      })
      handleClose()
    } catch {
      message.error(t('chat.product_send_error'))
    } finally {
      setSending(false)
    }
  }

  const handleClose = () => {
    setSelectedProducts([])
    setFormat('product_list')
    setHeaderText('')
    setBodyText('')
    setFooterText('')
    onClose()
  }

  return (
    <>
      <Modal
        title={t('chat.send_products')}
        open={open}
        onCancel={handleClose}
        footer={[
          <Button key="cancel" onClick={handleClose}>
            {t('promotions.cancel')}
          </Button>,
          <Button
            key="send"
            type="primary"
            onClick={handleSend}
            loading={sending}
            disabled={selectedProducts.length === 0}
          >
            {t('chat.send')}
          </Button>,
        ]}
        width={480}
      >
        <div className="flex flex-col gap-4">
          {/* Product selection */}
          <div>
            <div className="mb-1 text-sm text-text-secondary">{t('chat.selected_products')}</div>
            <Button block onClick={() => setPickerOpen(true)}>
              {selectedProducts.length > 0
                ? t('chat.products_selected', { count: selectedProducts.length })
                : t('chat.choose_products')}
            </Button>
            {selectedProducts.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {selectedProducts.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 rounded-lg bg-bg-subtle px-3 py-2"
                  >
                    {p.imageUrl && (
                      <img src={p.imageUrl} alt={p.name} className="h-8 w-8 rounded object-cover" />
                    )}
                    <span className="flex-1 truncate text-sm">{p.name}</span>
                    <span className="text-xs text-text-muted">
                      {p.price?.toLocaleString('fr-FR')} {p.currency}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Format selector */}
          <div>
            <div className="mb-1 text-sm text-text-secondary">{t('chat.product_format')}</div>
            <Select
              value={format}
              onChange={setFormat}
              options={[
                { value: 'product', label: t('chat.format_single_product') },
                { value: 'product_list', label: t('chat.format_product_list') },
                { value: 'carousel', label: t('chat.format_carousel') },
              ]}
              style={{ width: '100%' }}
            />
          </div>

          {/* Header text (supported by product_list only per Meta spec) */}
          {supportsHeader && (
            <div>
              <div className="mb-1 text-sm text-text-secondary">{t('chat.product_header')}</div>
              <Input
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                placeholder={t('chat.product_header_placeholder')}
                maxLength={60}
              />
            </div>
          )}

          {/* Body text */}
          <div>
            <div className="mb-1 text-sm text-text-secondary">{t('chat.product_body')}</div>
            <Input.TextArea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder={t('chat.product_body_placeholder')}
              autoSize={{ minRows: 2, maxRows: 4 }}
              maxLength={1024}
            />
          </div>

          {/* Footer text (supported by product + product_list per Meta spec) */}
          {supportsFooter && (
            <div>
              <div className="mb-1 text-sm text-text-secondary">{t('chat.product_footer')}</div>
              <Input
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                placeholder={t('chat.product_footer_placeholder')}
                maxLength={60}
              />
            </div>
          )}
        </div>
      </Modal>

      <ProductPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSave={handlePickerSave}
        onSaveProducts={handlePickerSaveProducts}
        initialSelection={selectedProducts.map((p) => p.id)}
        catalogs={[catalog]}
      />
    </>
  )
}
