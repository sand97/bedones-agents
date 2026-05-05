import type { ReactNode } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Button, Tag, Tooltip } from 'antd'
import { AlertCircle, CheckCircle2, Clock3, Pencil, Trash2 } from 'lucide-react'
import type { LoyaltyTemplate } from '@app/lib/api/loyalty-api'
import { getTemplateVariables, metaPlaceholdersToTokens } from './loyalty-template-variables'

interface Props {
  template: LoyaltyTemplate
  selected?: boolean
  selectionMode?: boolean
  onSelect?: (template: LoyaltyTemplate) => void
  onEdit?: (template: LoyaltyTemplate) => void
  onDelete?: (template: LoyaltyTemplate) => void
  action?: ReactNode
}

function statusIcon(template: LoyaltyTemplate, t: TFunction) {
  const status = template.status?.toUpperCase()
  if (status === 'APPROVED') {
    return {
      icon: <CheckCircle2 size={14} className="text-green-600" />,
      label: t('loyalty.template_status_approved'),
    }
  }
  if (status === 'REJECTED') {
    return {
      icon: <AlertCircle size={14} className="text-red-600" />,
      label: template.rejectionReason
        ? t('loyalty.template_status_rejected_for', { reason: template.rejectionReason })
        : t('loyalty.template_status_rejected'),
    }
  }
  return {
    icon: <Clock3 size={14} className="text-amber-600" />,
    label: t('loyalty.template_status_pending'),
  }
}

export function LoyaltyTemplateListItem({
  template,
  selected,
  selectionMode,
  onSelect,
  onEdit,
  onDelete,
  action,
}: Props) {
  const { t } = useTranslation()
  const status = statusIcon(template, t)
  const templateVariables = getTemplateVariables(t)

  return (
    <div
      className="flex items-start gap-3 rounded-md border p-3"
      style={{ borderColor: selected ? '#111' : 'var(--color-border-subtle)' }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <Tag bordered={false} color="default" className="m-0! shrink-0">
            {template.language}
          </Tag>
          <div className="truncate text-sm font-semibold text-text-primary">{template.name}</div>
          <Tooltip title={status.label}>{status.icon}</Tooltip>
        </div>
        <div className="mt-1 line-clamp-2 text-xs text-text-secondary">
          {metaPlaceholdersToTokens(template.body, templateVariables)}
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <Tag bordered={false}>{template.category}</Tag>
          <div className="flex shrink-0 items-center gap-1">
            {action ??
              (selectionMode ? (
                selected ? null : (
                  <Button size="small" onClick={() => onSelect?.(template)}>
                    {t('common.select')}
                  </Button>
                )
              ) : (
                <>
                  <Button
                    size="small"
                    variant="outlined"
                    icon={<Pencil size={13} />}
                    onClick={() => onEdit?.(template)}
                  >
                    {t('common.edit')}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    danger
                    icon={<Trash2 size={13} />}
                    onClick={() => onDelete?.(template)}
                  >
                    {t('common.delete')}
                  </Button>
                </>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}
