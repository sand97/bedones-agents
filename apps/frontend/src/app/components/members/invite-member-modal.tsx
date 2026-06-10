import { Button, Form, Modal, Select, Input } from 'antd'
import { useEffect } from 'react'
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
  submitLoading?: boolean
}

export function InviteMemberModal({
  open,
  onClose,
  onSubmit,
  submitLoading,
}: InviteMemberModalProps) {
  const { t } = useTranslation()
  const [form] = Form.useForm()

  // Réinitialise le formulaire une fois la modale fermée (fermeture pilotée par le parent
  // après succès de la création).
  useEffect(() => {
    if (!open) form.resetFields()
  }, [open, form])

  const handleCancel = () => {
    if (submitLoading) return
    onClose()
  }

  const handleOk = () => {
    form.validateFields().then((values) => {
      onSubmit?.(values)
    })
  }

  return (
    <Modal
      title={t('members.invite')}
      open={open}
      onCancel={handleCancel}
      maskClosable={!submitLoading}
      closable={!submitLoading}
      footer={[
        <Button key="cancel" onClick={handleCancel} disabled={submitLoading}>
          {t('common.cancel')}
        </Button>,
        <Button key="submit" type="primary" loading={submitLoading} onClick={handleOk}>
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
