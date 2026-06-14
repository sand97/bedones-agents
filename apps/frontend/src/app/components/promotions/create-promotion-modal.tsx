/**
 * ⚠️ PROTECTED FILE — DO NOT MODIFY unless you have received an EXPLICIT order to do so.
 * If you do modify this file, you MUST NOT remove or alter any existing fields, props,
 * form items, or mock data imports. Only ADD to this file, never delete or replace.
 * Any agent that removes functionality from this modal will break the promotion creation flow.
 *
 * NOTE: Per explicit user requests, this modal implements the Claude Design hand-off
 * (5-step linear wizard: Catalogue · Identité & période · Conditions · Récompense ·
 * Récapitulatif) with the Actif/En pause status in the header and discreet step
 * validation. Promotions are scoped to a catalog. Every data point that existed before
 * is still collected — it was only reorganised across the steps.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal, Input, InputNumber, DatePicker, Switch, Segmented } from 'antd'
import {
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  ShoppingBag,
  Percent,
  Wallet,
  Gift,
  ListChecks,
  AlertCircle,
} from 'lucide-react'
import dayjs, { type Dayjs } from 'dayjs'
import 'dayjs/locale/fr'
import {
  MOCK_CATALOG_ARTICLES,
  type PromotionEligibility,
  type PromotionFull,
} from '@app/components/whatsapp/mock-data'
import type { PickerProduct } from '@app/components/promotions/product-picker-modal'
import type { Catalog } from '@app/lib/api/agent-api'
import { useLayout } from '@app/contexts/layout-context'
import './promotion-wizard.css'

dayjs.locale('fr')

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
  minOrderAmount: number | null
  minItemCount: number | null
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

interface WizardData {
  name: string
  code: string
  startDate: Dayjs | null
  endDate: Dayjs | null
  scope: PromotionEligibility
  minAmountOn: boolean
  minAmount: number | null
  minItemsOn: boolean
  minItems: number | null
  rewardType: PromotionRewardType
  rewardPercent: number | null
  rewardCredit: number | null
  active: boolean
  stackable: boolean
}

const makeEmpty = (): WizardData => ({
  name: '',
  code: '',
  startDate: null,
  endDate: null,
  scope: 'all',
  minAmountOn: false,
  minAmount: null,
  minItemsOn: false,
  minItems: null,
  rewardType: 'PERCENT',
  rewardPercent: null,
  rewardCredit: null,
  active: true,
  stackable: false,
})

// Which validation keys belong to which logical section.
const SECTION_KEYS: Record<string, string[]> = {
  catalogue: ['catalogId'],
  identite: ['name', 'code'],
  periode: ['startDate', 'endDate'],
  conditions: ['eligibles', 'minAmount', 'minItems'],
  recompense: ['reward'],
  recap: [],
}

const fcfaInput = {
  formatter: (v?: number | string) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' '),
  parser: (v?: string) => Number((v || '').replace(/\s/g, '')),
}

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
  const { isDesktop } = useLayout()
  const [current, setCurrent] = useState(0)
  const [attempted, setAttempted] = useState<number[]>([])
  const [data, setData] = useState<WizardData>(makeEmpty)

  const isEditing = !!editingPromo
  const setField = (patch: Partial<WizardData>) => setData((d) => ({ ...d, ...patch }))

  // Eligible products: real objects when provided, fallback to mocks (kept for parity).
  const selectedArticles =
    selectedProducts !== undefined
      ? selectedProducts
      : MOCK_CATALOG_ARTICLES.filter((a) => selectedProductIds.includes(a.id))

  const steps = [
    {
      label: t('promotions.step_catalog'),
      sub: t('promotions.step_catalog_sub'),
      sections: ['catalogue'],
    },
    {
      label: t('promotions.step_identity'),
      sub: t('promotions.step_identity_sub'),
      sections: ['identite', 'periode'],
    },
    {
      label: t('promotions.step_conditions'),
      sub: t('promotions.step_conditions_sub'),
      sections: ['conditions'],
    },
    {
      label: t('promotions.step_reward'),
      sub: t('promotions.step_reward_sub'),
      sections: ['recompense'],
    },
    { label: t('promotions.step_recap'), sub: t('promotions.step_recap_sub'), sections: ['recap'] },
  ]
  const LAST = steps.length - 1

  useEffect(() => {
    if (!open) return
    if (editingPromo) {
      const promo = editingPromo as PromotionFull & Record<string, unknown>
      const discountValue = (promo.value ?? promo.discountValue ?? 0) as number
      const rewardType: PromotionRewardType =
        (promo.rewardType as PromotionRewardType | undefined) ??
        (promo.discountType === 'PERCENTAGE' ? 'PERCENT' : 'CREDIT')
      const rewardPercent =
        (promo.rewardPercent as number | null | undefined) ??
        (rewardType === 'PERCENT' ? discountValue : null)
      const rewardCredit =
        (promo.rewardCredit as number | null | undefined) ??
        (rewardType === 'CREDIT' ? discountValue : null)
      const products = ((promo.products as Array<{ product?: { id: string } }>) ?? []).filter(
        Boolean,
      )
      const minAmount = promo.minOrderAmount as number | null | undefined
      const minItems = promo.minItemCount as number | null | undefined
      const status = (promo.status as string | undefined) ?? 'ACTIVE'
      const start = (editingPromo.startDate ?? promo.startDate) as string | undefined
      const end = (editingPromo.endDate ?? promo.endDate) as string | undefined

      setData({
        name: editingPromo.name ?? '',
        code: (editingPromo.code ?? promo.code ?? '') as string,
        startDate: start ? dayjs(start) : null,
        endDate: end ? dayjs(end) : null,
        scope:
          products.length > 0 ? 'specific' : ((promo.eligibility as PromotionEligibility) ?? 'all'),
        minAmountOn: minAmount !== null && minAmount !== undefined,
        minAmount: minAmount ?? null,
        minItemsOn: minItems !== null && minItems !== undefined,
        minItems: minItems ?? null,
        rewardType,
        rewardPercent: rewardPercent ?? null,
        rewardCredit: rewardCredit ?? null,
        active: status === 'ACTIVE',
        stackable: (editingPromo.stackable ?? promo.stackable ?? false) as boolean,
      })
      setSelectedCatalogId((promo.catalogId as string | undefined) ?? undefined)
      setRewardProducts(
        (
          (promo.rewardProducts as
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
        ).map((p) => ({
          id: p.product?.id ?? '',
          name: p.product?.name ?? '',
          description: '',
          imageUrl: p.product?.imageUrl ?? '',
          price: p.product?.price ?? 0,
          currency: p.product?.currency ?? 'FCFA',
        })),
      )
      setCurrent(0)
      setAttempted([])
    } else {
      setData(makeEmpty())
      setCurrent(initialStep && initialStep > 1 ? Math.min(initialStep - 1, LAST) : 0)
      setAttempted([])
    }
  }, [open, editingPromo, initialStep])

  // ── validation ──
  const computeErrors = (): Record<string, string> => {
    const e: Record<string, string> = {}
    if (!selectedCatalogId) e.catalogId = t('promotions.catalog_required')
    if (!data.name.trim()) e.name = t('promotions.name_required')
    if (!data.code.trim()) e.code = t('promotions.code_required')
    if (!data.startDate) e.startDate = t('promotions.start_date_required')
    if (data.startDate && data.endDate && data.endDate.isBefore(data.startDate, 'day'))
      e.endDate = t('promotions.end_after_start')
    if (data.scope === 'specific' && selectedProductIds.length === 0)
      e.eligibles = t('promotions.eligibles_required')
    if (data.minAmountOn && (data.minAmount === null || data.minAmount < 0))
      e.minAmount = t('promotions.amount_invalid')
    if (data.minItemsOn && (data.minItems === null || data.minItems < 1))
      e.minItems = t('promotions.items_min_1')
    if (
      data.rewardType === 'PERCENT' &&
      (data.rewardPercent === null || data.rewardPercent < 1 || data.rewardPercent > 100)
    )
      e.reward = t('promotions.percent_range')
    if (data.rewardType === 'CREDIT' && (data.rewardCredit === null || data.rewardCredit < 0))
      e.reward = t('promotions.credit_invalid')
    if (data.rewardType === 'PRODUCTS' && rewardProducts.length === 0)
      e.reward = t('promotions.reward_products_required')
    return e
  }

  const errors = computeErrors()
  const stepOfKey = (k: string) =>
    steps.findIndex((s) => s.sections.some((sec) => SECTION_KEYS[sec].includes(k)))
  const E = (k: string) => (attempted.includes(stepOfKey(k)) ? errors[k] || '' : '')
  const stepHasError = (idx: number) =>
    steps[idx].sections.some((sec) => SECTION_KEYS[sec].some((k) => errors[k]))

  const goBack = () => setCurrent((c) => Math.max(0, c - 1))
  const goToStep = (i: number) => setCurrent(i)

  const handleSubmit = () => {
    if (!onSubmit) {
      handleClose()
      return
    }
    onSubmit({
      catalogId: selectedCatalogId ?? '',
      name: data.name,
      code: data.code,
      status: data.active ? 'ACTIVE' : 'PAUSED',
      discountType: data.rewardType === 'PERCENT' ? 'PERCENTAGE' : 'FIXED_AMOUNT',
      discountValue:
        data.rewardType === 'PERCENT'
          ? (data.rewardPercent ?? 0)
          : data.rewardType === 'CREDIT'
            ? (data.rewardCredit ?? 0)
            : 0,
      startDate: data.startDate ? data.startDate.toISOString() : '',
      endDate: data.endDate ? data.endDate.toISOString() : '',
      eligibility: data.scope,
      productIds: data.scope === 'specific' ? selectedProductIds : [],
      stackable: data.stackable,
      minOrderAmount: data.minAmountOn ? (data.minAmount ?? 0) : null,
      minItemCount: data.minItemsOn ? (data.minItems ?? 0) : null,
      rewardType: data.rewardType,
      rewardCredit: data.rewardType === 'CREDIT' ? (data.rewardCredit ?? 0) : null,
      rewardPercent: data.rewardType === 'PERCENT' ? (data.rewardPercent ?? 0) : null,
      rewardProductIds: data.rewardType === 'PRODUCTS' ? rewardProducts.map((p) => p.id) : [],
    })
  }

  const onPrimary = () => {
    const errs = computeErrors()
    if (current === LAST) {
      if (Object.keys(errs).length === 0) {
        handleSubmit()
        return
      }
      setAttempted(steps.map((_, i) => i))
      const firstBad = steps.findIndex((_, i) => stepHasError(i))
      if (firstBad >= 0) setCurrent(firstBad)
      return
    }
    setAttempted((a) => (a.includes(current) ? a : [...a, current]))
    if (!stepHasError(current)) setCurrent((c) => Math.min(LAST, c + 1))
  }

  const resetAll = () => {
    setData(makeEmpty())
    setCurrent(0)
    setAttempted([])
    setSelectedProductIds([])
    setRewardProducts([])
    setSelectedCatalogId(undefined)
  }

  const handleClose = () => {
    resetAll()
    onClose()
  }

  const pickCatalog = (id: string) => {
    if (id !== selectedCatalogId) {
      setSelectedProductIds([])
      setRewardProducts([])
    }
    setSelectedCatalogId(id)
  }

  const removeEligible = (id: string) =>
    setSelectedProductIds((prev) => prev.filter((x) => x !== id))
  const removeReward = (id: string) => setRewardProducts((prev) => prev.filter((p) => p.id !== id))

  const selectedCatalog = catalogs.find((c) => c.id === selectedCatalogId)
  const isLast = current === LAST
  const primaryLabel = isLast
    ? isEditing
      ? t('promotions.save')
      : t('promotions.publish')
    : t('promotions.continue')

  // ── recap helpers ──
  const fmtPrice = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`
  const validity = data.startDate
    ? data.endDate
      ? t('promotions.recap_period_range', {
          start: data.startDate.format('D MMM YYYY'),
          end: data.endDate.format('D MMM YYYY'),
        })
      : t('promotions.recap_period_open', { start: data.startDate.format('D MMM YYYY') })
    : t('promotions.recap_period_none')
  const condChips: string[] = []
  condChips.push(
    data.scope === 'specific'
      ? t('promotions.product_count', { count: selectedProductIds.length })
      : t('promotions.eligibility_all'),
  )
  if (data.minAmountOn)
    condChips.push(t('promotions.recap_min_amount', { amount: fmtPrice(data.minAmount ?? 0) }))
  if (data.minItemsOn) condChips.push(t('promotions.recap_min_items', { n: data.minItems ?? 0 }))
  const rewardBig =
    data.rewardType === 'PERCENT'
      ? `−${data.rewardPercent ?? 0}%`
      : data.rewardType === 'CREDIT'
        ? `+${fmtPrice(data.rewardCredit ?? 0)}`
        : t('promotions.reward_products_count', { count: rewardProducts.length })
  const rewardSmall =
    data.rewardType === 'PERCENT'
      ? t('promotions.reward_percent')
      : data.rewardType === 'CREDIT'
        ? t('promotions.reward_credit')
        : t('promotions.reward_products')

  const renderChips = (items: PickerProduct[], onRemove: (id: string) => void) => (
    <div className="promo-chips">
      {items.map((p) => (
        <div key={p.id} className="promo-chip">
          {p.imageUrl ? (
            <img src={p.imageUrl} alt="" className="promo-chip__img" />
          ) : (
            <span className="promo-chip__img" />
          )}
          <div className="leading-tight">
            <div className="promo-chip__name">{p.name}</div>
            <div className="promo-chip__price">{fmtPrice(p.price)}</div>
          </div>
          <button type="button" className="promo-chip__remove" onClick={() => onRemove(p.id)}>
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  )

  const rewardCard = (
    value: PromotionRewardType,
    icon: React.ReactNode,
    label: string,
    desc: string,
    full = false,
  ) => (
    <button
      type="button"
      className={`promo-reward${data.rewardType === value ? ' is-selected' : ''}${full ? ' promo-reward--full' : ''}`}
      onClick={() => setField({ rewardType: value })}
    >
      <span className="promo-reward__icon">{icon}</span>
      <span className="promo-reward__label">{label}</span>
      <span className="promo-reward__desc">{desc}</span>
    </button>
  )

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      width={720}
      closable={false}
      title={null}
      styles={{ body: { padding: 0 }, content: { padding: 0, overflow: 'hidden' } }}
      footer={
        <div className="flex w-full items-center justify-between gap-3 px-5 py-3">
          <div>
            {current > 0 && (
              <Button onClick={goBack} icon={<ChevronLeft size={15} />}>
                {t('promotions.back')}
              </Button>
            )}
          </div>
          <Button
            type="primary"
            onClick={onPrimary}
            loading={submitLoading}
            icon={isLast ? <Check size={16} /> : <ChevronRight size={15} />}
            iconPosition="end"
          >
            {primaryLabel}
          </Button>
        </div>
      }
    >
      {/* header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-5 pb-3.5 pt-4">
        <div className="order-1 min-w-0 flex-1 text-[17px] font-semibold text-text-primary">
          {isEditing ? t('promotions.edit_title') : t('promotions.create_title')}
        </div>
        <div className={isDesktop ? 'order-2' : 'order-3 basis-full'}>
          <Segmented
            className="promo-status-toggle"
            size="small"
            value={data.active ? 'ACTIVE' : 'PAUSED'}
            onChange={(v) => setField({ active: v === 'ACTIVE' })}
            options={[
              {
                value: 'ACTIVE',
                label: (
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-[7px] w-[7px] rounded-full"
                      style={{ background: '#22c55e' }}
                    />
                    {t('promotions.status_active')}
                  </span>
                ),
              },
              { value: 'PAUSED', label: t('promotions.status_paused') },
            ]}
          />
        </div>
        <Button
          type="text"
          className="order-2 lg:order-3"
          icon={<X size={16} />}
          onClick={handleClose}
        />
      </div>

      {/* progress */}
      <div className="promo-wizard__progress">
        <div
          className="promo-wizard__progress-bar"
          style={{ width: `${Math.round(((current + 1) / steps.length) * 100)}%` }}
        />
      </div>

      <div className="promo-wizard__body">
        {/* stepper */}
        {isDesktop ? (
          <div className="promo-wizard__rail">
            {steps.map((st, i) => {
              const done = i < current
              const cur = i === current
              const err = attempted.includes(i) && stepHasError(i)
              return (
                <div key={i} className="promo-step" onClick={() => goToStep(i)}>
                  <div className="promo-step__col">
                    <div
                      className={`promo-step__dot${cur ? ' is-current' : ''}${done ? ' is-done' : ''}${err ? ' is-error' : ''}`}
                    >
                      {done ? <Check size={14} /> : i + 1}
                    </div>
                    {i < steps.length - 1 && (
                      <div className={`promo-step__line${done ? ' is-done' : ''}`} />
                    )}
                  </div>
                  <div className="promo-step__text">
                    <div className={`promo-step__label${cur ? ' is-active' : ''}`}>{st.label}</div>
                    <div className="promo-step__sub">{st.sub}</div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="promo-wizard__mobile-steps">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`promo-step-mdot${i === current ? ' is-current' : ''}${i < current ? ' is-done' : ''}`}
                onClick={() => goToStep(i)}
              />
            ))}
            <span className="ml-1.5 text-[12.5px] font-semibold text-text-secondary">
              {t('promotions.step_counter', { current: current + 1, total: steps.length })} ·{' '}
              {steps[current].label}
            </span>
          </div>
        )}

        {/* form scroll */}
        <div className="promo-wizard__scroll">
          {/* ── Catalogue ── */}
          {current === 0 && (
            <div>
              <div className="promo-section__title">{t('promotions.select_catalog')}</div>
              <div className="promo-section__desc">{t('promotions.select_catalog_hint')}</div>
              {catalogs.length === 0 ? (
                <div className="create-ticket-empty-section mt-3">
                  <ShoppingBag size={32} strokeWidth={1.5} className="text-text-muted opacity-50" />
                  <div className="text-sm font-medium text-text-primary">
                    {t('promotions.no_catalogs')}
                  </div>
                </div>
              ) : (
                <div className="promo-catalog-grid">
                  {catalogs.map((c) => {
                    const sel = c.id === selectedCatalogId
                    return (
                      <button
                        type="button"
                        key={c.id}
                        className={`promo-option${sel ? ' is-selected' : ''}`}
                        onClick={() => pickCatalog(c.id)}
                      >
                        <span className="promo-option__icon">
                          <ShoppingBag size={19} strokeWidth={1.6} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="promo-option__name block truncate">{c.name}</span>
                          <span className="promo-option__meta block">
                            {t('promotions.products_count', { count: c.productCount ?? 0 })}
                          </span>
                        </span>
                        <span className="promo-option__radio">{sel && <Check size={11} />}</span>
                      </button>
                    )
                  })}
                </div>
              )}
              {E('catalogId') && <div className="promo-field__error">{E('catalogId')}</div>}
            </div>
          )}

          {/* ── Identité & période ── */}
          {current === 1 && (
            <div className="flex flex-col gap-6">
              <div>
                <div className="promo-section__title mb-3.5">{t('promotions.step_identity')}</div>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="promo-field__label">
                      {t('promotions.name')} <span className="text-danger">*</span>
                    </label>
                    <Input
                      size="large"
                      value={data.name}
                      onChange={(e) => setField({ name: e.target.value })}
                      placeholder={t('promotions.name_placeholder')}
                      status={E('name') ? 'error' : undefined}
                    />
                    {E('name') && <div className="promo-field__error">{E('name')}</div>}
                  </div>
                  <div>
                    <label className="promo-field__label">
                      {t('promotions.code')} <span className="text-danger">*</span>
                    </label>
                    <Input
                      size="large"
                      prefix="#"
                      className="font-mono uppercase"
                      value={data.code}
                      onChange={(e) =>
                        setField({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })
                      }
                      placeholder="RENTREE25"
                      status={E('code') ? 'error' : undefined}
                    />
                    <div className="promo-field__hint">{t('promotions.code_hint')}</div>
                    {E('code') && <div className="promo-field__error">{E('code')}</div>}
                  </div>
                </div>
              </div>
              <div>
                <div className="promo-section__title mb-3.5">{t('promotions.validity_period')}</div>
                <div className="flex flex-col gap-3.5 sm:flex-row">
                  <div className="flex-1">
                    <label className="promo-field__label">
                      {t('promotions.start_date')} <span className="text-danger">*</span>
                    </label>
                    <DatePicker
                      className="w-full"
                      format="DD/MM/YYYY"
                      value={data.startDate}
                      onChange={(d) => setField({ startDate: d })}
                      status={E('startDate') ? 'error' : undefined}
                    />
                    {E('startDate') && <div className="promo-field__error">{E('startDate')}</div>}
                  </div>
                  <div className="flex-1">
                    <label className="promo-field__label">
                      {t('promotions.end_date')}{' '}
                      <span className="promo-field__opt">· {t('promotions.optional')}</span>
                    </label>
                    <DatePicker
                      className="w-full"
                      format="DD/MM/YYYY"
                      value={data.endDate}
                      onChange={(d) => setField({ endDate: d })}
                      status={E('endDate') ? 'error' : undefined}
                    />
                    <div className="promo-field__hint">{t('promotions.no_end_hint')}</div>
                    {E('endDate') && <div className="promo-field__error">{E('endDate')}</div>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Conditions ── */}
          {current === 2 && (
            <div>
              <div className="promo-section__eyebrow">
                <span className="promo-section__eyebrow-icon">
                  <ListChecks size={15} strokeWidth={1.7} />
                </span>
                <span className="promo-section__eyebrow-label">
                  {t('promotions.eligibility_conditions')}
                </span>
              </div>
              <div className="promo-section__desc mb-4">{t('promotions.conditions_hint')}</div>

              <div className="mb-2 text-[13px] font-medium text-text-primary">
                {t('promotions.scope_label')}
              </div>
              <div className="promo-option-row">
                {(
                  [
                    ['all', t('promotions.scope_all'), t('promotions.scope_all_desc')],
                    [
                      'specific',
                      t('promotions.scope_specific'),
                      t('promotions.scope_specific_desc'),
                    ],
                  ] as const
                ).map(([val, label, desc]) => {
                  const sel = data.scope === val
                  return (
                    <button
                      type="button"
                      key={val}
                      className={`promo-option promo-option--start${sel ? ' is-selected' : ''}`}
                      onClick={() => {
                        setField({ scope: val })
                        if (val === 'all') setSelectedProductIds([])
                      }}
                    >
                      <span className="promo-option__radio mt-0.5">
                        {sel && <span className="promo-option__radio-dot" />}
                      </span>
                      <span>
                        <span className="promo-option__name block">{label}</span>
                        <span className="promo-option__meta block">{desc}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
              {data.scope === 'specific' && (
                <div className="mt-3">
                  <button
                    type="button"
                    className="promo-picker-trigger"
                    onClick={onOpenProductPicker}
                  >
                    <Plus size={15} />
                    {t('promotions.pick_eligibles')}
                  </button>
                  {renderChips(selectedArticles, removeEligible)}
                  {E('eligibles') && (
                    <div className="promo-field__error mt-2">{E('eligibles')}</div>
                  )}
                </div>
              )}

              {/* montant min */}
              <div className="promo-cond-row">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-[13px] font-medium text-text-primary">
                      {t('promotions.min_order_amount')}
                    </div>
                    <div className="promo-option__meta">
                      {t('promotions.min_order_amount_desc')}
                    </div>
                  </div>
                  <Switch
                    checked={data.minAmountOn}
                    onChange={(v) => setField({ minAmountOn: v })}
                    size="small"
                  />
                </div>
                {data.minAmountOn && (
                  <div className="mt-3 max-w-[240px]">
                    <InputNumber
                      className="w-full"
                      min={0}
                      suffix="FCFA"
                      placeholder="10 000"
                      value={data.minAmount}
                      onChange={(v) => setField({ minAmount: v })}
                      status={E('minAmount') ? 'error' : undefined}
                      {...fcfaInput}
                    />
                    {E('minAmount') && <div className="promo-field__error">{E('minAmount')}</div>}
                  </div>
                )}
              </div>

              {/* articles min */}
              <div className="promo-cond-row">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-[13px] font-medium text-text-primary">
                      {t('promotions.min_item_count')}
                    </div>
                    <div className="promo-option__meta">{t('promotions.min_item_count_desc')}</div>
                  </div>
                  <Switch
                    checked={data.minItemsOn}
                    onChange={(v) => setField({ minItemsOn: v })}
                    size="small"
                  />
                </div>
                {data.minItemsOn && (
                  <div className="mt-3 max-w-[160px]">
                    <InputNumber
                      className="w-full"
                      min={1}
                      placeholder="3"
                      value={data.minItems}
                      onChange={(v) => setField({ minItems: v })}
                      status={E('minItems') ? 'error' : undefined}
                    />
                    {E('minItems') && <div className="promo-field__error">{E('minItems')}</div>}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Récompense ── */}
          {current === 3 && (
            <div>
              <div className="promo-section__eyebrow">
                <span className="promo-section__eyebrow-icon is-solid">
                  <Gift size={15} strokeWidth={1.7} />
                </span>
                <span className="promo-section__eyebrow-label">
                  {t('promotions.reward_eyebrow')}
                </span>
              </div>
              <div className="promo-section__desc mb-4">{t('promotions.reward_hint')}</div>

              <div className="promo-reward-row">
                {rewardCard(
                  'PERCENT',
                  <Percent size={18} strokeWidth={1.8} />,
                  t('promotions.reward_percent'),
                  t('promotions.reward_percent_desc'),
                )}
                {rewardCard(
                  'CREDIT',
                  <Wallet size={18} strokeWidth={1.8} />,
                  t('promotions.reward_credit'),
                  t('promotions.reward_credit_desc'),
                )}
                {rewardCard(
                  'PRODUCTS',
                  <Gift size={18} strokeWidth={1.8} />,
                  t('promotions.reward_products'),
                  t('promotions.reward_products_desc'),
                  true,
                )}
              </div>

              <div className="mt-4">
                {data.rewardType === 'PERCENT' && (
                  <div>
                    <label className="promo-field__label">
                      {t('promotions.reward_percent_value')}
                    </label>
                    <div className="max-w-[160px]">
                      <InputNumber
                        className="w-full"
                        min={1}
                        max={100}
                        suffix="%"
                        placeholder="20"
                        value={data.rewardPercent}
                        onChange={(v) => setField({ rewardPercent: v })}
                        status={E('reward') ? 'error' : undefined}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {[5, 10, 15, 20, 30, 50].map((n) => (
                        <button
                          type="button"
                          key={n}
                          className={`promo-quick${data.rewardPercent === n ? ' is-active' : ''}`}
                          onClick={() => setField({ rewardPercent: n })}
                        >
                          {n}%
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {data.rewardType === 'CREDIT' && (
                  <div>
                    <label className="promo-field__label">
                      {t('promotions.reward_credit_value')}
                    </label>
                    <div className="max-w-[240px]">
                      <InputNumber
                        className="w-full"
                        min={0}
                        suffix="FCFA"
                        placeholder="15 000"
                        value={data.rewardCredit}
                        onChange={(v) => setField({ rewardCredit: v })}
                        status={E('reward') ? 'error' : undefined}
                        {...fcfaInput}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {[5000, 10000, 25000].map((n) => (
                        <button
                          type="button"
                          key={n}
                          className={`promo-quick${data.rewardCredit === n ? ' is-active' : ''}`}
                          onClick={() => setField({ rewardCredit: n })}
                        >
                          {fmtPrice(n)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {data.rewardType === 'PRODUCTS' && (
                  <div>
                    <label className="promo-field__label">{t('promotions.reward_products')}</label>
                    <button
                      type="button"
                      className="promo-picker-trigger"
                      onClick={onOpenRewardPicker}
                    >
                      <Plus size={15} />
                      {t('promotions.pick_reward_products')}
                    </button>
                    {renderChips(rewardProducts, removeReward)}
                  </div>
                )}
                {E('reward') && <div className="promo-field__error mt-2.5">{E('reward')}</div>}
              </div>
            </div>
          )}

          {/* ── Récapitulatif ── */}
          {current === 4 && (
            <div>
              <div className="promo-section__title mb-1">{t('promotions.step_recap')}</div>
              <div className="promo-section__desc mb-4">{t('promotions.recap_hint')}</div>

              {attempted.includes(LAST) && Object.keys(errors).length > 0 && (
                <div className="promo-recap__errors">
                  <div className="promo-recap__errors-title">
                    <AlertCircle size={15} />
                    {t('promotions.recap_fix_title')}
                  </div>
                  <ul className="promo-recap__errors-list">
                    {Object.keys(errors).map((k) => (
                      <li key={k}>{errors[k]}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="promo-recap">
                <div className="promo-recap__row">
                  <div className="flex-1">
                    <div className="promo-recap__key">{t('promotions.step_catalog')}</div>
                    <div className="promo-recap__val">{selectedCatalog?.name ?? '—'}</div>
                  </div>
                  <button type="button" className="promo-recap__edit" onClick={() => goToStep(0)}>
                    {t('promotions.edit')}
                  </button>
                </div>
                <div className="promo-recap__row">
                  <div className="flex-1">
                    <div className="promo-recap__key">{t('promotions.step_identity')}</div>
                    <div className="promo-recap__val">
                      {data.name || t('promotions.name')} ·{' '}
                      <span className="font-mono">{data.code || t('promotions.code')}</span>
                    </div>
                  </div>
                  <button type="button" className="promo-recap__edit" onClick={() => goToStep(1)}>
                    {t('promotions.edit')}
                  </button>
                </div>
                <div className="promo-recap__row">
                  <div className="flex-1">
                    <div className="promo-recap__key">{t('promotions.period')}</div>
                    <div className="promo-recap__val">{validity}</div>
                  </div>
                  <button type="button" className="promo-recap__edit" onClick={() => goToStep(1)}>
                    {t('promotions.edit')}
                  </button>
                </div>
                <div className="promo-recap__row promo-recap__row--top">
                  <div className="flex-1">
                    <div className="promo-recap__key">{t('promotions.eligibility_conditions')}</div>
                    <div className="promo-recap__chips">
                      {condChips.map((c, i) => (
                        <span key={i} className="promo-recap__chip">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button type="button" className="promo-recap__edit" onClick={() => goToStep(2)}>
                    {t('promotions.edit')}
                  </button>
                </div>
                <div className="promo-recap__row">
                  <div className="flex-1">
                    <div className="promo-recap__key">{t('promotions.step_reward')}</div>
                    <div className="promo-recap__val">
                      {rewardBig}{' '}
                      <span className="font-normal text-text-tertiary">· {rewardSmall}</span>
                    </div>
                  </div>
                  <button type="button" className="promo-recap__edit" onClick={() => goToStep(3)}>
                    {t('promotions.edit')}
                  </button>
                </div>
              </div>

              <div className="promo-recap__settings">
                <div className="flex items-center justify-between gap-3 py-3">
                  <div className="flex-1">
                    <div className="text-[13.5px] font-medium text-text-primary">
                      {t('promotions.stackable_label')}
                    </div>
                    <div className="promo-option__meta">{t('promotions.stackable_desc')}</div>
                  </div>
                  <Switch checked={data.stackable} onChange={(v) => setField({ stackable: v })} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
