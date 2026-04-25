import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, DatePicker, Form, Input, InputNumber, Modal, Select, Switch, Popover } from 'antd'
import { Plus, ShoppingBag, Trash2 } from 'lucide-react'
import dayjs from 'dayjs'
import type { PickerProduct } from '@app/components/promotions/product-picker-modal'
import type { LoyaltyBonus, LoyaltyRewardType } from '@app/lib/api/loyalty-api'

const { RangePicker } = DatePicker

export interface LoyaltyBonusSubmitData {
  name: string
  description?: string
  stackable: boolean
  targetSpend: number | null
  targetOrderCount: number | null
  targetProductsCount: number | null
  triggerProductIds: string[]
  rewardType: LoyaltyRewardType
  rewardCredit: number | null
  rewardPercent: number | null
  rewardProductIds: string[]
  startDate?: string
  endDate?: string
}

interface LoyaltyBonusModalProps {
  open: boolean
  onClose: () => void
  editingBonus?: LoyaltyBonus | null
  onOpenTriggerPicker: () => void
  onOpenRewardPicker: () => void
  triggerProducts: PickerProduct[]
  setTriggerProducts: React.Dispatch<React.SetStateAction<PickerProduct[]>>
  rewardProducts: PickerProduct[]
  setRewardProducts: React.Dispatch<React.SetStateAction<PickerProduct[]>>
  onSubmit: (data: LoyaltyBonusSubmitData) => void
  submitLoading?: boolean
}

export function LoyaltyBonusModal({
  open,
  onClose,
  editingBonus,
  onOpenTriggerPicker,
  onOpenRewardPicker,
  triggerProducts,
  setTriggerProducts,
  rewardProducts,
  setRewardProducts,
  onSubmit,
  submitLoading,
}: LoyaltyBonusModalProps) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [enableSpend, setEnableSpend] = useState(false)
  const [enableOrderCount, setEnableOrderCount] = useState(false)
  const [enableProducts, setEnableProducts] = useState(false)

  const REWARD_TYPE_OPTIONS = [
    { value: 'PRODUCTS', label: t('loyalty.reward_products') },
    { value: 'CREDIT', label: t('loyalty.reward_credit') },
    { value: 'PERCENT', label: t('loyalty.reward_percent') },
  ]

  const isEditing = !!editingBonus
  const rewardType: LoyaltyRewardType = Form.useWatch('rewardType', form) || 'CREDIT'

  useEffect(() => {
    if (!open) return
    if (editingBonus) {
      form.setFieldsValue({
        name: editingBonus.name,
        description: editingBonus.description,
        stackable: editingBonus.stackable,
        targetSpend: editingBonus.targetSpend ?? undefined,
        targetOrderCount: editingBonus.targetOrderCount ?? undefined,
        targetProductsCount: editingBonus.targetProductsCount ?? undefined,
        rewardType: editingBonus.rewardType,
        rewardCredit: editingBonus.rewardCredit ?? undefined,
        rewardPercent: editingBonus.rewardPercent ?? undefined,
        period:
          editingBonus.startDate && editingBonus.endDate
            ? [dayjs(editingBonus.startDate), dayjs(editingBonus.endDate)]
            : undefined,
      })
      setEnableSpend(editingBonus.targetSpend !== null)
      setEnableOrderCount(editingBonus.targetOrderCount !== null)
      setEnableProducts(
        editingBonus.targetProductsCount !== null || editingBonus.triggerProducts.length > 0,
      )
      setTriggerProducts(
        editingBonus.triggerProducts.map((p) => ({
          id: p.product.id,
          name: p.product.name,
          description: '',
          imageUrl: p.product.imageUrl ?? '',
          price: p.product.price ?? 0,
          currency: p.product.currency ?? 'FCFA',
        })),
      )
      setRewardProducts(
        editingBonus.rewardProducts.map((p) => ({
          id: p.product.id,
          name: p.product.name,
          description: '',
          imageUrl: p.product.imageUrl ?? '',
          price: p.product.price ?? 0,
          currency: p.product.currency ?? 'FCFA',
        })),
      )
    } else {
      form.resetFields()
      setEnableSpend(false)
      setEnableOrderCount(false)
      setEnableProducts(false)
      setTriggerProducts([])
      setRewardProducts([])
    }
  }, [open, editingBonus, form, setTriggerProducts, setRewardProducts])

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      const [start, end] = (values.period as [dayjs.Dayjs, dayjs.Dayjs] | undefined) || []
      onSubmit({
        name: values.name,
        description: values.description,
        stackable: values.stackable ?? false,
        targetSpend: enableSpend ? (values.targetSpend ?? 0) : null,
        targetOrderCount: enableOrderCount ? (values.targetOrderCount ?? 0) : null,
        targetProductsCount: enableProducts ? (values.targetProductsCount ?? null) : null,
        triggerProductIds: enableProducts ? triggerProducts.map((p) => p.id) : [],
        rewardType: values.rewardType,
        rewardCredit: values.rewardType === 'CREDIT' ? (values.rewardCredit ?? 0) : null,
        rewardPercent: values.rewardType === 'PERCENT' ? (values.rewardPercent ?? 0) : null,
        rewardProductIds: values.rewardType === 'PRODUCTS' ? rewardProducts.map((p) => p.id) : [],
        startDate: start ? start.toISOString() : undefined,
        endDate: end ? end.toISOString() : undefined,
      })
    })
  }

  const handleClose = () => {
    form.resetFields()
    setEnableSpend(false)
    setEnableOrderCount(false)
    setEnableProducts(false)
    setTriggerProducts([])
    setRewardProducts([])
    onClose()
  }

  const removeTrigger = (id: string) =>
    setTriggerProducts((prev) => prev.filter((p) => p.id !== id))
  const removeReward = (id: string) => setRewardProducts((prev) => prev.filter((p) => p.id !== id))

  return (
    <Modal
      title={isEditing ? t('loyalty.bonus_edit_title') : t('loyalty.bonus_create_title')}
      open={open}
      onCancel={handleClose}
      width={640}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button onClick={handleClose}>{t('common.cancel')}</Button>
          <Button type="primary" onClick={handleSubmit} loading={submitLoading}>
            {isEditing ? t('common.save') : t('common.create')}
          </Button>
        </div>
      }
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        className="pt-2"
        initialValues={{ rewardType: 'CREDIT', stackable: true }}
      >
        <Form.Item
          label={t('loyalty.bonus_name')}
          name="name"
          rules={[{ required: true, message: t('promotions.required') }]}
        >
          <Input placeholder={t('loyalty.bonus_name_placeholder')} />
        </Form.Item>

        <Form.Item label={t('loyalty.bonus_description')} name="description">
          <Input.TextArea rows={2} placeholder={t('loyalty.bonus_description_placeholder')} />
        </Form.Item>

        {/* ─── Targets / Objectives ─── */}
        <div className="mb-4">
          <div className="mb-2 text-sm font-semibold text-text-primary">
            {t('loyalty.bonus_targets')}
          </div>
          <div className="text-xs text-text-muted mb-3">{t('loyalty.bonus_targets_hint')}</div>

          <div className="flex items-center gap-3 mb-2">
            <Switch checked={enableSpend} onChange={setEnableSpend} size="small" />
            <span className="text-sm flex-1 text-text-primary">{t('loyalty.target_spend')}</span>
            {enableSpend && (
              <Form.Item name="targetSpend" noStyle rules={[{ required: true, message: '' }]}>
                <InputNumber min={0} suffix="FCFA" placeholder="50000" style={{ width: 180 }} />
              </Form.Item>
            )}
          </div>

          <div className="flex items-center gap-3 mb-2">
            <Switch checked={enableOrderCount} onChange={setEnableOrderCount} size="small" />
            <span className="text-sm flex-1 text-text-primary">
              {t('loyalty.target_order_count')}
            </span>
            {enableOrderCount && (
              <Form.Item name="targetOrderCount" noStyle rules={[{ required: true, message: '' }]}>
                <InputNumber min={1} placeholder="5" style={{ width: 180 }} />
              </Form.Item>
            )}
          </div>

          <div className="flex items-center gap-3 mb-2">
            <Switch
              checked={enableProducts}
              onChange={(val) => {
                setEnableProducts(val)
                if (!val) setTriggerProducts([])
              }}
              size="small"
            />
            <span className="text-sm flex-1 text-text-primary">{t('loyalty.target_products')}</span>
          </div>

          {enableProducts && (
            <div className="ml-10 mt-2">
              <Form.Item
                label={t('loyalty.target_products_count')}
                name="targetProductsCount"
                className="mb-2"
              >
                <InputNumber min={1} placeholder="3" style={{ width: 180 }} />
              </Form.Item>
              {triggerProducts.length === 0 ? (
                <div className="create-ticket-empty-section">
                  <ShoppingBag size={28} strokeWidth={1.5} className="text-text-muted opacity-50" />
                  <div className="text-sm font-medium text-text-primary">
                    {t('loyalty.no_trigger_products')}
                  </div>
                  <div className="text-xs text-text-muted">
                    {t('loyalty.trigger_products_hint')}
                  </div>
                  <Button
                    onClick={onOpenTriggerPicker}
                    icon={<Plus size={14} />}
                    className="mt-2"
                    size="small"
                  >
                    {t('loyalty.select_products')}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {triggerProducts.map((a) => (
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
                        onClick={() => removeTrigger(a.id)}
                      />
                    </div>
                  ))}
                  <Button
                    size="small"
                    className="self-start"
                    onClick={onOpenTriggerPicker}
                    icon={<Plus size={14} />}
                  >
                    {t('loyalty.edit_selection')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Reward ─── */}
        <Form.Item
          label={t('loyalty.reward_type')}
          name="rewardType"
          rules={[{ required: true, message: t('promotions.required') }]}
        >
          <Select options={REWARD_TYPE_OPTIONS} />
        </Form.Item>

        {rewardType === 'CREDIT' && (
          <Form.Item
            label={t('loyalty.reward_credit_value')}
            name="rewardCredit"
            rules={[{ required: true, message: t('promotions.required') }]}
          >
            <InputNumber min={0} suffix="FCFA" placeholder="5000" className="w-full" />
          </Form.Item>
        )}

        {rewardType === 'PERCENT' && (
          <Form.Item
            label={t('loyalty.reward_percent_value')}
            name="rewardPercent"
            rules={[{ required: true, message: t('promotions.required') }]}
          >
            <InputNumber min={1} max={100} suffix="%" placeholder="20" className="w-full" />
          </Form.Item>
        )}

        {rewardType === 'PRODUCTS' && (
          <div className="mb-4">
            {rewardProducts.length === 0 ? (
              <div className="create-ticket-empty-section">
                <ShoppingBag size={32} strokeWidth={1.5} className="text-text-muted opacity-50" />
                <div className="text-sm font-medium text-text-primary">
                  {t('loyalty.no_reward_products')}
                </div>
                <div className="text-xs text-text-muted">{t('loyalty.reward_products_hint')}</div>
                <Button onClick={onOpenRewardPicker} icon={<Plus size={16} />} className="mt-2">
                  {t('loyalty.select_products')}
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
                      onClick={() => removeReward(a.id)}
                    />
                  </div>
                ))}
                <Button
                  size="small"
                  className="self-start"
                  onClick={onOpenRewardPicker}
                  icon={<Plus size={14} />}
                >
                  {t('loyalty.edit_selection')}
                </Button>
              </div>
            )}
          </div>
        )}

        <Form.Item label={t('loyalty.bonus_period')} name="period">
          <RangePicker
            placeholder={[t('promotions.start_date'), t('promotions.end_date')]}
            format="DD/MM/YYYY"
            className="w-full"
          />
        </Form.Item>

        <Form.Item
          label={t('loyalty.bonus_stackable_label')}
          name="stackable"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  )
}
