import { useState, type ReactNode } from 'react'
import { Button, Popover } from 'antd'
import { Plus } from 'lucide-react'

export interface SwitcherOption {
  id: string
  label: ReactNode
  isCurrent?: boolean
}

interface SwitcherPopoverProps {
  /** The button/element that triggers the popover */
  children: ReactNode
  /** Section title shown above options */
  title: string
  /** List of selectable options */
  options: SwitcherOption[]
  /** Label for the "add" action at the bottom */
  addLabel: string
  /** Called when an option is selected */
  onSelect?: (id: string) => void
  /** Called when the "add" button is clicked */
  onAdd?: () => void
  /** Popover placement */
  placement?: 'bottomLeft' | 'bottomRight'
}

export function SwitcherPopover({
  children,
  title,
  options,
  addLabel,
  onSelect,
  onAdd,
  placement = 'bottomLeft',
}: SwitcherPopoverProps) {
  const [open, setOpen] = useState(false)

  const content = (
    <div className="w-60">
      <div className="px-3 pb-2 py-3 text-xs font-normal text-text-muted">{title}</div>
      {options.map((option) => (
        <Button
          key={option.id}
          type="text"
          block
          onClick={() => {
            onSelect?.(option.id)
            setOpen(false)
          }}
          className="py-2.5!"
        >
          <div className="min-w-0 flex-1">{option.label}</div>
          {option.isCurrent && <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-black" />}
        </Button>
      ))}
      <div className="mx-3 my-1 h-px bg-border-subtle" />
      <Button
        type="text"
        block
        onClick={() => {
          onAdd?.()
          setOpen(false)
        }}
        className="py-2.5!"
      >
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-dashed border-border-default">
          <Plus size={14} className="text-text-muted" />
        </div>
        <span className="text-sm font-medium text-text-primary">{addLabel}</span>
      </Button>
    </div>
  )

  return (
    <Popover
      content={content}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement={placement}
      overlayClassName="org-switcher-popover"
      arrow={false}
    >
      {children}
    </Popover>
  )
}
