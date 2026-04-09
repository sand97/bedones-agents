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
import { ImagePlus } from 'lucide-react'
import { uploadChatMedia } from '@app/lib/api'
import type { Product } from '@app/lib/api/agent-api'
import type { UploadFile } from 'antd'

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
  }) => void
  product?: Product
  loading?: boolean
}

export function ProductModal({ open, onClose, onSubmit, product, loading }: ProductModalProps) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const currency = Form.useWatch('currency', form) as string | undefined
  const imageUrls = (Form.useWatch('imageUrls', form) as string[] | undefined) || []
  const [uploading, setUploading] = useState(false)

  // Derive fileList from form field — no separate state needed
  const fileList: UploadFile[] = imageUrls.map((url, i) => ({
    uid: `img-${i}`,
    name: `image-${i + 1}`,
    status: 'done' as const,
    url,
  }))

  const initialValues = product
    ? {
        name: product.name,
        description: product.description,
        imageUrls: product.imageUrl ? [product.imageUrl] : [],
        price: product.price,
        currency: product.currency || 'XAF',
        category: product.category,
        url: product.url,
        availability: product.availability,
        brand: product.brand,
        condition: product.condition,
      }
    : { currency: 'XAF', imageUrls: [] }

  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      const url = await uploadChatMedia(file)
      const current: string[] = form.getFieldValue('imageUrls') || []
      form.setFieldValue('imageUrls', [...current, url])
      form.validateFields(['imageUrls'])
    } catch {
      message.error(t('upload.error'))
    } finally {
      setUploading(false)
    }
    return false
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    onSubmit(values)
  }

  const categoryOptions = CATEGORY_SUGGESTIONS.map((c) => ({ value: c }))

  return (
    <Modal
      open={open}
      onCancel={onClose}
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
          <Upload.Dragger
            fileList={fileList}
            multiple
            beforeUpload={(file) => {
              handleUpload(file)
              return false
            }}
            onRemove={(file) => {
              const current: string[] = form.getFieldValue('imageUrls') || []
              form.setFieldValue(
                'imageUrls',
                current.filter((u) => u !== file.url),
              )
              setTimeout(() => form.validateFields(['imageUrls']))
            }}
            accept=".jpg,.jpeg,.png,.webp"
            showUploadList={{ showPreviewIcon: false }}
          >
            <div className="flex flex-col items-center gap-1 py-2">
              <ImagePlus size={28} strokeWidth={1.5} className="text-text-muted" />
              <span className="text-sm font-medium text-text-primary">
                {uploading ? t('common.loading') : t('catalog.upload_images_title')}
              </span>
              <span className="text-xs text-text-muted">{t('catalog.upload_images_hint')}</span>
            </div>
          </Upload.Dragger>
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

        <Form.Item name="category" label={t('catalog.category')}>
          <AutoComplete
            options={categoryOptions}
            placeholder={t('catalog.category_placeholder')}
            filterOption={(input, option) =>
              (option?.value ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />
        </Form.Item>

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
