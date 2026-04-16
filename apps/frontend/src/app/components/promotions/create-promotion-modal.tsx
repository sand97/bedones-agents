/**
 * ⚠️ PROTECTED FILE — DO NOT MODIFY unless you have received an EXPLICIT order to do so.
 * If you do modify this file, you MUST NOT remove or alter any existing fields, props,
 * form items, or mock data imports. Only ADD to this file, never delete or replace.
 * Any agent that removes functionality from this modal will break the promotion creation flow.
 */
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal, Form, Input, InputNumber, Select, DatePicker, Switch, Popover } from 'antd'
import { ShoppingBag, Plus, Trash2 } from 'lucide-react'
import dayjs from 'dayjs'
import 'dayjs/locale/fr'
import {
  MOCK_CATALOG_ARTICLES,
  type PromotionEligibility,
  type PromotionFull,
} from '@app/components/whatsapp/mock-data'
import type { PickerProduct } from '@app/components/promotions/product-picker-modal'

dayjs.locale('fr')

const { RangePicker } = DatePicker

export interface PromotionSubmitData {
  name: string
  code: string
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT'
  discountValue: number
  startDate: string
  endDate: string
  eligibility: PromotionEligibility
  productIds: string[]
  stackable: boolean
}

interface PromotionModalProps {
  open: boolean
  onClose: () => void
  /** When provided, modal opens in edit mode */
  editingPromo?: PromotionFull | null
  onOpenProductPicker: () => void
  selectedProductIds: string[]
  setSelectedProductIds: React.Dispatch<React.SetStateAction<string[]>>
  /** Called with form data when user clicks create/save */
  onSubmit?: (data: PromotionSubmitData) => void
  /** Loading state for the submit button */
  submitLoading?: boolean
  /** Full product objects selected via the product picker */
  selectedProducts?: PickerProduct[]
}

export function PromotionModal({
  open,
  onClose,
  editingPromo,
  onOpenProductPicker,
  selectedProductIds,
  setSelectedProductIds,
  onSubmit,
  submitLoading,
  selectedProducts,
}: PromotionModalProps) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [eligibility, setEligibility] = useState<PromotionEligibility>('all')

  const TYPE_OPTIONS = [
    { value: 'percent', label: t('promotions.type_percent') },
    { value: 'fixed', label: t('promotions.type_fixed') },
  ]

  const ELIGIBILITY_OPTIONS = [
    { value: 'all', label: t('promotions.eligibility_all') },
    { value: 'specific', label: t('promotions.eligibility_specific') },
  ]

  const isEditing = !!editingPromo
  const promoType = Form.useWatch('type', form)

  // Use real product objects when provided, fallback to mocks
  const selectedArticles =
    selectedProducts !== undefined
      ? selectedProducts
      : MOCK_CATALOG_ARTICLES.filter((a) => selectedProductIds.includes(a.id))

  useEffect(() => {
    if (open && editingPromo) {
      // Support both mock PromotionFull shape and API PromotionItem shape
      const promo = editingPromo as PromotionFull & Record<string, unknown>
      const formType = promo.type ?? (promo.discountType === 'PERCENTAGE' ? 'percent' : 'fixed')
      const formValue = promo.value ?? promo.discountValue ?? 0
      const formEligibility =
        promo.eligibility ??
        ((promo as Record<string, unknown>).products &&
        (promo as Record<string, unknown>).products instanceof Array &&
        ((promo as Record<string, unknown>).products as unknown[]).length > 0
          ? 'specific'
          : 'all')
      const formProductIds =
        promo.eligibleProductIds ??
        ((promo as Record<string, unknown>).products
          ? ((promo as Record<string, unknown>).products as Array<{ product?: { id: string } }>)
              .map((p) => p.product?.id)
              .filter(Boolean)
          : [])

      form.setFieldsValue({
        name: editingPromo.name,
        code: editingPromo.code ?? (promo as Record<string, unknown>).code,
        type: formType,
        value: formValue,
        period:
          (editingPromo.startDate || (promo as Record<string, unknown>).startDate) &&
          (editingPromo.endDate || (promo as Record<string, unknown>).endDate)
            ? [
                dayjs(
                  (editingPromo.startDate as string) ||
                    ((promo as Record<string, unknown>).startDate as string),
                ),
                dayjs(
                  (editingPromo.endDate as string) ||
                    ((promo as Record<string, unknown>).endDate as string),
                ),
              ]
            : undefined,
        eligibility: formEligibility,
        stackable: editingPromo.stackable ?? (promo as Record<string, unknown>).stackable ?? false,
      })
      setEligibility(formEligibility as PromotionEligibility)
      setSelectedProductIds(formProductIds as string[])
    }
  }, [open, editingPromo, form, setSelectedProductIds])

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      if (onSubmit) {
        const [startDate, endDate] = values.period || []
        onSubmit({
          name: values.name,
          code: values.code,
          discountType: values.type === 'percent' ? 'PERCENTAGE' : 'FIXED_AMOUNT',
          discountValue: values.value,
          startDate: startDate ? startDate.toISOString() : '',
          endDate: endDate ? endDate.toISOString() : '',
          eligibility: values.eligibility,
          productIds: values.eligibility === 'specific' ? selectedProductIds : [],
          stackable: values.stackable ?? false,
        })
      } else {
        resetForm()
        onClose()
      }
    })
  }

  const resetForm = () => {
    form.resetFields()
    setEligibility('all')
    setSelectedProductIds([])
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const removeProduct = (id: string) => {
    setSelectedProductIds((prev) => prev.filter((pid) => pid !== id))
  }

  return (
    <Modal
      title={isEditing ? t('promotions.edit_title') : t('promotions.create_title')}
      open={open}
      onCancel={handleClose}
      width={640}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button onClick={handleClose}>{t('promotions.cancel')}</Button>
          <Button type="primary" onClick={handleSubmit} loading={submitLoading}>
            {isEditing ? t('promotions.save') : t('promotions.create_button')}
          </Button>
        </div>
      }
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        className="pt-2"
        initialValues={{ type: 'percent', eligibility: 'all', stackable: false }}
      >
        <Form.Item
          label={t('promotions.name')}
          name="name"
          rules={[{ required: true, message: t('promotions.name_required') }]}
        >
          <Input placeholder={t('promotions.name_placeholder')} />
        </Form.Item>

        <Form.Item
          label={t('promotions.code')}
          name="code"
          rules={[
            { required: true, message: t('promotions.code_required') },
            { pattern: /^\S+$/, message: t('promotions.no_spaces') },
          ]}
        >
          <Input
            prefix="#"
            placeholder="SOLDES20"
            className="font-mono uppercase"
            onChange={(e) => {
              form.setFieldValue('code', e.target.value.toUpperCase().replace(/\s/g, ''))
            }}
          />
        </Form.Item>

        <Form.Item label={t('promotions.discount')} required className="mb-4">
          <div className="promo-modal-reduction-row">
            <Form.Item
              name="type"
              noStyle
              rules={[{ required: true, message: t('promotions.required') }]}
            >
              <Select options={TYPE_OPTIONS} className="promo-modal-type-select" />
            </Form.Item>
            <Form.Item
              name="value"
              noStyle
              rules={[
                { required: true, message: t('promotions.required') },
                { type: 'number', min: 1, message: t('promotions.min_1') },
              ]}
            >
              <InputNumber
                min={1}
                max={promoType === 'percent' ? 100 : undefined}
                suffix={promoType === 'percent' ? '%' : 'FCFA'}
                placeholder={promoType === 'percent' ? 'Ex: 20' : 'Ex: 5000'}
                className="promo-modal-value-input"
              />
            </Form.Item>
          </div>
        </Form.Item>

        <Form.Item
          label={t('promotions.validity_period')}
          name="period"
          rules={[{ required: true, message: t('promotions.period_required') }]}
        >
          <RangePicker
            placeholder={[t('promotions.start_date'), t('promotions.end_date')]}
            format="DD/MM/YYYY"
            className="w-full"
          />
        </Form.Item>

        <Form.Item
          label={t('promotions.eligible_products')}
          name="eligibility"
          rules={[{ required: true, message: t('promotions.required') }]}
        >
          <Select
            options={ELIGIBILITY_OPTIONS}
            onChange={(val: PromotionEligibility) => {
              setEligibility(val)
              if (val === 'all') setSelectedProductIds([])
            }}
          />
        </Form.Item>

        {eligibility === 'specific' && (
          <div className="mb-4">
            {selectedArticles.length === 0 ? (
              <div className="create-ticket-empty-section">
                <ShoppingBag size={32} strokeWidth={1.5} className="text-text-muted opacity-50" />
                <div className="text-sm font-medium text-text-primary">
                  {t('promotions.no_products')}
                </div>
                <div className="text-xs text-text-muted">
                  {t('promotions.select_products_hint')}
                </div>
                <Button onClick={onOpenProductPicker} icon={<Plus size={16} />} className="mt-2">
                  {t('promotions.select_products')}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {selectedArticles.map((a) => (
                  <div key={a.id} className="ticket-product-item">
                    <Popover
                      content={
                        <img
                          src={a.imageUrl}
                          alt={a.name}
                          className="rounded-lg"
                          style={{ maxWidth: 280, maxHeight: 280, objectFit: 'contain' }}
                        />
                      }
                      trigger="click"
                      placement="right"
                      overlayInnerStyle={{ padding: 4 }}
                    >
                      <img
                        src={a.imageUrl}
                        alt={a.name}
                        className="ticket-product-image cursor-pointer"
                        style={{ width: 56, height: 56 }}
                      />
                    </Popover>
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-semibold text-text-primary text-sm">
                        {a.name}
                      </div>
                      {a.description && (
                        <div className="text-xs text-text-muted mt-0.5 line-clamp-1">
                          {a.description}
                        </div>
                      )}
                      <div className="text-xs font-semibold text-text-primary mt-1">
                        {a.price.toLocaleString('fr-FR')} {a.currency}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="ticket-product-qty-btn ticket-product-qty-btn--delete"
                      onClick={() => removeProduct(a.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                <Button
                  size="small"
                  className="self-start"
                  onClick={onOpenProductPicker}
                  icon={<Plus size={14} />}
                >
                  {t('promotions.edit_selection')}
                </Button>
              </div>
            )}
          </div>
        )}

        <Form.Item label={t('promotions.stackable_label')} name="stackable" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  )
}
