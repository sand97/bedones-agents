import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { App, Button, Form, Input, Modal, Select, Tag, Tooltip } from 'antd'
import { loyaltyApi, type LoyaltyTemplate } from '@app/lib/api/loyalty-api'
import {
  TEMPLATE_VARIABLES,
  bodyToVariableKeys,
  findUnknownTokens,
  formatTemplateName,
  tokensToMetaPlaceholders,
} from './loyalty-template-variables'

interface Props {
  open: boolean
  onClose: () => void
  socialAccountId: string
}

const CATEGORY_OPTIONS = [
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'UTILITY', label: 'Utility' },
]

const LANGUAGE_OPTIONS = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
]

/**
 * Create-only modal — templates are submitted to Meta and enter their review
 * queue. Meta does not support seamless edits, so we don't expose an edit flow.
 */
export function LoyaltyTemplateEditorModal({ open, onClose, socialAccountId }: Props) {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()

  const queryKey = ['loyalty-templates', socialAccountId]

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
      message.success(t('loyalty.template_created'))
      onClose()
    },
  })

  useEffect(() => {
    if (!open) form.resetFields()
  }, [open, form])

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      const tokenBody = values.body as string
      // Convert human tokens ([Nom du client]) to Meta named placeholders ({{customer_name}})
      // before pushing the template to Meta's API.
      const metaBody = tokensToMetaPlaceholders(tokenBody)
      createMutation.mutate({
        name: values.name,
        body: metaBody,
        variables: bodyToVariableKeys(tokenBody),
        language: values.language ?? 'fr',
        category: values.category ?? 'MARKETING',
      })
    })
  }

  const insertToken = (token: string) => {
    const current = (form.getFieldValue('body') as string | undefined) ?? ''
    const sep = current.length > 0 && !/\s$/.test(current) ? ' ' : ''
    const next = `${current}${sep}[${token}]`
    form.setFieldValue('body', next)
    form.validateFields(['body']).catch(() => undefined)
  }

  return (
    <Modal
      title={t('loyalty.template_create')}
      open={open}
      onCancel={onClose}
      width={620}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="primary" onClick={handleSubmit} loading={createMutation.isPending}>
            {t('common.create')}
          </Button>
        </div>
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ language: 'fr', category: 'MARKETING' }}
        onFinish={handleSubmit}
        className="pt-2"
      >
        <Form.Item
          label={t('loyalty.template_name')}
          name="name"
          rules={[{ required: true, message: t('promotions.required') }]}
          extra={t('loyalty.template_name_hint')}
        >
          <Input
            placeholder="welcome_loyalty_program"
            onBlur={(e) => {
              const formatted = formatTemplateName(e.target.value)
              if (formatted !== e.target.value) form.setFieldValue('name', formatted)
            }}
          />
        </Form.Item>

        <div className="grid grid-cols-2 gap-3">
          <Form.Item label={t('loyalty.template_language')} name="language">
            <Select options={LANGUAGE_OPTIONS} />
          </Form.Item>
          <Form.Item label={t('loyalty.template_category')} name="category">
            <Select options={CATEGORY_OPTIONS} />
          </Form.Item>
        </div>

        <Form.Item
          label={t('loyalty.template_body')}
          name="body"
          rules={[
            { required: true, message: t('promotions.required') },
            {
              validator: (_, value: string) => {
                const unknown = findUnknownTokens(value ?? '')
                if (unknown.length === 0) return Promise.resolve()
                return Promise.reject(
                  new Error(
                    t('loyalty.template_unknown_variables', {
                      tokens: unknown.map((tok) => `[${tok}]`).join(', '),
                    }),
                  ),
                )
              },
            },
          ]}
          extra={t('loyalty.template_body_hint')}
        >
          <Input.TextArea rows={5} placeholder={t('loyalty.template_body_placeholder')} />
        </Form.Item>

        <div className="mb-4 flex flex-wrap gap-1">
          {TEMPLATE_VARIABLES.map((v) => (
            <Tooltip
              key={v.key}
              title={
                <div className="flex flex-col gap-1">
                  <span>{v.description}</span>
                  <span className="text-xs opacity-80">
                    {t('loyalty.template_variable_example')}: {v.example}
                  </span>
                </div>
              }
            >
              <Tag
                bordered={false}
                color="processing"
                className="cursor-pointer"
                onClick={() => insertToken(v.token)}
              >
                + [{v.token}]
              </Tag>
            </Tooltip>
          ))}
        </div>
      </Form>
    </Modal>
  )
}
