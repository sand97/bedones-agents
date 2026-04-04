import { Button, Form, Modal, Select, Input } from 'antd'
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
      title="Inviter un membre"
      open={open}
      onCancel={handleCancel}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          Annuler
        </Button>,
        <Button key="submit" type="primary" onClick={handleOk}>
          Créer l&apos;invitation
        </Button>,
      ]}
      width={480}
    >
      <Form form={form} layout="vertical" className="pt-2">
        <div className="flex gap-3">
          <Form.Item
            label="Prénom"
            name="firstName"
            rules={[{ required: true, message: 'Le prénom est requis' }]}
            className="flex-1"
          >
            <Input placeholder="Ex: Aminata" />
          </Form.Item>
          <Form.Item
            label="Nom"
            name="lastName"
            rules={[{ required: true, message: 'Le nom est requis' }]}
            className="flex-1"
          >
            <Input placeholder="Ex: Diallo" />
          </Form.Item>
        </div>
        <Form.Item
          label="Numéro WhatsApp"
          name="phone"
          validateTrigger="onSubmit"
          rules={[
            { required: true, message: 'Le numéro WhatsApp est requis' },
            {
              validator: (_, value) => {
                if (!value) return Promise.resolve()
                // Remove country code prefix (+1 to +4 digits) and check remaining number length
                const numberPart = value.replace(/^\+\d{1,4}/, '')
                if (numberPart.length >= 6) {
                  return Promise.resolve()
                }
                return Promise.reject(new Error('Numéro invalide'))
              },
            },
          ]}
        >
          <CountryPhoneInput />
        </Form.Item>
        <Form.Item
          label="Rôle"
          name="role"
          rules={[{ required: true, message: 'Le rôle est requis' }]}
        >
          <Select placeholder="Sélectionner un rôle">
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
