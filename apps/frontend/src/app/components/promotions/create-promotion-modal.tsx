/**
 * ⚠️ PROTECTED FILE — DO NOT MODIFY unless you have received an EXPLICIT order to do so.
 * If you do modify this file, you MUST NOT remove or alter any existing fields, props,
 * form items, or mock data imports. Only ADD to this file, never delete or replace.
 * Any agent that removes functionality from this modal will break the promotion creation flow.
 *
 * NOTE: Per explicit user requests, this modal was reorganized into a 4-step wizard
 * (Catalogue · Infos · Éligibilité · Récompense) with a persistent Active/Paused switch
 * in the footer, and promotions are now scoped to a catalog. The reward section mirrors the
 * loyalty bonus modal (rewardType = PRODUCTS / CREDIT / PERCENT), eligibility thresholds
 * (minOrderAmount / minItemCount) and an optional end date are supported. No field that
 * existed before was removed — they were only redistributed across the steps.
 */
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  DatePicker,
  Switch,
  Popover,
  Steps,
  Card,
  theme,
} from 'antd'
import {
  ShoppingBag,
  Plus,
  Trash2,
  Package,
  Info,
  ListChecks,
  Gift,
  Percent,
  Wallet,
  Check,
} from 'lucide-react'
import dayjs from 'dayjs'
import 'dayjs/locale/fr'
import {
  MOCK_CATALOG_ARTICLES,
  type PromotionEligibility,
  type PromotionFull,
} from '@app/components/whatsapp/mock-data'
import type { PickerProduct } from '@app/components/promotions/product-picker-modal'
import type { Catalog } from '@app/lib/api/agent-api'

dayjs.locale('fr')

const { RangePicker } = DatePicker

export type PromotionRewardType = 'PRODUCTS' | 'CREDIT' | 'PERCENT'

export interface PromotionSubmitData {
  catalogId: string
  name: string
  code: string
  status: 'ACTIVE' | 'PAUSED'
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
  /** Catalogs available for the catalog step */
  catalogs: Catalog[]
  /** Selected catalog (step 1). Lifted to the page so the product pickers can be scoped to it. */
  selectedCatalogId?: string
  setSelectedCatalogId: (id: string | undefined) => void
  /** 1-based step to open on when creating (deep link from the catalog tools modal). */
  initialStep?: number
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

const LAST_STEP = 3

export function PromotionModal({
  open,
  onClose,
  editingPromo,
  catalogs,
  selectedCatalogId,
  setSelectedCatalogId,
  initialStep,
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
  const { token } = theme.useToken()
  const [form] = Form.useForm()
  const [current, setCurrent] = useState(0)
  const [active, setActive] = useState(true)
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
    if (!open) return
    if (editingPromo) {
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
      const formStatus = (promo.status as string | undefined) ?? 'ACTIVE'
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
      setActive(formStatus !== 'PAUSED' && formStatus !== 'DRAFT' && formStatus !== 'EXPIRED')
      setSelectedCatalogId((promo.catalogId as string | undefined) ?? undefined)
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
      setCurrent(0)
    } else {
      // Create mode: optionally deep-link to a later step with a catalog preset.
      setCurrent(initialStep && initialStep > 1 ? Math.min(initialStep - 1, LAST_STEP) : 0)
      setActive(true)
    }
  }, [
    open,
    editingPromo,
    initialStep,
    form,
    setSelectedProductIds,
    setRewardProducts,
    setSelectedCatalogId,
  ])

  const buildSubmitData = (values: Record<string, unknown>): PromotionSubmitData => {
    const [startDate, endDate] =
      (values.period as [dayjs.Dayjs, dayjs.Dayjs | null] | undefined) || []
    const submitRewardType: PromotionRewardType =
      (values.rewardType as PromotionRewardType) || 'PERCENT'
    const discountType: 'PERCENTAGE' | 'FIXED_AMOUNT' =
      submitRewardType === 'PERCENT' ? 'PERCENTAGE' : 'FIXED_AMOUNT'
    const discountValue =
      submitRewardType === 'PERCENT'
        ? ((values.rewardPercent as number) ?? 0)
        : submitRewardType === 'CREDIT'
          ? ((values.rewardCredit as number) ?? 0)
          : 0
    return {
      catalogId: selectedCatalogId ?? '',
      name: values.name as string,
      code: values.code as string,
      status: active ? 'ACTIVE' : 'PAUSED',
      discountType,
      discountValue,
      startDate: startDate ? startDate.toISOString() : '',
      endDate: endDate ? endDate.toISOString() : '',
      eligibility: values.eligibility as PromotionEligibility,
      productIds: values.eligibility === 'specific' ? selectedProductIds : [],
      stackable: (values.stackable as boolean) ?? false,
      minOrderAmount: enableMinAmount ? ((values.minOrderAmount as number) ?? 0) : null,
      minItemCount: enableMinItems ? ((values.minItemCount as number) ?? 0) : null,
      rewardType: submitRewardType,
      rewardCredit: submitRewardType === 'CREDIT' ? ((values.rewardCredit as number) ?? 0) : null,
      rewardPercent:
        submitRewardType === 'PERCENT' ? ((values.rewardPercent as number) ?? 0) : null,
      rewardProductIds: submitRewardType === 'PRODUCTS' ? rewardProducts.map((p) => p.id) : [],
    }
  }

  // Fields validated when leaving each step.
  const stepFields: string[][] = [
    [], // catalog handled manually (not a form field)
    ['name', 'code', 'period'],
    [
      'eligibility',
      ...(enableMinAmount ? ['minOrderAmount'] : []),
      ...(enableMinItems ? ['minItemCount'] : []),
    ],
    [
      'rewardType',
      ...(rewardType === 'PERCENT' ? ['rewardPercent'] : []),
      ...(rewardType === 'CREDIT' ? ['rewardCredit'] : []),
    ],
  ]

  const goNext = async () => {
    if (current === 0 && !selectedCatalogId) return
    try {
      if (stepFields[current].length) await form.validateFields(stepFields[current])
      setCurrent((c) => Math.min(c + 1, LAST_STEP))
    } catch {
      // validation errors are shown inline by the form
    }
  }

  const goBack = () => setCurrent((c) => Math.max(c - 1, 0))

  // Map a form field to the step that hosts it, so a failed final validation
  // jumps the user back to the offending step instead of failing silently.
  const fieldStep: Record<string, number> = {
    name: 1,
    code: 1,
    period: 1,
    eligibility: 2,
    minOrderAmount: 2,
    minItemCount: 2,
    rewardType: 3,
    rewardPercent: 3,
    rewardCredit: 3,
  }

  const handleSubmit = () => {
    if (!selectedCatalogId) {
      setCurrent(0)
      return
    }
    form
      .validateFields()
      .then((values) => {
        if (onSubmit) {
          onSubmit(buildSubmitData(values))
        } else {
          resetForm()
          onClose()
        }
      })
      .catch((err: { errorFields?: Array<{ name: (string | number)[] }> }) => {
        const firstField = err?.errorFields?.[0]?.name?.[0]
        const step = typeof firstField === 'string' ? fieldStep[firstField] : undefined
        if (step !== undefined) setCurrent(step)
      })
  }

  const resetForm = () => {
    form.resetFields()
    setCurrent(0)
    setActive(true)
    setEligibility('all')
    setEnableMinAmount(false)
    setEnableMinItems(false)
    setSelectedProductIds([])
    setRewardProducts([])
    setSelectedCatalogId(undefined)
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handlePickCatalog = (id: string) => {
    if (id !== selectedCatalogId) {
      // Products belong to a catalog — clear the previous catalog's selections.
      setSelectedProductIds([])
      setRewardProducts([])
    }
    setSelectedCatalogId(id)
  }

  const removeProduct = (id: string) => {
    setSelectedProductIds((prev) => prev.filter((pid) => pid !== id))
  }

  const removeRewardProduct = (id: string) => {
    setRewardProducts((prev) => prev.filter((p) => p.id !== id))
  }

  const steps = [
    { title: t('promotions.step_catalog'), icon: <Package size={16} /> },
    { title: t('promotions.step_info'), icon: <Info size={16} /> },
    { title: t('promotions.step_eligibility'), icon: <ListChecks size={16} /> },
    { title: t('promotions.step_reward'), icon: <Gift size={16} /> },
  ]

  const show = (idx: number) => ({ display: current === idx ? undefined : 'none' }) as const

  return (
    <Modal
      title={isEditing ? t('promotions.edit_title') : t('promotions.create_title')}
      open={open}
      onCancel={handleClose}
      width={680}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button onClick={handleClose}>{t('promotions.cancel')}</Button>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2">
              <Switch checked={active} onChange={setActive} size="small" />
              <span className="text-sm text-text-primary">
                {active ? t('promotions.status_active') : t('promotions.status_paused')}
              </span>
            </span>
            {current > 0 && <Button onClick={goBack}>{t('promotions.back')}</Button>}
            {current < LAST_STEP ? (
              <Button
                type="primary"
                onClick={goNext}
                disabled={current === 0 && !selectedCatalogId}
              >
                {t('promotions.next')}
              </Button>
            ) : (
              <Button type="primary" onClick={handleSubmit} loading={submitLoading}>
                {isEditing ? t('promotions.save') : t('promotions.create_button')}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <Steps current={current} items={steps} size="small" className="pt-1 pb-4" />

      <Form
        form={form}
        layout="vertical"
        className="pt-1"
        initialValues={{ rewardType: 'PERCENT', eligibility: 'all', stackable: false }}
      >
        {/* ─── Step 1: Catalogue ─── */}
        <div style={show(0)}>
          <div className="mb-1 text-sm font-semibold text-text-primary">
            {t('promotions.select_catalog')}
          </div>
          <div className="text-xs text-text-muted mb-3">{t('promotions.select_catalog_hint')}</div>
          {catalogs.length === 0 ? (
            <div className="create-ticket-empty-section">
              <Package size={32} strokeWidth={1.5} className="text-text-muted opacity-50" />
              <div className="text-sm font-medium text-text-primary">
                {t('promotions.no_catalogs')}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {catalogs.map((c) => {
                const isSelected = c.id === selectedCatalogId
                return (
                  <Card
                    key={c.id}
                    size="small"
                    hoverable
                    onClick={() => handlePickCatalog(c.id)}
                    style={{
                      borderColor: isSelected ? token.colorPrimary : undefined,
                      borderWidth: isSelected ? 2 : 1,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex-shrink-0 text-text-muted">
                        <Package size={20} strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-text-primary">
                          {c.name}
                        </div>
                        <div className="text-xs text-text-muted">
                          {t('promotions.products_count', { count: c.productCount ?? 0 })}
                        </div>
                      </div>
                      {isSelected && (
                        <span style={{ color: token.colorPrimary }}>
                          <Check size={18} />
                        </span>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>

        {/* ─── Step 2: Infos ─── */}
        <div style={show(1)}>
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
        </div>

        {/* ─── Step 3: Éligibilité ─── */}
        <div style={show(2)}>
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

          {/* Eligibility thresholds (stackable) */}
          <div className="mb-2">
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
        </div>

        {/* ─── Step 4: Récompense ─── */}
        <div style={show(3)}>
          <Form.Item
            label={t('promotions.reward_type')}
            name="rewardType"
            rules={[{ required: true, message: t('promotions.required') }]}
          >
            <Select
              options={REWARD_TYPE_OPTIONS.map((o) => ({
                ...o,
                label: (
                  <span className="flex items-center gap-2">
                    {o.value === 'PERCENT' && <Percent size={14} />}
                    {o.value === 'CREDIT' && <Wallet size={14} />}
                    {o.value === 'PRODUCTS' && <Gift size={14} />}
                    {o.label}
                  </span>
                ),
              }))}
            />
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
            label={t('promotions.stackable_label')}
            name="stackable"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  )
}
