import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Popover } from 'antd'
import { FileText, Megaphone, ShoppingBag, Tag, Unlink } from 'lucide-react'
import type { ChatProvider } from './provider-empty-state'

export function ChatToolsPopover({
  provider,
  onOpenOptions,
  onOpenTemplates,
  onOpenCampaigns,
  onDisconnect,
  children,
}: {
  provider: ChatProvider
  onOpenOptions?: () => void
  onOpenTemplates?: () => void
  onOpenCampaigns?: () => void
  onDisconnect?: () => void
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()
  const items = [
    {
      label: t('chat.tools_catalog'),
      icon: <ShoppingBag size={18} />,
      color: 'text-green-500',
      bgColor: 'bg-green-50',
      onClick: onOpenOptions,
    },
    {
      label: t('chat.tools_labels'),
      icon: <Tag size={18} />,
      color: 'text-purple-500',
      bgColor: 'bg-purple-50',
      onClick: onOpenOptions,
    },
    // Templates & campaigns are WhatsApp-only features.
    ...(provider === 'whatsapp'
      ? [
          {
            label: t('chat.tools_templates'),
            icon: <FileText size={18} />,
            color: 'text-blue-500',
            bgColor: 'bg-blue-50',
            onClick: onOpenTemplates,
          },
          {
            label: t('chat.tools_campaigns'),
            icon: <Megaphone size={18} />,
            color: 'text-orange-500',
            bgColor: 'bg-orange-50',
            onClick: onOpenCampaigns,
          },
        ]
      : []),
    {
      label: t('chat.tools_disconnect'),
      icon: <Unlink size={18} />,
      color: 'text-red-500',
      bgColor: 'bg-red-50',
      onClick: onDisconnect,
    },
  ]

  return (
    <Popover
      content={
        <div className="flex w-48 flex-col gap-0.5">
          {items.map((item) => (
            <Button
              key={item.label}
              type="text"
              block
              onClick={() => {
                setOpen(false)
                item.onClick?.()
              }}
              className="py-2.5!"
            >
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
