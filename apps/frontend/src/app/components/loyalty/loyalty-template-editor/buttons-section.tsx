import { useTranslation } from 'react-i18next'
import { Alert, Button, Divider, Input, Select, Space } from 'antd'
import { Plus, Trash2 } from 'lucide-react'
import { getTemplateButtonText, type ButtonType } from '../loyalty-template-preview'
import { isProductTemplateButton, MAX_BUTTON_TEXT, type ButtonDraft } from './constants'

interface ButtonsSectionProps {
  buttons: ButtonDraft[]
  buttonTypeOptions: { value: ButtonType; label: string }[]
  updateButton: (index: number, patch: Partial<ButtonDraft>) => void
  removeButton: (index: number) => void
  handleAddButton: () => void
  canAddButton: boolean
  buttonHelpText: string
  liveCategory: string
  hasProductTemplateButton: boolean
}

/** "Buttons" section of the template editor (must be rendered inside the <Form>). */
export function LoyaltyTemplateButtonsSection({
  buttons,
  buttonTypeOptions,
  updateButton,
  removeButton,
  handleAddButton,
  canAddButton,
  buttonHelpText,
  liveCategory,
  hasProductTemplateButton,
}: ButtonsSectionProps) {
  const { t } = useTranslation()

  return (
    <>
      {/* ─── Section: Buttons ─── */}
      <Divider orientation="left" plain>
        {t('loyalty.section_buttons')}
      </Divider>

      <div className="flex flex-col gap-2">
        {buttons.map((btn, i) => {
          const hasFixedLabel = isProductTemplateButton(btn.type)
          const fixedLabel = getTemplateButtonText(btn.type)

          return (
            <div key={i} className="flex flex-col gap-2">
              <Space.Compact block>
                <Select
                  value={btn.type}
                  onChange={(val: ButtonType) => updateButton(i, { type: val })}
                  options={buttonTypeOptions}
                  style={{ width: hasFixedLabel ? 'calc(100% - var(--height-input))' : 220 }}
                />
                {!hasFixedLabel && (
                  <Input
                    value={btn.text}
                    onChange={(e) => updateButton(i, { text: e.target.value })}
                    maxLength={MAX_BUTTON_TEXT}
                    showCount
                    placeholder={t('loyalty.button_text_placeholder')}
                  />
                )}
                <Button
                  danger
                  icon={<Trash2 size={14} />}
                  onClick={() => removeButton(i)}
                  className="loyalty-template-button-delete"
                />
              </Space.Compact>
              {hasFixedLabel && (
                <div className="text-xs text-text-muted">
                  {t('loyalty.button_fixed_label_hint', { label: fixedLabel })}
                </div>
              )}
              {btn.type === 'MPM' && (
                <Alert
                  type="info"
                  showIcon
                  message={t('loyalty.button_mpm_header_required_title')}
                  description={t('loyalty.button_mpm_header_required_desc')}
                />
              )}
              {btn.type === 'URL' && (
                <Input
                  addonBefore={t('loyalty.button_url')}
                  value={btn.url ?? ''}
                  onChange={(e) => updateButton(i, { url: e.target.value })}
                  placeholder="https://"
                />
              )}
              {btn.type === 'PHONE_NUMBER' && (
                <Input
                  addonBefore={t('loyalty.button_phone')}
                  value={btn.phoneNumber ?? ''}
                  onChange={(e) => updateButton(i, { phoneNumber: e.target.value })}
                  placeholder="+237 6XX XXX XXX"
                />
              )}
            </div>
          )
        })}

        <Button
          onClick={handleAddButton}
          icon={<Plus size={14} />}
          disabled={!canAddButton}
          className="self-start"
        >
          {t('loyalty.add_button')}
        </Button>
        <div className="text-xs text-text-muted">{buttonHelpText}</div>
        {liveCategory === 'MARKETING' && !hasProductTemplateButton && (
          <div className="text-xs text-text-muted">{t('loyalty.product_buttons_hint')}</div>
        )}
      </div>
    </>
  )
}
