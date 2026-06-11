import { useTranslation } from 'react-i18next'
import { Divider, Form, Input, Tag, Tooltip } from 'antd'
import { findUnknownTokens, type TemplateVariable } from '../loyalty-template-variables'
import { MAX_FOOTER_TEXT } from './constants'

interface BodySectionProps {
  templateVariables: TemplateVariable[]
  insertToken: (token: string) => void
  liveCategory: string
  onFooterTouched: () => void
}

/** "Body" section of the template editor (must be rendered inside the <Form>). */
export function LoyaltyTemplateBodySection({
  templateVariables,
  insertToken,
  liveCategory,
  onFooterTouched,
}: BodySectionProps) {
  const { t } = useTranslation()

  return (
    <>
      {/* ─── Section: Body ─── */}
      <Divider orientation="left" plain>
        {t('loyalty.section_body')}
      </Divider>

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
        {templateVariables.map((v) => (
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

      <Form.Item
        label={t('loyalty.footer_text')}
        name="footerText"
        rules={[
          { max: MAX_FOOTER_TEXT },
          {
            validator: (_, value: string | undefined) => {
              if (liveCategory !== 'MARKETING') return Promise.resolve()
              const footer = value?.trim() ?? ''
              if (!footer.includes('STOP')) {
                return Promise.reject(new Error(t('loyalty.footer_stop_required')))
              }
              return Promise.resolve()
            },
          },
        ]}
        extra={t('loyalty.footer_text_hint')}
      >
        <Input
          placeholder={t('loyalty.footer_text_placeholder')}
          maxLength={MAX_FOOTER_TEXT}
          showCount
          onChange={() => onFooterTouched()}
        />
      </Form.Item>
    </>
  )
}
