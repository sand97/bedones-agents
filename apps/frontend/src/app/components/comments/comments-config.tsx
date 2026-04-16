import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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

function useModerationOptions() {
  const { t } = useTranslation()
  return [
    {
      value: 'delete',
      label: (
        <span className="flex items-center gap-2">
          <Trash2 size={14} /> {t('comments.delete_comment')}
        </span>
      ),
    },
    {
      value: 'hide',
      label: (
        <span className="flex items-center gap-2">
          <ShieldBan size={14} /> {t('comments.hide_comment')}
        </span>
      ),
    },
    {
      value: 'none',
      label: (
        <span className="flex items-center gap-2">
          <ShieldAlert size={14} /> {t('comments.do_nothing')}
        </span>
      ),
    },
  ]
}

function ConfigTitle({ pageName }: { pageName: string }) {
  const { t } = useTranslation()
  return (
    <div>
      <div>{t('comments_config.page_title', { pageName })}</div>
      <p className="mt-1 text-sm font-normal text-text-muted">
        {t('comments_config.page_description')}
      </p>
    </div>
  )
}

function ConfigForm({ form }: { form: ReturnType<typeof Form.useForm<FormValues>>[0] }): ReactNode {
  const { t } = useTranslation()
  const moderationOptions = useModerationOptions()
  return (
    <Form form={form} layout="vertical" className="flex flex-col gap-5">
      {/* Commentaires indésirables */}
      <Card size="small">
        <div className="mb-3">
          <div className="text-sm font-medium">{t('comments_config.unwanted_title')}</div>
          <div className="mt-1 text-xs text-text-muted">
            {t('comments_config.unwanted_description')}
          </div>
        </div>
        <Form.Item name="unwantedAction" noStyle>
          <Select
            className="w-full"
            placeholder={t('comments_config.choose_action')}
            options={moderationOptions}
          />
        </Form.Item>
      </Card>

      {/* Spams */}
      <Card size="small">
        <div className="mb-3">
          <div className="text-sm font-medium">{t('comments_config.spam_title')}</div>
          <div className="mt-1 text-xs text-text-muted">
            {t('comments_config.spam_description')}
          </div>
        </div>
        <Form.Item name="spamAction" noStyle>
          <Select
            className="w-full"
            placeholder={t('comments_config.choose_action')}
            options={moderationOptions}
          />
        </Form.Item>
      </Card>

      {/* Réponses rapides */}
      <div>
        <div className="mb-3">
          <div className="text-sm font-medium">{t('comments_config.quick_replies_title')}</div>
          <div className="mt-1 text-xs text-text-muted">
            {t('comments_config.quick_replies_description')}
          </div>
        </div>

        <Form.List name="quickReplies">
          {(fields, { add, remove }) => (
            <div className="flex flex-col gap-3">
              {fields.map((field) => (
                <div key={field.key} className="comments-config-faq-row">
                  <Form.Item name={[field.name, 'question']} noStyle>
                    <Input
                      placeholder={t('comments_config.faq_question')}
                      className="comments-config-faq-question"
                    />
                  </Form.Item>
                  <Form.Item name={[field.name, 'answer']} noStyle>
                    <Input.TextArea
                      placeholder={t('comments_config.faq_answer')}
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
                    {t('common.delete')}
                  </Button>
                </div>
              ))}
              <Button
                type="dashed"
                onClick={() => add({ question: '', answer: '' })}
                icon={<Plus size={14} />}
                block
              >
                {t('comments_config.add_reply')}
              </Button>
            </div>
          )}
        </Form.List>
      </div>

      {/* Instructions personnalisées */}
      <Form.Item name="customInstructions" label={t('comments_config.custom_instructions_label')}>
        <Input.TextArea
          autoSize={{ minRows: 3, maxRows: 6 }}
          placeholder={t('comments_config.custom_instructions_tone_placeholder')}
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
  const { t } = useTranslation()

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
        undesiredCommentsAction: values.unwantedAction as 'hide' | 'delete' | 'none',
        spamAction: values.spamAction as 'hide' | 'delete' | 'none',
        customInstructions: values.customInstructions || undefined,
        faqRules: faqRules.length > 0 ? faqRules : undefined,
      })

      messageApi.success(t('comments_config.saved'))
      onSaved?.()
      onClose()
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : t('comments_config.save_error'))
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
          {t('common.cancel')}
        </Button>,
        <Button key="save" type="primary" onClick={handleSave} loading={saving}>
          {t('common.save')}
        </Button>,
      ]}
      width={520}
      destroyOnHidden
    >
      <ConfigForm form={form} />
    </Modal>
  )
}
