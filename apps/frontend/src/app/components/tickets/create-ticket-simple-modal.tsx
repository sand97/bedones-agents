import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Input, Select, Form } from 'antd'

interface CreateTicketSimpleModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: {
    title: string
    description?: string
    priority: string
    contactName?: string
  }) => void
  loading?: boolean
}

export function CreateTicketSimpleModal({
  open,
  onClose,
  onSubmit,
  loading,
}: CreateTicketSimpleModalProps) {
  const { t } = useTranslation()
  const [form] = Form.useForm()

  useEffect(() => {
    if (open) form.resetFields()
  }, [open, form])

  const handleOk = () => {
    form.validateFields().then((values) => {
      onSubmit({
        title: values.title,
        description: values.description || undefined,
        priority: values.priority || 'MEDIUM',
        contactName: values.contactName || undefined,
      })
    })
  }

  return (
    <Modal
      title={t('tickets.create')}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      okText={t('common.create')}
      cancelText={t('common.cancel')}
      confirmLoading={loading}
    >
      <Form form={form} layout="vertical" initialValues={{ priority: 'MEDIUM' }} className="pt-2">
        <Form.Item
          label={t('tickets.col_title')}
          name="title"
          rules={[{ required: true, message: t('tickets.col_title') }]}
        >
          <Input placeholder={t('tickets.title_placeholder')} />
        </Form.Item>

        <Form.Item label={t('tickets.description')} name="description">
          <Input.TextArea
            autoSize={{ minRows: 2, maxRows: 6 }}
            placeholder={t('tickets.description_placeholder')}
          />
        </Form.Item>

        <Form.Item label={t('tickets.priority')} name="priority">
          <Select
            options={[
              { value: 'LOW', label: t('tickets.priority_low') },
              { value: 'MEDIUM', label: t('tickets.priority_medium') },
              { value: 'HIGH', label: t('tickets.priority_high') },
              { value: 'URGENT', label: t('tickets.priority_urgent') },
            ]}
          />
        </Form.Item>

        <Form.Item label={t('tickets.contact_name')} name="contactName">
          <Input placeholder={t('tickets.contact_name')} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
