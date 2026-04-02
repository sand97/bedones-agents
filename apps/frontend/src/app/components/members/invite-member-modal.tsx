import { Button, Form, Input, Modal, Select } from 'antd'
import { ALL_ROLES, MEMBER_ROLE_CONFIG } from './mock-data'

interface InviteMemberModalProps {
  open: boolean
  onClose: () => void
}

export function InviteMemberModal({ open, onClose }: InviteMemberModalProps) {
  const [form] = Form.useForm()

  const handleSubmit = () => {
    form.validateFields().then(() => {
      form.resetFields()
      onClose()
    })
  }

  return (
    <Modal
      title="Inviter un membre"
      open={open}
      onCancel={() => {
        form.resetFields()
        onClose()
      }}
      footer={null}
      width={480}
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit} className="pt-2">
        <Form.Item
          label="Nom complet"
          name="name"
          rules={[{ required: true, message: 'Le nom est requis' }]}
        >
          <Input placeholder="Ex: Aminata Diallo" />
        </Form.Item>
        <Form.Item
          label="Email"
          name="email"
          rules={[
            { required: true, message: "L'email est requis" },
            { type: 'email', message: 'Email invalide' },
          ]}
        >
          <Input placeholder="Ex: aminata@example.com" />
        </Form.Item>
        <Form.Item
          label="Rôle"
          name="role"
          rules={[{ required: true, message: 'Le rôle est requis' }]}
        >
          <Select placeholder="Sélectionner un rôle">
            {ALL_ROLES.map((role) => (
              <Select.Option key={role} value={role}>
                {MEMBER_ROLE_CONFIG[role].label}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            onClick={() => {
              form.resetFields()
              onClose()
            }}
          >
            Annuler
          </Button>
          <Button type="primary" htmlType="submit">
            Envoyer l&apos;invitation
          </Button>
        </div>
      </Form>
    </Modal>
  )
}
