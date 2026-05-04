import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Form, Input, InputNumber, Button } from 'antd'
import type { LoyaltyContact } from '@app/lib/api/loyalty-api'

export interface LoyaltyContactSubmitData {
  name: string
  phone: string
  totalSpent: number
  orderCount: number
}

interface LoyaltyContactModalProps {
  open: boolean
  onClose: () => void
  editingContact?: LoyaltyContact | null
  onSubmit: (data: LoyaltyContactSubmitData) => void
  submitLoading?: boolean
}

export function LoyaltyContactModal({
  open,
  onClose,
  editingContact,
  onSubmit,
  submitLoading,
}: LoyaltyContactModalProps) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const isEditing = !!editingContact

  useEffect(() => {
    if (open && editingContact) {
      form.setFieldsValue({
        name: editingContact.name,
        phone: editingContact.phone,
        totalSpent: editingContact.totalSpent,
        orderCount: editingContact.orderCount,
      })
    } else if (open) {
      form.resetFields()
    }
  }, [open, editingContact, form])

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      onSubmit({
        name: values.name,
        phone: values.phone,
        totalSpent: values.totalSpent ?? 0,
        orderCount: values.orderCount ?? 0,
      })
    })
  }

  const handleClose = () => {
    form.resetFields()
    onClose()
  }

  return (
    <Modal
      title={isEditing ? t('loyalty.contact_edit_title') : t('loyalty.contact_create_title')}
      open={open}
      onCancel={handleClose}
      width={520}
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
        initialValues={{ totalSpent: 0, orderCount: 0 }}
      >
        <Form.Item
          label={t('loyalty.contact_name')}
          name="name"
          rules={[{ required: true, message: t('promotions.required') }]}
        >
          <Input placeholder={t('loyalty.contact_name_placeholder')} />
        </Form.Item>
        <Form.Item
          label={t('loyalty.contact_phone')}
          name="phone"
          rules={[{ required: true, message: t('promotions.required') }]}
        >
          <Input placeholder="+237 6XX XXX XXX" />
        </Form.Item>
        <Form.Item label={t('loyalty.contact_total_spent')} name="totalSpent">
          <InputNumber min={0} suffix="FCFA" className="w-full" />
        </Form.Item>
        <Form.Item label={t('loyalty.contact_order_count')} name="orderCount">
          <InputNumber min={0} className="w-full" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
