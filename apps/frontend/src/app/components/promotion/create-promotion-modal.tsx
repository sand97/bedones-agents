import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Input, InputNumber, Select, DatePicker, Space } from 'antd'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

interface CreatePromotionModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: {
    name: string
    description?: string
    discountType: string
    discountValue: number
    code?: string
    startDate?: string
    endDate?: string
  }) => void
  loading?: boolean
}

export function CreatePromotionModal({
  open,
  onClose,
  onSubmit,
  loading,
}: CreatePromotionModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [discountType, setDiscountType] = useState('PERCENTAGE')
  const [discountValue, setDiscountValue] = useState<number>(0)
  const [code, setCode] = useState('')
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)

  useEffect(() => {
    if (open) {
      setName('')
      setDiscountType('PERCENTAGE')
      setDiscountValue(0)
      setCode('')
      setDateRange(null)
    }
  }, [open])

  const handleOk = () => {
    onSubmit({
      name,
      discountType,
      discountValue,
      code: code || undefined,
      startDate: dateRange?.[0]?.toISOString(),
      endDate: dateRange?.[1]?.toISOString(),
    })
  }

  return (
    <Modal
      title={t('promotions.create')}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      okText={t('common.create')}
      cancelText={t('common.cancel')}
      okButtonProps={{ disabled: !name.trim() || discountValue <= 0, loading }}
    >
      <div className="flex flex-col gap-3 pt-2">
        <div>
          <label className="mb-1 block text-xs text-text-muted">{t('promotions.name')}</label>
          <Input
            placeholder={t('promotions.name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-text-muted">{t('promotions.col_code')}</label>
          <Input
            placeholder="PROMO2026"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-text-muted">{t('promotions.discount')}</label>
          <Space.Compact block>
            <Select
              value={discountType}
              onChange={setDiscountType}
              options={[
                { value: 'PERCENTAGE', label: t('promotions.type_percentage') },
                { value: 'FIXED_AMOUNT', label: t('promotions.type_fixed_amount') },
              ]}
              style={{ width: '50%' }}
            />
            <InputNumber
              style={{ width: '50%' }}
              min={0}
              max={discountType === 'PERCENTAGE' ? 100 : undefined}
              value={discountValue}
              onChange={(v) => setDiscountValue(v ?? 0)}
              suffix={discountType === 'PERCENTAGE' ? '%' : 'XAF'}
            />
          </Space.Compact>
        </div>

        <div>
          <label className="mb-1 block text-xs text-text-muted">{t('promotions.period')}</label>
          <RangePicker
            className="w-full"
            placeholder={[t('tickets.date_start'), t('tickets.date_end')]}
            value={dateRange}
            onChange={(dates) =>
              setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)
            }
            format="DD/MM/YYYY"
          />
        </div>
      </div>
    </Modal>
  )
}
