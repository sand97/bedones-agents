import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { App, Button, Card, Form, Input, Modal, Select } from 'antd'
import { ShieldAlert, ShieldBan, Plus, Trash2 } from 'lucide-react'
import { updatePageSettings } from '@app/lib/api'
import type { PageSettingsResponse } from '@app/lib/api'

interface CommentsConfigModalProps {
  pageName: string
  accountId: string
  open: boolean
  onClose: () => void
  onSaved?: () => void
  /** Pre-loaded settings to avoid extra fetch */
  initialSettings?: PageSettingsResponse
}

interface FormValues {
  unwantedAction: string
  spamAction: string
  quickReplies: { question: string; answer: string }[]
  customInstructions: string
}

const moderationOptions = [
  {
    value: 'delete',
    label: (
      <span className="flex items-center gap-2">
        <Trash2 size={14} /> Supprimer le commentaire
      </span>
    ),
  },
  {
    value: 'hide',
    label: (
      <span className="flex items-center gap-2">
        <ShieldBan size={14} /> Masquer le commentaire
      </span>
    ),
  },
  {
    value: 'none',
    label: (
      <span className="flex items-center gap-2">
        <ShieldAlert size={14} /> Ne rien faire
      </span>
    ),
  },
]

function ConfigTitle({ pageName }: { pageName: string }) {
  return (
    <div>
      <div>Gestion de commentaires de la page {pageName}</div>
      <p className="mt-1 text-sm font-normal text-text-muted">
        Votre page a été ajoutée, configurez maintenant comment l&apos;IA doit répondre aux
        commentaires
      </p>
    </div>
  )
}

function ConfigForm({ form }: { form: ReturnType<typeof Form.useForm<FormValues>>[0] }): ReactNode {
  return (
    <Form form={form} layout="vertical" className="flex flex-col gap-5">
      {/* Commentaires indésirables */}
      <Card size="small">
        <div className="mb-3">
          <div className="text-sm font-medium">Commentaires indésirables</div>
          <div className="mt-1 text-xs text-text-muted">
            Si quelqu&apos;un insulte votre marque ou vos produits, ou tient des propos ouvertement
            racistes
          </div>
        </div>
        <Form.Item name="unwantedAction" noStyle>
          <Select
            className="w-full"
            placeholder="Choisissez une action"
            options={moderationOptions}
          />
        </Form.Item>
      </Card>

      {/* Spams */}
      <Card size="small">
        <div className="mb-3">
          <div className="text-sm font-medium">Spams</div>
          <div className="mt-1 text-xs text-text-muted">
            Si quelqu&apos;un partage des liens ou des numéros de téléphone (nous vous recommandons
            de masquer. Vous pourrez toujours voir le commentaire mais pas vos abonnés)
          </div>
        </div>
        <Form.Item name="spamAction" noStyle>
          <Select
            className="w-full"
            placeholder="Choisissez une action"
            options={moderationOptions}
          />
        </Form.Item>
      </Card>

      {/* Réponses rapides */}
      <div>
        <div className="mb-3">
          <div className="text-sm font-medium">Réponses rapides</div>
          <div className="mt-1 text-xs text-text-muted">
            Renseignez les questions que les utilisateurs posent le plus et les réponses, par ex
            l&apos;emplacement de votre boutique ou votre contact WhatsApp
          </div>
        </div>

        <Form.List name="quickReplies">
          {(fields, { add, remove }) => (
            <div className="flex flex-col gap-3">
              {fields.map((field) => (
                <div key={field.key} className="comments-config-faq-row">
                  <Form.Item name={[field.name, 'question']} noStyle>
                    <Input placeholder="Question" className="comments-config-faq-question" />
                  </Form.Item>
                  <Form.Item name={[field.name, 'answer']} noStyle>
                    <Input.TextArea
                      placeholder="Réponse"
                      autoSize={{ minRows: 2, maxRows: 4 }}
                      className="comments-config-faq-answer"
                    />
                  </Form.Item>
                  <Button
                    type="text"
                    danger
                    className="comments-config-faq-delete-btn"
                    onClick={() => remove(field.name)}
                    icon={<Trash2 size={14} />}
                  >
                    Supprimer
                  </Button>
                </div>
              ))}
              <Button
                type="dashed"
                onClick={() => add({ question: '', answer: '' })}
                icon={<Plus size={14} />}
                block
              >
                Ajouter une réponse
              </Button>
            </div>
          )}
        </Form.List>
      </div>

      {/* Instructions personnalisées */}
      <Form.Item name="customInstructions" label="Instructions personnalisées (optionnel)">
        <Input.TextArea
          autoSize={{ minRows: 3, maxRows: 6 }}
          placeholder="Vous pouvez par ex décrire le ton des réponses : sérieux, drôle, jovial… pour personnaliser le style des réponses"
        />
      </Form.Item>
    </Form>
  )
}

export function CommentsConfigModal({
  pageName,
  accountId,
  open,
  onClose,
  onSaved,
  initialSettings,
}: CommentsConfigModalProps) {
  const [form] = Form.useForm<FormValues>()
  const [saving, setSaving] = useState(false)
  const { message: messageApi } = App.useApp()

  // Load existing settings when modal opens
  useEffect(() => {
    if (!open) return

    // If we have pre-loaded settings that were explicitly configured, populate the form
    if (initialSettings?.isConfigured) {
      form.setFieldsValue({
        unwantedAction: initialSettings.undesiredCommentsAction,
        spamAction: initialSettings.spamAction,
        quickReplies: initialSettings.faqRules?.length
          ? initialSettings.faqRules.map((r) => ({ question: r.question, answer: r.answer }))
          : [],
        customInstructions: initialSettings.customInstructions || '',
      })
      return
    }

    // If initialSettings exist but not configured, or no settings at all → empty form
    if (initialSettings || initialSettings === undefined) {
      form.resetFields()
      return
    }
  }, [open, initialSettings, form])

  const handleSave = async () => {
    const values = form.getFieldsValue()
    setSaving(true)

    try {
      const faqRules = (values.quickReplies || []).filter(
        (r) => r.question.trim() && r.answer.trim(),
      )

      await updatePageSettings(accountId, {
        undesiredCommentsAction: values.unwantedAction,
        spamAction: values.spamAction,
        customInstructions: values.customInstructions || undefined,
        faqRules: faqRules.length > 0 ? faqRules : undefined,
      })

      messageApi.success('Configuration sauvegardée')
      onSaved?.()
      onClose()
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      styles={{
        body: { maxHeight: '65vh', overflowY: 'auto' },
      }}
      title={<ConfigTitle pageName={pageName} />}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Annuler
        </Button>,
        <Button key="save" type="primary" onClick={handleSave} loading={saving}>
          Sauvegarder
        </Button>,
      ]}
      width={520}
      destroyOnClose
    >
      <ConfigForm form={form} />
    </Modal>
  )
}
