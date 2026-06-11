import type { ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from 'antd'
import { ArrowLeft } from 'lucide-react'
import {
  WhatsAppIcon,
  InstagramIcon,
  MessengerIcon,
  TikTokIcon,
} from '@app/components/icons/social-icons'

const ICON_SIZE = 40

export interface ChatConfigEntry {
  label: string
  mobileLabel: string
  icon: ReactNode
  color: string
  titleKey: string
  descriptionKey: string
  buttonKey: string
  connectLabelKey: string
  provider: 'FACEBOOK' | 'INSTAGRAM' | 'WHATSAPP' | 'TIKTOK'
}

export const CHAT_CONFIG: Record<string, ChatConfigEntry> = {
  whatsapp: {
    label: 'WhatsApp',
    mobileLabel: 'WhatsApp',
    icon: <WhatsAppIcon width={ICON_SIZE} height={ICON_SIZE} />,
    color: 'var(--color-brand-whatsapp)',
    titleKey: 'chat.whatsapp_setup_title',
    descriptionKey: 'chat.whatsapp_setup_desc',
    buttonKey: 'chat.whatsapp_setup_btn',
    connectLabelKey: 'chat.whatsapp_connect_label',
    provider: 'WHATSAPP',
  },
  'instagram-dm': {
    label: 'Messages Instagram',
    mobileLabel: 'Instagram DM',
    icon: <InstagramIcon width={ICON_SIZE} height={ICON_SIZE} />,
    color: 'var(--color-brand-instagram)',
    titleKey: 'chat.instagram_setup_title',
    descriptionKey: 'chat.instagram_setup_desc',
    buttonKey: 'chat.instagram_setup_btn',
    connectLabelKey: 'chat.instagram_connect_label',
    provider: 'INSTAGRAM',
  },
  messenger: {
    label: 'Messenger',
    mobileLabel: 'Messenger',
    icon: <MessengerIcon width={ICON_SIZE} height={ICON_SIZE} />,
    color: 'var(--color-brand-messenger)',
    titleKey: 'chat.messenger_setup_title',
    descriptionKey: 'chat.messenger_setup_desc',
    buttonKey: 'chat.messenger_setup_btn',
    connectLabelKey: 'chat.messenger_connect_label',
    provider: 'FACEBOOK',
  },
  tiktok: {
    label: 'TikTok',
    mobileLabel: 'TikTok DM',
    icon: <TikTokIcon width={ICON_SIZE} height={ICON_SIZE} />,
    color: 'var(--color-brand-tiktok)',
    titleKey: 'chat.tiktok_setup_title',
    descriptionKey: 'chat.tiktok_setup_desc',
    buttonKey: 'chat.tiktok_setup_btn',
    connectLabelKey: 'chat.tiktok_connect_label',
    provider: 'TIKTOK',
  },
}

export const PROVIDER_MAP: Record<string, string> = {
  whatsapp: 'WHATSAPP',
  messenger: 'FACEBOOK',
  'instagram-dm': 'INSTAGRAM',
  tiktok: 'TIKTOK',
}

/* ── Mobile back button ── */

export function MobileBackButton() {
  const navigate = useNavigate()

  return (
    <Button
      type="text"
      onClick={() =>
        navigate({
          search: (prev: Record<string, unknown>) =>
            ({ ...prev, conv: undefined, ticket: undefined }) as never,
        })
      }
      icon={<ArrowLeft size={18} strokeWidth={1.5} />}
      className="p-0!"
    >
      Chats
    </Button>
  )
}
