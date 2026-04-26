import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Button, DatePicker, Form, Input, InputNumber, Modal, Select, TimePicker } from 'antd'
import dayjs from 'dayjs'
import {
  loyaltyApi,
  type LoyaltyBonus,
  type LoyaltyCampaign,
  type LoyaltyCampaignFrequency,
} from '@app/lib/api/loyalty-api'

export interface LoyaltyCampaignSubmitData {
  name: string
  bonusId: string
  metaTemplateId?: string
  metaTemplateName?: string
  metaTemplateLanguage?: string
  frequency: LoyaltyCampaignFrequency
  /** HH:mm — local hour at which the campaign sends each tick. */
  sendTime?: string
  segmentCriteria: Record<string, unknown>
  startDate?: string
  endDate?: string
}

interface Props {
  open: boolean
  onClose: () => void
  socialAccountId: string
  editingCampaign?: LoyaltyCampaign | null
  onSubmit: (data: LoyaltyCampaignSubmitData) => void
  submitLoading?: boolean
}

export function LoyaltyCampaignModal({
  open,
  onClose,
  socialAccountId,
  editingCampaign,
  onSubmit,
  submitLoading,
}: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm()

  const bonusesQuery = useQuery({
    queryKey: ['loyalty-bonuses', socialAccountId],
    queryFn: () => loyaltyApi.listBonuses(socialAccountId),
    enabled: open && !!socialAccountId,
  })

  // Templates live on Meta — staleTime: Infinity so we don't refetch repeatedly
  // while the modal stays open or reopens.
  const templatesQuery = useQuery({
    queryKey: ['loyalty-templates', socialAccountId],
    queryFn: () => loyaltyApi.listTemplates(socialAccountId),
    enabled: open && !!socialAccountId,
    staleTime: Infinity,
  })

  const bonuses = useMemo(() => bonusesQuery.data ?? [], [bonusesQuery.data])
  const templates = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data])

  const selectedBonusId = Form.useWatch('bonusId', form)
  const selectedBonus: LoyaltyBonus | undefined = bonuses.find((b) => b.id === selectedBonusId)

  const FREQUENCY_OPTIONS = [
    { value: 'ONCE', label: t('loyalty.frequency_once') },
    { value: 'DAILY', label: t('loyalty.frequency_daily') },
    { value: 'WEEKLY', label: t('loyalty.frequency_weekly') },
    { value: 'MONTHLY', label: t('loyalty.frequency_monthly') },
  ]

  useEffect(() => {
    if (!open) return
    if (editingCampaign) {
      const criteria = (editingCampaign.segmentCriteria as Record<string, unknown> | null) ?? {}
      const persistedSendTime = (criteria.sendTime as string | undefined) ?? undefined
      form.setFieldsValue({
        name: editingCampaign.name,
        bonusId: editingCampaign.bonusId,
        metaTemplateId: editingCampaign.metaTemplateId ?? undefined,
        frequency: editingCampaign.frequency,
        sendTime: persistedSendTime ? dayjs(persistedSendTime, 'HH:mm') : undefined,
        endDate: editingCampaign.endDate ? dayjs(editingCampaign.endDate) : undefined,
        minSpend: criteria.minSpend,
        minOrders: criteria.minOrders,
        minProducts: criteria.minProducts,
      })
    } else {
      form.resetFields()
    }
  }, [open, editingCampaign, form])

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      const segmentCriteria: Record<string, unknown> = {}
      if (values.minSpend !== undefined && values.minSpend !== null)
        segmentCriteria.minSpend = values.minSpend
      if (values.minOrders !== undefined && values.minOrders !== null)
        segmentCriteria.minOrders = values.minOrders
      if (values.minProducts !== undefined && values.minProducts !== null)
        segmentCriteria.minProducts = values.minProducts

      const tmpl = templates.find((x) => x.id === values.metaTemplateId)
      const sendTime: string | undefined = values.sendTime
        ? (values.sendTime as dayjs.Dayjs).format('HH:mm')
        : undefined
      if (sendTime) segmentCriteria.sendTime = sendTime

      onSubmit({
        name: values.name,
        bonusId: values.bonusId,
        metaTemplateId: tmpl?.id,
        metaTemplateName: tmpl?.name,
        metaTemplateLanguage: tmpl?.language,
        frequency: values.frequency as LoyaltyCampaignFrequency,
        sendTime,
        segmentCriteria,
        startDate: new Date().toISOString(),
        endDate: values.endDate ? values.endDate.toISOString() : undefined,
      })
    })
  }

  const isEditing = !!editingCampaign

  return (
    <Modal
      title={isEditing ? t('loyalty.campaign_edit_title') : t('loyalty.campaign_create_title')}
      open={open}
      onCancel={onClose}
      width={560}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
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
        initialValues={{ frequency: 'ONCE' }}
        className="pt-2"
      >
        <Form.Item
          label={t('loyalty.campaign_name')}
          name="name"
          rules={[{ required: true, message: t('promotions.required') }]}
        >
          <Input placeholder={t('loyalty.campaign_name_placeholder')} />
        </Form.Item>

        <Form.Item
          label={t('loyalty.campaign_bonus')}
          name="bonusId"
          rules={[{ required: true, message: t('promotions.required') }]}
        >
          <Select
            placeholder={t('loyalty.campaign_select_bonus')}
            options={bonuses.map((b) => ({ value: b.id, label: b.name }))}
            loading={bonusesQuery.isLoading}
          />
        </Form.Item>

        {selectedBonus && (
          <div className="mb-4">
            <div className="mb-2 text-sm font-medium text-text-primary">
              {t('loyalty.segment_criteria')}
            </div>
            <div className="text-xs text-text-muted mb-3">{t('loyalty.segment_criteria_hint')}</div>

            {selectedBonus.targetSpend !== null && (
              <Form.Item label={t('loyalty.criteria_min_spend')} name="minSpend">
                <InputNumber min={0} suffix="FCFA" className="w-full" />
              </Form.Item>
            )}
            {selectedBonus.targetOrderCount !== null && (
              <Form.Item label={t('loyalty.criteria_min_orders')} name="minOrders">
                <InputNumber min={0} className="w-full" />
              </Form.Item>
            )}
            {(selectedBonus.targetProductsCount !== null ||
              selectedBonus.triggerProducts.length > 0) && (
              <Form.Item label={t('loyalty.criteria_min_products')} name="minProducts">
                <InputNumber min={0} className="w-full" />
              </Form.Item>
            )}
          </div>
        )}

        <Form.Item
          label={t('loyalty.campaign_template')}
          name="metaTemplateId"
          rules={[{ required: true, message: t('promotions.required') }]}
        >
          <Select
            placeholder={t('loyalty.campaign_select_template')}
            options={templates.map((tmpl) => ({
              value: tmpl.id,
              label: `${tmpl.name} · ${tmpl.language}`,
            }))}
            loading={templatesQuery.isLoading}
          />
        </Form.Item>

        <Form.Item label={t('loyalty.campaign_frequency')} required className="mb-4">
          <div className="loyalty-frequency-row">
            <Form.Item
              name="frequency"
              noStyle
              rules={[{ required: true, message: t('promotions.required') }]}
            >
              <Select options={FREQUENCY_OPTIONS} className="loyalty-frequency-select" />
            </Form.Item>
            <Form.Item
              name="sendTime"
              noStyle
              rules={[{ required: true, message: t('promotions.required') }]}
            >
              <TimePicker
                format="HH:mm"
                minuteStep={5}
                placeholder={t('loyalty.campaign_send_time_placeholder')}
                className="loyalty-frequency-time"
                allowClear={false}
              />
            </Form.Item>
          </div>
        </Form.Item>

        <Form.Item label={t('loyalty.campaign_end_date')} name="endDate">
          <DatePicker className="w-full" format="DD/MM/YYYY" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
