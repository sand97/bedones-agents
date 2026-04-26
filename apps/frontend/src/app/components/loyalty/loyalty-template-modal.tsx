import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Form, Input, Modal, Select, Tag } from 'antd'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import { SocialSetup } from '@app/components/social/social-setup'
import { WhatsAppIcon } from '@app/components/icons/social-icons'
import { loyaltyApi, type LoyaltyTemplate } from '@app/lib/api/loyalty-api'

const AVAILABLE_VARIABLES = [
  'customer_name',
  'amount',
  'product_name',
  'order_count',
  'orders_left',
  'reward_value',
] as const

interface Props {
  open: boolean
  onClose: () => void
  socialAccountId: string
}

export function LoyaltyTemplateModal({ open, onClose, socialAccountId }: Props) {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()
  const [editing, setEditing] = useState<LoyaltyTemplate | null>(null)
  const [creating, setCreating] = useState(false)

  const queryKey = useMemo(() => ['loyalty-templates', socialAccountId], [socialAccountId])

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => loyaltyApi.listTemplates(socialAccountId),
    enabled: open && !!socialAccountId,
  })

  const syncMutation = useMutation({
    mutationFn: () => loyaltyApi.syncTemplates(socialAccountId),
    onSuccess: (templates) => {
      queryClient.setQueryData<LoyaltyTemplate[]>(queryKey, templates)
      message.success(t('loyalty.templates_synced'))
    },
  })

  const createMutation = useMutation({
    mutationFn: (payload: {
      name: string
      body: string
      variables: string[]
      language: string
      category: string
    }) => loyaltyApi.createTemplate({ socialAccountId, ...payload }),
    onSuccess: (created) => {
      queryClient.setQueryData<LoyaltyTemplate[]>(queryKey, (prev) => [created, ...(prev ?? [])])
      handleResetEditor()
      message.success(t('loyalty.template_created'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string
      payload: { name: string; body: string; variables: string[] }
    }) => loyaltyApi.updateTemplate(id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData<LoyaltyTemplate[]>(queryKey, (prev) =>
        (prev ?? []).map((tmpl) => (tmpl.id === updated.id ? updated : tmpl)),
      )
      handleResetEditor()
      message.success(t('loyalty.template_updated'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await loyaltyApi.removeTemplate(id)
      return id
    },
    onSuccess: (id) => {
      queryClient.setQueryData<LoyaltyTemplate[]>(queryKey, (prev) =>
        (prev ?? []).filter((tmpl) => tmpl.id !== id),
      )
      if (editing?.id === id) handleResetEditor()
      message.success(t('common.delete'))
    },
  })

  useEffect(() => {
    if (!open) {
      handleResetEditor()
      return
    }
    if (editing) {
      form.setFieldsValue({
        name: editing.name,
        language: editing.language,
        category: editing.category,
        body: editing.body,
        variables: editing.variables,
      })
    }
  }, [open, editing, form])

  const handleResetEditor = () => {
    setEditing(null)
    setCreating(false)
    form.resetFields()
  }

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      const payload = {
        name: values.name,
        body: values.body,
        variables: values.variables ?? [],
        language: values.language ?? 'fr',
        category: values.category ?? 'MARKETING',
      }
      if (editing) updateMutation.mutate({ id: editing.id, payload })
      else createMutation.mutate(payload)
    })
  }

  const insertVariable = (variable: string) => {
    const current = form.getFieldValue('body') as string | undefined
    const next = `${current ?? ''}{{${variable}}}`
    form.setFieldValue('body', next)
  }

  const templates = data ?? []
  const showEmpty = !isLoading && templates.length === 0 && !creating && !editing

  return (
    <Modal
      title={t('loyalty.templates_title')}
      open={open}
      onCancel={onClose}
      width={760}
      styles={{ body: { padding: 0 } }}
      footer={null}
    >
      {showEmpty ? (
        <SocialSetup
          icon={<WhatsAppIcon width={40} height={40} />}
          color="var(--color-brand-whatsapp)"
          title={t('loyalty.templates_empty_title')}
          description={t('loyalty.templates_empty_desc')}
          buttonLabel={t('loyalty.template_create')}
          buttonIcon={<Plus size={18} />}
          onAction={() => setCreating(true)}
          secondaryButtonLabel={t('loyalty.templates_sync_meta')}
          secondaryButtonIcon={<RefreshCw size={16} />}
          secondaryLoading={syncMutation.isPending}
          onSecondaryAction={() => syncMutation.mutate()}
        />
      ) : (
        <div className="flex" style={{ minHeight: 480 }}>
          {/* Left: editor */}
          <div className="flex-1 border-r border-border-subtle p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="m-0 text-sm font-semibold text-text-primary">
                {editing ? t('loyalty.template_edit') : t('loyalty.template_create')}
              </h3>
              <Button
                size="small"
                icon={<RefreshCw size={14} />}
                onClick={() => syncMutation.mutate()}
                loading={syncMutation.isPending}
              >
                {t('loyalty.templates_sync')}
              </Button>
            </div>

            <Form
              form={form}
              layout="vertical"
              initialValues={{ language: 'fr', category: 'MARKETING' }}
              onFinish={handleSubmit}
            >
              <Form.Item
                label={t('loyalty.template_name')}
                name="name"
                rules={[{ required: true, message: t('promotions.required') }]}
              >
                <Input placeholder="welcome_loyalty_program" />
              </Form.Item>

              <div className="grid grid-cols-2 gap-3">
                <Form.Item label={t('loyalty.template_language')} name="language">
                  <Select
                    options={[
                      { value: 'fr', label: 'Français' },
                      { value: 'en', label: 'English' },
                    ]}
                  />
                </Form.Item>
                <Form.Item label={t('loyalty.template_category')} name="category">
                  <Select
                    options={[
                      { value: 'MARKETING', label: 'Marketing' },
                      { value: 'UTILITY', label: 'Utility' },
                      { value: 'AUTHENTICATION', label: 'Authentication' },
                    ]}
                  />
                </Form.Item>
              </div>

              <Form.Item
                label={t('loyalty.template_body')}
                name="body"
                rules={[{ required: true, message: t('promotions.required') }]}
              >
                <Input.TextArea rows={5} placeholder={t('loyalty.template_body_placeholder')} />
              </Form.Item>

              <Form.Item label={t('loyalty.template_variables')} name="variables">
                <Select
                  mode="multiple"
                  placeholder={t('loyalty.template_variables_placeholder')}
                  options={AVAILABLE_VARIABLES.map((v) => ({ value: v, label: `{{${v}}}` }))}
                />
              </Form.Item>

              <div className="mb-3 flex flex-wrap gap-1">
                {AVAILABLE_VARIABLES.map((v) => (
                  <Tag
                    key={v}
                    bordered={false}
                    color="processing"
                    className="cursor-pointer"
                    onClick={() => insertVariable(v)}
                  >
                    + {`{{${v}}}`}
                  </Tag>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2">
                {(editing || creating) && (
                  <Button onClick={handleResetEditor}>{t('common.cancel')}</Button>
                )}
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={createMutation.isPending || updateMutation.isPending}
                >
                  {editing ? t('common.save') : t('common.create')}
                </Button>
              </div>
            </Form>
          </div>

          {/* Right: template list */}
          <div className="w-72 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="m-0 text-sm font-semibold text-text-primary">
                {t('loyalty.templates_list')}
              </h3>
              <Button
                size="small"
                type="text"
                icon={<Plus size={14} />}
                onClick={() => {
                  handleResetEditor()
                  setCreating(true)
                }}
              />
            </div>
            <div className="flex flex-col gap-2" style={{ maxHeight: 420, overflowY: 'auto' }}>
              {templates.length === 0 ? (
                <div className="text-xs text-text-muted">{t('loyalty.no_templates')}</div>
              ) : (
                templates.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    className={`flex items-start gap-2 rounded-md border border-border-subtle p-2 ${
                      editing?.id === tmpl.id ? 'bg-bg-muted' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setCreating(false)
                        setEditing(tmpl)
                      }}
                      className="min-w-0 flex-1 cursor-pointer text-left"
                    >
                      <div className="truncate text-sm font-medium text-text-primary">
                        {tmpl.name}
                      </div>
                      <div className="truncate text-xs text-text-muted">{tmpl.body}</div>
                      <div className="mt-1 flex items-center gap-1">
                        <Tag bordered={false} color="default">
                          {tmpl.language}
                        </Tag>
                        <Tag bordered={false}>{tmpl.status}</Tag>
                      </div>
                    </button>
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<Trash2 size={12} />}
                      onClick={() => deleteMutation.mutate(tmpl.id)}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
