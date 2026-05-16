import { useState, type ReactNode } from 'react'
import { Button, Popover, Modal } from 'antd'
import { Link, Pause, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Agent } from '@app/lib/api/agent-api'

interface AgentActionsPopoverProps {
  agent: Agent
  onEditResources: () => void
  onDeactivate: () => void
  onDelete: () => void
  children: ReactNode
}

export function AgentActionsPopover({
  agent,
  onEditResources,
  onDeactivate,
  onDelete,
  children,
}: AgentActionsPopoverProps) {
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()

  const handleDelete = () => {
    setOpen(false)
    Modal.confirm({
      title: t('agent.delete_confirm_title'),
      content: t('agent.delete_confirm_desc'),
      okText: t('agent.delete_agent'),
      okButtonProps: { danger: true },
      cancelText: t('agent.create_modal_cancel'),
      onOk: onDelete,
    })
  }

  const items = [
    {
      label: t('agent.connected_resources'),
      icon: <Link size={18} />,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50',
      onClick: () => {
        setOpen(false)
        onEditResources()
      },
    },
    ...(agent.status === 'ACTIVE'
      ? [
          {
            label: t('agent.deactivate_agent'),
            icon: <Pause size={18} />,
            color: 'text-orange-500',
            bgColor: 'bg-orange-50',
            onClick: () => {
              setOpen(false)
              onDeactivate()
            },
          },
        ]
      : []),
    {
      label: t('agent.delete_agent'),
      icon: <Trash2 size={18} />,
      color: 'text-red-500',
      bgColor: 'bg-red-50',
      onClick: handleDelete,
    },
  ]

  return (
    <Popover
      content={
        <div className="flex w-52 flex-col gap-0.5">
          {items.map((item) => (
            <Button key={item.label} type="text" block onClick={item.onClick} className="py-2.5!">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full ${item.bgColor} ${item.color}`}
              >
                {item.icon}
              </div>
              {item.label}
            </Button>
          ))}
        </div>
      }
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      overlayClassName="org-switcher-popover"
      arrow={false}
    >
      {children}
    </Popover>
  )
}
