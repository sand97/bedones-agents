import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from 'antd'
import { FileText, Plus } from 'lucide-react'
import type { LoyaltyTemplate } from '@app/lib/api/loyalty-api'
import { LoyaltyTemplateModal } from './loyalty-template-modal'
import { LoyaltyTemplateListItem } from './loyalty-template-list-item'

interface Props {
  socialAccountId: string
  value?: LoyaltyTemplate | null
  onChange: (template: LoyaltyTemplate) => void
  title?: string
  description?: string
  defaultFooter?: string
}

export function TemplateSelectField({
  socialAccountId,
  value,
  onChange,
  title,
  description,
  defaultFooter,
}: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const displayTitle = title ?? t('loyalty.template_select_empty_title')
  const displayDescription = description ?? t('loyalty.template_select_empty_desc')

  return (
    <>
      {value ? (
        <LoyaltyTemplateListItem
          template={value}
          selected
          action={
            <Button size="small" onClick={() => setOpen(true)}>
              {t('common.change')}
            </Button>
          }
        />
      ) : (
        <div className="create-ticket-empty-section">
          <FileText size={32} strokeWidth={1.5} className="text-text-muted opacity-50" />
          <div className="text-sm font-medium text-text-primary">{displayTitle}</div>
          <div className="text-xs text-text-muted">{displayDescription}</div>
          <Button onClick={() => setOpen(true)} icon={<Plus size={16} />} className="mt-2">
            {t('loyalty.template_select_button')}
          </Button>
        </div>
      )}

      <LoyaltyTemplateModal
        open={open}
        onClose={() => setOpen(false)}
        socialAccountId={socialAccountId}
        defaultFooter={defaultFooter}
        selectedTemplateId={value?.id}
        onTemplateSelected={(template) => {
          onChange(template)
          setOpen(false)
        }}
      />
    </>
  )
}
