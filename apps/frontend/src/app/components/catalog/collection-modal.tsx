import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Form, Input } from 'antd'
import type { Collection } from '@app/lib/api/agent-api'

interface CollectionModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (values: { name: string }) => void
  collection?: Collection
  loading?: boolean
}

export function CollectionModal({
  open,
  onClose,
  onSubmit,
  collection,
  loading,
}: CollectionModalProps) {
  const { t } = useTranslation()
  const [form] = Form.useForm()

  useEffect(() => {
    if (open) {
      if (collection) {
        form.setFieldsValue({ name: collection.name })
      } else {
        form.resetFields()
      }
    }
  }, [open, collection, form])

  const handleOk = async () => {
    const values = await form.validateFields()
    onSubmit(values)
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={loading}
      title={collection ? t('catalog.edit_collection') : t('catalog.add_collection')}
      okText={collection ? t('common.save') : t('common.create')}
      cancelText={t('common.cancel')}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label={t('catalog.collection_name')}
          rules={[{ required: true, message: t('catalog.collection_name') }]}
        >
          <Input />
        </Form.Item>
      </Form>
    </Modal>
  )
}
