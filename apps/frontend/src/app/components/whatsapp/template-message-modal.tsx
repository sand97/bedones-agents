import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Form, Input, Modal, Tag } from 'antd'
import type { LoyaltyTemplate } from '@app/lib/api/loyalty-api'
import { TemplateSelectField } from '@app/components/loyalty/template-select-field'
import {
  LoyaltyTemplatePreview,
  type HeaderType,
} from '@app/components/loyalty/loyalty-template-preview'

interface Props {
  open: boolean
  onClose: () => void
  socialAccountId: string
  onSend: (data: {
    template: LoyaltyTemplate
    variables: Record<string, string>
    renderedBody: string
  }) => Promise<void> | void
  loading?: boolean
}

function renderBody(body: string, values: Record<string, string>) {
  return body.replace(/{{\s*([^}]+?)\s*}}/g, (_, key: string) => values[key.trim()] ?? '')
}

export function TemplateMessageModal({ open, onClose, socialAccountId, onSend, loading }: Props) {
  const { t } = useTranslation()
  const [template, setTemplate] = useState<LoyaltyTemplate | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})

  const variables = useMemo(() => template?.variables ?? [], [template])
  const renderedBody = template ? renderBody(template.body, values) : ''
  const contactTags = useMemo(
    () => [
      { value: 'Nom', label: t('loyalty.campaign_contact_tag_name') },
      { value: 'Prénom', label: t('loyalty.campaign_contact_tag_first_name') },
      { value: 'Nom complet', label: t('loyalty.campaign_contact_tag_full_name') },
    ],
    [t],
  )

  const handleClose = () => {
    setTemplate(null)
    setValues({})
    onClose()
  }

  const handleSend = async () => {
    if (!template) return
    await onSend({ template, variables: values, renderedBody })
    handleClose()
  }

  return (
    <Modal
      title={t('loyalty.template_message_title')}
      open={open}
      onCancel={handleClose}
      width={840}
      styles={{ body: { maxHeight: '75vh', overflowY: 'auto' } }}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button onClick={handleClose}>{t('common.cancel')}</Button>
          <Button type="primary" onClick={handleSend} loading={loading} disabled={!template}>
            {t('common.send')}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <Form layout="vertical">
            <Form.Item label={t('loyalty.templates')}>
              <TemplateSelectField
                socialAccountId={socialAccountId}
                value={template}
                onChange={(next) => {
                  setTemplate(next)
                  setValues({})
                }}
              />
            </Form.Item>

            {variables.map((variable) => (
              <Form.Item key={variable} label={t('loyalty.campaign_variable', { variable })}>
                <Input
                  value={values[variable] ?? ''}
                  onChange={(event) =>
                    setValues((prev) => ({ ...prev, [variable]: event.target.value }))
                  }
                />
                <div className="mt-2 flex flex-wrap gap-1">
                  {contactTags.map((tag) => (
                    <Tag
                      key={tag.value}
                      bordered={false}
                      color="processing"
                      className="cursor-pointer"
                      onClick={() =>
                        setValues((prev) => ({ ...prev, [variable]: `[${tag.value}]` }))
                      }
                    >
                      {tag.label}
                    </Tag>
                  ))}
                </div>
              </Form.Item>
            ))}
          </Form>
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold text-text-primary">
            {t('loyalty.preview_title')}
          </div>
          <LoyaltyTemplatePreview
            headerType={(template?.headerType as HeaderType | undefined) ?? 'NONE'}
            headerText={template?.headerText}
            body={renderedBody}
            footerText={template?.footerText}
            buttons={[]}
          />
        </div>
      </div>
    </Modal>
  )
}
