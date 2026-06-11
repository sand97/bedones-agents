import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Popover, Checkbox } from 'antd'
import { LabelBadgeIcon } from '@app/components/icons/social-icons'

/* ── Labels filter popover ── */

export function LabelsFilterPopover({
  labels,
  selectedLabelIds,
  onToggle,
  children,
}: {
  labels: { id: string; name: string; color: string }[]
  selectedLabelIds: string[]
  onToggle: (labelId: string) => void
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()

  return (
    <Popover
      content={
        <div className="flex w-48 flex-col gap-0.5">
          <div className="px-3 py-2 text-xs font-semibold text-text-muted">
            {t('chat.filter_by_label')}
          </div>
          {labels.map((label) => (
            <Button
              key={label.id}
              type="text"
              block
              onClick={() => onToggle(label.id)}
              className="py-2!"
            >
              <Checkbox checked={selectedLabelIds.includes(label.id)} />
              <LabelBadgeIcon
                width={12}
                height={12}
                style={{ color: label.color }}
                className="flex-shrink-0"
              />
              <span className="flex-1 truncate">{label.name}</span>
            </Button>
          ))}
        </div>
      }
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomLeft"
      overlayClassName="org-switcher-popover"
      arrow={false}
    >
      {children}
    </Popover>
  )
}
