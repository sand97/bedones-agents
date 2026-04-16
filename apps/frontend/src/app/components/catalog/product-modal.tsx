import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Upload,
  AutoComplete,
  Button,
  message,
} from 'antd'
import { X } from 'lucide-react'
import { uploadChatMedia } from '@app/lib/api'
import type { Product, Collection } from '@app/lib/api/agent-api'

/** Normalize currency aliases to ISO 4217 */
function normalizeCurrency(c?: string): string {
  if (!c) return 'XAF'
  const upper = c.toUpperCase()
  if (upper === 'FCFA' || upper === 'CFA') return 'XAF'
  return upper
}

/** Common Google Product Categories used in catalogs */
const CATEGORY_SUGGESTIONS = [
  'Robes',
  'Ensembles',
  'Chemises',
  'Accessoires',
  'Chaussures',
  'Bijoux',
  'Sacs',
  'Pantalons',
  'Jupes',
  'Vêtements enfant',
  'Cosmétiques',
  'Alimentation',
  'Électronique',
  'Maison & Décoration',
]

const CURRENCY_OPTIONS = [
  { value: 'XAF', label: 'XAF (FCFA)' },
  { value: 'XOF', label: 'XOF (FCFA)' },
  { value: 'EUR', label: 'EUR (€)' },
  { value: 'USD', label: 'USD ($)' },
]

interface ProductModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (values: {
    name: string
    description?: string
    imageUrls?: string[]
    price?: number
    currency?: string
    category?: string
    url?: string
    availability?: string
    brand?: string
    condition?: string
    collectionId?: string
  }) => void
  product?: Product
  loading?: boolean
  collections?: Collection[]
}

/** A pending file not yet uploaded, shown as a local preview */
interface PendingFile {
  file: File
  previewUrl: string
}

export function ProductModal({
  open,
  onClose,
  onSubmit,
  product,
  loading,
  collections,
}: ProductModalProps) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const currency = Form.useWatch('currency', form) as string | undefined
  const imageUrls = (Form.useWatch('imageUrls', form) as string[] | undefined) || []
  const [uploading, setUploading] = useState(false)

  // Pending files waiting to be uploaded on submit
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])

  const initialValues = product
    ? {
        name: product.name,
        description: product.description,
        imageUrls: product.imageUrl ? [product.imageUrl] : [],
        price: product.price,
        currency: normalizeCurrency(product.currency),
        category: product.category,
        url: product.url,
        availability: product.availability,
        brand: product.brand,
        condition: product.condition,
      }
    : { currency: 'XAF', imageUrls: [] }

  /** Add files to the pending list — no upload yet */
  const handleAddFile = (file: File) => {
    const previewUrl = URL.createObjectURL(file)
    setPendingFiles((prev) => [...prev, { file, previewUrl }])
    // Mark imageUrls as valid so the form validator passes
    const current: string[] = form.getFieldValue('imageUrls') || []
    form.setFieldValue('imageUrls', [...current, previewUrl])
    form.validateFields(['imageUrls'])
    return false
  }

  /** Remove a pending file by its preview URL */
  const removePendingFile = (previewUrl: string) => {
    setPendingFiles((prev) => {
      const entry = prev.find((p) => p.previewUrl === previewUrl)
      if (entry) URL.revokeObjectURL(entry.previewUrl)
      return prev.filter((p) => p.previewUrl !== previewUrl)
    })
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()

    // Upload pending files to the server (like chat media upload)
    if (pendingFiles.length > 0) {
      setUploading(true)
      try {
        const uploadedUrls = await Promise.all(pendingFiles.map((pf) => uploadChatMedia(pf.file)))
        // Combine already-remote URLs (from edit) with freshly uploaded ones
        const existingRemoteUrls = (values.imageUrls as string[]).filter(
          (u: string) => !u.startsWith('blob:'),
        )
        values.imageUrls = [...existingRemoteUrls, ...uploadedUrls]
      } catch {
        message.error(t('upload.error'))
        setUploading(false)
        return
      } finally {
        setUploading(false)
      }
    }

    // Clean up blob URLs
    pendingFiles.forEach((pf) => URL.revokeObjectURL(pf.previewUrl))
    setPendingFiles([])

    onSubmit(values)
  }

  const categoryOptions = CATEGORY_SUGGESTIONS.map((c) => ({ value: c }))

  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterClose={() => {
        pendingFiles.forEach((pf) => URL.revokeObjectURL(pf.previewUrl))
        setPendingFiles([])
      }}
      title={product ? t('catalog.edit_article') : t('catalog.add_article')}
      width={640}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="primary" onClick={handleSubmit} loading={loading}>
            {product ? t('common.save') : t('common.create')}
          </Button>
        </div>
      }
      destroyOnClose
    >
      <Form form={form} layout="vertical" className="pt-2" initialValues={initialValues}>
        <Form.Item
          name="name"
          label={t('catalog.product_name')}
          rules={[{ required: true, message: t('catalog.product_name_required') }]}
        >
          <Input placeholder={t('catalog.product_name_placeholder')} />
        </Form.Item>

        <Form.Item name="description" label={t('catalog.product_description')}>
          <Input.TextArea rows={3} placeholder={t('catalog.product_description_placeholder')} />
        </Form.Item>

        <Form.Item
          name="imageUrls"
          label={t('catalog.product_image')}
          rules={[
            {
              validator: (_, value) =>
                value && value.length > 0
                  ? Promise.resolve()
                  : Promise.reject(new Error(t('catalog.image_required'))),
            },
          ]}
        >
          {imageUrls.length > 0 ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {imageUrls.map((url, i) => (
                  <div key={i} className="relative">
                    <img
                      src={url}
                      alt={`image-${i + 1}`}
                      className="h-20 w-20 rounded-lg object-cover"
                    />
                    <Button
                      type="text"
                      size="small"
                      icon={<X size={12} />}
                      className="product-modal-img-remove"
                      onClick={() => {
                        const current: string[] = form.getFieldValue('imageUrls') || []
                        form.setFieldValue(
                          'imageUrls',
                          current.filter((u) => u !== url),
                        )
                        // Also remove from pending files if it's a blob URL
                        if (url.startsWith('blob:')) {
                          removePendingFile(url)
                        }
                        setTimeout(() => form.validateFields(['imageUrls']))
                      }}
                    />
                  </div>
                ))}
              </div>
              <Upload.Dragger
                showUploadList={false}
                multiple
                accept=".jpg,.jpeg,.png,.webp"
                beforeUpload={(file) => {
                  handleAddFile(file)
                  return false
                }}
                customRequest={() => {}}
              >
                <div className="flex flex-col items-center gap-1 py-1">
                  <span className="text-xs text-text-muted">
                    {uploading ? t('common.loading') : t('catalog.upload_images_title')}
                  </span>
                </div>
              </Upload.Dragger>
            </div>
          ) : (
            <Upload.Dragger
              showUploadList={false}
              multiple
              accept=".jpg,.jpeg,.png,.webp"
              beforeUpload={(file) => {
                handleAddFile(file)
                return false
              }}
              customRequest={() => {}}
            >
              <div className="flex flex-col items-center gap-2 py-2">
                <UploadImageIcon />
                <span className="text-sm font-medium text-text-primary">
                  {uploading ? t('common.loading') : t('catalog.upload_images_title')}
                </span>
                <span className="text-xs text-text-muted">{t('catalog.upload_images_hint')}</span>
              </div>
            </Upload.Dragger>
          )}
        </Form.Item>

        {/* Prix : currency select + montant stacked comme la réduction promo */}
        <Form.Item label={t('catalog.product_price')} className="mb-4">
          <div className="promo-modal-reduction-row">
            <Form.Item name="currency" noStyle>
              <Select options={CURRENCY_OPTIONS} className="promo-modal-type-select" />
            </Form.Item>
            <Form.Item name="price" noStyle>
              <InputNumber
                min={0}
                placeholder="Ex: 25000"
                suffix={currency === 'XAF' || currency === 'XOF' ? 'FCFA' : currency}
                className="promo-modal-value-input"
              />
            </Form.Item>
          </div>
        </Form.Item>

        <div className="flex gap-4">
          <Form.Item name="category" label={t('catalog.category')} className="flex-1">
            <AutoComplete
              options={categoryOptions}
              placeholder={t('catalog.category_placeholder')}
              filterOption={(input, option) =>
                (option?.value ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
          <Form.Item name="collectionId" label={t('catalog.collection')} className="flex-1">
            <Select
              allowClear
              placeholder={t('catalog.collection')}
              options={(collections || []).map((c) => ({ label: c.name, value: c.id }))}
            />
          </Form.Item>
        </div>

        <Form.Item name="url" label={t('catalog.product_url')}>
          <Input type="url" placeholder="https://..." />
        </Form.Item>

        {/* Disponibilité + État sur la même ligne */}
        <div className="flex gap-4">
          <Form.Item
            name="availability"
            label={t('catalog.product_availability')}
            className="flex-1"
          >
            <Select
              allowClear
              placeholder={t('catalog.product_availability')}
              options={[
                { label: t('catalog.in_stock'), value: 'in stock' },
                { label: t('catalog.out_of_stock'), value: 'out of stock' },
              ]}
            />
          </Form.Item>

          <Form.Item name="condition" label={t('catalog.product_condition')} className="flex-1">
            <Select
              allowClear
              placeholder={t('catalog.product_condition')}
              options={[
                { label: t('catalog.product_condition_new'), value: 'new' },
                { label: t('catalog.product_condition_refurbished'), value: 'refurbished' },
                { label: t('catalog.product_condition_used'), value: 'used' },
              ]}
            />
          </Form.Item>
        </div>

        <Form.Item name="brand" label={t('catalog.product_brand')}>
          <Input placeholder={t('catalog.product_brand_placeholder')} />
        </Form.Item>
      </Form>
    </Modal>
  )
}

/* ─── Icons ─── */

function UploadImageIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.65037 3.5C5.12937 3.5 3.50037 5.227 3.50037 7.899V16.051C3.50037 18.724 5.12937 20.45 7.65037 20.45H16.3004C18.8274 20.45 20.4604 18.724 20.4604 16.051V7.899C20.4604 5.227 18.8274 3.5 16.3004 3.5H7.65037ZM16.3004 21.95H7.65037C4.27037 21.95 2.00037 19.579 2.00037 16.051V7.899C2.00037 4.371 4.27037 2 7.65037 2H16.3004C19.6854 2 21.9604 4.371 21.9604 7.899V16.051C21.9604 19.579 19.6854 21.95 16.3004 21.95Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.28138 17.1805C5.09538 17.1805 4.91038 17.1125 4.76538 16.9745C4.46438 16.6905 4.45238 16.2145 4.73738 15.9155L6.26538 14.3025C7.07438 13.4435 8.43938 13.4015 9.30238 14.2115L10.2604 15.1835C10.5274 15.4535 10.9614 15.4585 11.2294 15.1945C11.3304 15.0755 13.5084 12.4305 13.5084 12.4305C13.9224 11.9285 14.5064 11.6185 15.1554 11.5545C15.8054 11.4975 16.4364 11.6865 16.9394 12.0995C16.9824 12.1345 17.0214 12.1685 19.2174 14.4235C19.5064 14.7195 19.5014 15.1945 19.2044 15.4835C18.9084 15.7745 18.4324 15.7655 18.1434 15.4695C18.1434 15.4695 16.0944 13.3665 15.9484 13.2245C15.7934 13.0975 15.5444 13.0235 15.2994 13.0475C15.0504 13.0725 14.8264 13.1915 14.6674 13.3845C12.3434 16.2035 12.3154 16.2305 12.2774 16.2675C11.4194 17.1095 10.0344 17.0955 9.19138 16.2355C9.19138 16.2355 8.26138 15.2915 8.24538 15.2725C8.01438 15.0585 7.60238 15.0725 7.35538 15.3335L5.82538 16.9465C5.67738 17.1025 5.47938 17.1805 5.28138 17.1805Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.55757 8.12891C8.00457 8.12891 7.55457 8.57891 7.55457 9.13291C7.55457 9.68691 8.00457 10.1379 8.55857 10.1379C9.11257 10.1379 9.56357 9.68691 9.56357 9.13291C9.56357 8.57991 9.11257 8.12991 8.55757 8.12891ZM8.55857 11.6379C7.17757 11.6379 6.05457 10.5139 6.05457 9.13291C6.05457 7.75191 7.17757 6.62891 8.55857 6.62891C9.94057 6.62991 11.0636 7.75391 11.0636 9.13291C11.0636 10.5139 9.93957 11.6379 8.55857 11.6379Z"
        fill="currentColor"
      />
    </svg>
  )
}
