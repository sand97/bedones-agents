import { Button, Form, Modal, Select, Input } from 'antd'
import { useTranslation } from 'react-i18next'
import { ALL_ROLES, MEMBER_ROLE_CONFIG, type MemberRole } from './mock-data'
import { CountryPhoneInput } from '@app/components/shared/country-phone-input'

interface InviteMemberModalProps {
  open: boolean
  onClose: () => void
  onSubmit?: (values: {
    firstName: string
    lastName: string
    phone: string
    role: MemberRole
  }) => void
}

export function InviteMemberModal({ open, onClose, onSubmit }: InviteMemberModalProps) {
  const { t } = useTranslation()
  const [form] = Form.useForm()

  const handleCancel = () => {
    form.resetFields()
    onClose()
  }

  const handleOk = () => {
    form.validateFields().then((values) => {
      onSubmit?.(values)
      form.resetFields()
      onClose()
    })
  }

  return (
    <Modal
      title={t('members.invite')}
      open={open}
      onCancel={handleCancel}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          {t('common.cancel')}
        </Button>,
        <Button key="submit" type="primary" onClick={handleOk}>
          {t('members.create_invitation')}
        </Button>,
      ]}
      width={480}
    >
      <Form form={form} layout="vertical" className="pt-2">
        <div className="flex gap-3">
          <Form.Item
            label={t('members.first_name')}
            name="firstName"
            rules={[{ required: true, message: t('members.first_name_required') }]}
            className="flex-1"
          >
            <Input placeholder="Ex: Aminata" />
          </Form.Item>
          <Form.Item
            label={t('members.last_name')}
            name="lastName"
            rules={[{ required: true, message: t('members.last_name_required') }]}
            className="flex-1"
          >
            <Input placeholder="Ex: Diallo" />
          </Form.Item>
        </div>
        <Form.Item
          label={t('members.whatsapp_number')}
          name="phone"
          validateTrigger="onSubmit"
          rules={[
            { required: true, message: t('members.whatsapp_required') },
            {
              validator: (_, value) => {
                if (!value) return Promise.resolve()
                // Remove country code prefix (+1 to +4 digits) and check remaining number length
                const numberPart = value.replace(/^\+\d{1,4}/, '')
                if (numberPart.length >= 6) {
                  return Promise.resolve()
                }
                return Promise.reject(new Error(t('members.invalid_number')))
              },
            },
          ]}
        >
          <CountryPhoneInput />
        </Form.Item>
        <Form.Item
          label={t('members.role')}
          name="role"
          rules={[{ required: true, message: t('members.role_required') }]}
        >
          <Select placeholder={t('members.select_role')}>
            {ALL_ROLES.filter((r) => r !== 'owner').map((role) => (
              <Select.Option key={role} value={role}>
                {MEMBER_ROLE_CONFIG[role].label}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  )
}
