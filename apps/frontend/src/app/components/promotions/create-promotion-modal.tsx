/**
 * ⚠️ PROTECTED FILE — DO NOT MODIFY unless you have received an EXPLICIT order to do so.
 * If you do modify this file, you MUST NOT remove or alter any existing fields, props,
 * form items, or mock data imports. Only ADD to this file, never delete or replace.
 * Any agent that removes functionality from this modal will break the promotion creation flow.
 *
 * NOTE: Per an explicit user request, the reward section was aligned with the loyalty
 * bonus modal (rewardType = PRODUCTS / CREDIT / PERCENT), eligibility thresholds were
 * added (minOrderAmount / minItemCount), and the validity period now allows an optional
 * end date. All other fields (name, code, eligible products, stackable) are preserved.
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

export type PromotionRewardType = 'PRODUCTS' | 'CREDIT' | 'PERCENT'

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
  // Eligibility thresholds (null = not enforced)
  minOrderAmount: number | null
  minItemCount: number | null
  // Reward (mirrors the loyalty bonus modal)
  rewardType: PromotionRewardType
  rewardCredit: number | null
  rewardPercent: number | null
  rewardProductIds: string[]
}

interface PromotionModalProps {
  open: boolean
  onClose: () => void
  /** When provided, modal opens in edit mode */
  editingPromo?: PromotionFull | null
  onOpenProductPicker: () => void
  selectedProductIds: string[]
  setSelectedProductIds: React.Dispatch<React.SetStateAction<string[]>>
  /** Reward products (free products offered when rewardType === 'PRODUCTS') */
  onOpenRewardPicker: () => void
  rewardProducts: PickerProduct[]
  setRewardProducts: React.Dispatch<React.SetStateAction<PickerProduct[]>>
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
  onOpenRewardPicker,
  rewardProducts,
  setRewardProducts,
  onSubmit,
  submitLoading,
  selectedProducts,
}: PromotionModalProps) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [eligibility, setEligibility] = useState<PromotionEligibility>('all')
  const [enableMinAmount, setEnableMinAmount] = useState(false)
  const [enableMinItems, setEnableMinItems] = useState(false)

  const REWARD_TYPE_OPTIONS = [
    { value: 'PERCENT', label: t('promotions.reward_percent') },
    { value: 'CREDIT', label: t('promotions.reward_credit') },
    { value: 'PRODUCTS', label: t('promotions.reward_products') },
  ]

  const ELIGIBILITY_OPTIONS = [
    { value: 'all', label: t('promotions.eligibility_all') },
    { value: 'specific', label: t('promotions.eligibility_specific') },
  ]

  const isEditing = !!editingPromo
  const rewardType: PromotionRewardType = Form.useWatch('rewardType', form) || 'PERCENT'

  // Use real product objects when provided, fallback to mocks
  const selectedArticles =
    selectedProducts !== undefined
      ? selectedProducts
      : MOCK_CATALOG_ARTICLES.filter((a) => selectedProductIds.includes(a.id))

  useEffect(() => {
    if (open && editingPromo) {
      // Support both mock PromotionFull shape and API PromotionItem shape
      const promo = editingPromo as PromotionFull & Record<string, unknown>
      const legacyType = promo.type ?? (promo.discountType === 'PERCENTAGE' ? 'percent' : 'fixed')
      const legacyValue = (promo.value ?? promo.discountValue ?? 0) as number
      // Reward: prefer the explicit rewardType, else derive from the legacy discount.
      const formRewardType =
        (promo.rewardType as PromotionRewardType | undefined) ??
        (legacyType === 'percent' ? 'PERCENT' : 'CREDIT')
      const formRewardPercent =
        (promo.rewardPercent as number | undefined) ??
        (formRewardType === 'PERCENT' ? legacyValue : undefined)
      const formRewardCredit =
        (promo.rewardCredit as number | undefined) ??
        (formRewardType === 'CREDIT' ? legacyValue : undefined)
      const formMinOrderAmount = promo.minOrderAmount as number | null | undefined
      const formMinItemCount = promo.minItemCount as number | null | undefined
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
      const formRewardProducts =
        ((promo as Record<string, unknown>).rewardProducts as
          | Array<{
              product?: {
                id: string
                name: string
                imageUrl?: string
                price?: number
                currency?: string
              }
            }>
          | undefined) ?? []

      form.setFieldsValue({
        name: editingPromo.name,
        code: editingPromo.code ?? (promo as Record<string, unknown>).code,
        rewardType: formRewardType,
        rewardPercent: formRewardPercent,
        rewardCredit: formRewardCredit,
        minOrderAmount: formMinOrderAmount ?? undefined,
        minItemCount: formMinItemCount ?? undefined,
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
            : editingPromo.startDate || (promo as Record<string, unknown>).startDate
              ? [
                  dayjs(
                    (editingPromo.startDate as string) ||
                      ((promo as Record<string, unknown>).startDate as string),
                  ),
                  null,
                ]
              : undefined,
        eligibility: formEligibility,
        stackable: editingPromo.stackable ?? (promo as Record<string, unknown>).stackable ?? false,
      })
      setEligibility(formEligibility as PromotionEligibility)
      setSelectedProductIds(formProductIds as string[])
      setEnableMinAmount(formMinOrderAmount !== null && formMinOrderAmount !== undefined)
      setEnableMinItems(formMinItemCount !== null && formMinItemCount !== undefined)
      setRewardProducts(
        formRewardProducts.map((p) => ({
          id: p.product?.id ?? '',
          name: p.product?.name ?? '',
          description: '',
          imageUrl: p.product?.imageUrl ?? '',
          price: p.product?.price ?? 0,
          currency: p.product?.currency ?? 'FCFA',
        })),
      )
    }
  }, [open, editingPromo, form, setSelectedProductIds, setRewardProducts])

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      if (onSubmit) {
        const [startDate, endDate] = values.period || []
        const submitRewardType: PromotionRewardType = values.rewardType || 'PERCENT'
        const discountType: 'PERCENTAGE' | 'FIXED_AMOUNT' =
          submitRewardType === 'PERCENT' ? 'PERCENTAGE' : 'FIXED_AMOUNT'
        const discountValue =
          submitRewardType === 'PERCENT'
            ? (values.rewardPercent ?? 0)
            : submitRewardType === 'CREDIT'
              ? (values.rewardCredit ?? 0)
              : 0
        onSubmit({
          name: values.name,
          code: values.code,
          discountType,
          discountValue,
          startDate: startDate ? startDate.toISOString() : '',
          endDate: endDate ? endDate.toISOString() : '',
          eligibility: values.eligibility,
          productIds: values.eligibility === 'specific' ? selectedProductIds : [],
          stackable: values.stackable ?? false,
          minOrderAmount: enableMinAmount ? (values.minOrderAmount ?? 0) : null,
          minItemCount: enableMinItems ? (values.minItemCount ?? 0) : null,
          rewardType: submitRewardType,
          rewardCredit: submitRewardType === 'CREDIT' ? (values.rewardCredit ?? 0) : null,
          rewardPercent: submitRewardType === 'PERCENT' ? (values.rewardPercent ?? 0) : null,
          rewardProductIds: submitRewardType === 'PRODUCTS' ? rewardProducts.map((p) => p.id) : [],
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
    setEnableMinAmount(false)
    setEnableMinItems(false)
    setSelectedProductIds([])
    setRewardProducts([])
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const removeProduct = (id: string) => {
    setSelectedProductIds((prev) => prev.filter((pid) => pid !== id))
  }

  const removeRewardProduct = (id: string) => {
    setRewardProducts((prev) => prev.filter((p) => p.id !== id))
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
        initialValues={{ rewardType: 'PERCENT', eligibility: 'all', stackable: false }}
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

        {/* ─── Eligibility conditions (stackable thresholds) ─── */}
        <div className="mb-4">
          <div className="mb-2 text-sm font-semibold text-text-primary">
            {t('promotions.eligibility_conditions')}
          </div>
          <div className="text-xs text-text-muted mb-3">
            {t('promotions.eligibility_conditions_hint')}
          </div>

          <div className="flex items-center gap-3 mb-2">
            <Switch checked={enableMinAmount} onChange={setEnableMinAmount} size="small" />
            <span className="text-sm flex-1 text-text-primary">
              {t('promotions.min_order_amount')}
            </span>
            {enableMinAmount && (
              <Form.Item name="minOrderAmount" noStyle rules={[{ required: true, message: '' }]}>
                <InputNumber min={0} suffix="FCFA" placeholder="50000" style={{ width: 180 }} />
              </Form.Item>
            )}
          </div>

          <div className="flex items-center gap-3 mb-2">
            <Switch checked={enableMinItems} onChange={setEnableMinItems} size="small" />
            <span className="text-sm flex-1 text-text-primary">
              {t('promotions.min_item_count')}
            </span>
            {enableMinItems && (
              <Form.Item name="minItemCount" noStyle rules={[{ required: true, message: '' }]}>
                <InputNumber min={1} placeholder="3" style={{ width: 180 }} />
              </Form.Item>
            )}
          </div>
        </div>

        {/* ─── Reward ─── */}
        <Form.Item
          label={t('promotions.reward_type')}
          name="rewardType"
          rules={[{ required: true, message: t('promotions.required') }]}
        >
          <Select options={REWARD_TYPE_OPTIONS} />
        </Form.Item>

        {rewardType === 'PERCENT' && (
          <Form.Item
            label={t('promotions.reward_percent_value')}
            name="rewardPercent"
            rules={[
              { required: true, message: t('promotions.required') },
              { type: 'number', min: 1, message: t('promotions.min_1') },
            ]}
          >
            <InputNumber min={1} max={100} suffix="%" placeholder="20" style={{ width: 200 }} />
          </Form.Item>
        )}

        {rewardType === 'CREDIT' && (
          <Form.Item
            label={t('promotions.reward_credit_value')}
            name="rewardCredit"
            rules={[{ required: true, message: t('promotions.required') }]}
          >
            <InputNumber min={0} suffix="FCFA" placeholder="5000" style={{ width: 200 }} />
          </Form.Item>
        )}

        {rewardType === 'PRODUCTS' && (
          <div className="mb-4">
            {rewardProducts.length === 0 ? (
              <div className="create-ticket-empty-section">
                <ShoppingBag size={32} strokeWidth={1.5} className="text-text-muted opacity-50" />
                <div className="text-sm font-medium text-text-primary">
                  {t('promotions.no_reward_products')}
                </div>
                <div className="text-xs text-text-muted">
                  {t('promotions.reward_products_hint')}
                </div>
                <Button onClick={onOpenRewardPicker} icon={<Plus size={16} />} className="mt-2">
                  {t('promotions.select_products')}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {rewardProducts.map((a) => (
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
                      <div className="text-xs font-semibold text-text-primary mt-1">
                        {a.price.toLocaleString('fr-FR')} {a.currency}
                      </div>
                    </div>
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<Trash2 size={12} />}
                      onClick={() => removeRewardProduct(a.id)}
                    />
                  </div>
                ))}
                <Button
                  size="small"
                  className="self-start"
                  onClick={onOpenRewardPicker}
                  icon={<Plus size={14} />}
                >
                  {t('promotions.edit_selection')}
                </Button>
              </div>
            )}
          </div>
        )}

        <Form.Item
          label={t('promotions.validity_period')}
          name="period"
          rules={[
            {
              validator: (_, value) =>
                value && value[0]
                  ? Promise.resolve()
                  : Promise.reject(new Error(t('promotions.start_date_required'))),
            },
          ]}
        >
          <RangePicker
            placeholder={[t('promotions.start_date'), t('promotions.end_date')]}
            format="DD/MM/YYYY"
            allowEmpty={[false, true]}
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
