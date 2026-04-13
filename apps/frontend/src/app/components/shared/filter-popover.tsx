import { useState, type ReactNode } from 'react'
import { Checkbox, Popover } from 'antd'

export interface FilterOption {
  key: string
  label: string
  color?: string
}

interface FilterPopoverProps {
  title: string
  options: FilterOption[]
  selected: string[]
  onToggle: (key: string) => void
  children: ReactNode
  footer?: ReactNode
}

export function FilterPopover({
  title,
  options,
  selected,
  onToggle,
  children,
  footer,
}: FilterPopoverProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover
      content={
        <div className="flex w-52 flex-col">
          <div className="px-3 py-2 text-xs font-semibold text-text-muted">{title}</div>
          <div className="flex flex-col gap-0.5">
            {options.map((option) => {
              const isActive = selected.includes(option.key)
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => onToggle(option.key)}
                  className="tickets-status-option"
                  style={isActive ? { background: 'var(--color-bg-subtle)' } : undefined}
                >
                  <Checkbox checked={isActive} />
                  {option.color && (
                    <span
                      className="inline-block flex-shrink-0 rounded-full"
                      style={{
                        width: 8,
                        height: 8,
                        background: option.color,
                      }}
                    />
                  )}
                  <span className="flex-1 truncate">{option.label}</span>
                </button>
              )
            })}
          </div>
          {footer}
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
