import type { ReactNode } from 'react'
import {
  WhatsAppIcon,
  InstagramIcon,
  MessengerIcon,
  TikTokIcon,
} from '@app/components/icons/social-icons'

export type ChatProvider = 'whatsapp' | 'instagram-dm' | 'messenger' | 'tiktok'

export const PROVIDER_EMPTY_STATE: Record<
  ChatProvider,
  {
    icon: ReactNode
    color: string
    noConvTitleKey: string
    selectTitleKey: string
    selectDescKey: string
  }
> = {
  whatsapp: {
    icon: <WhatsAppIcon width={40} height={40} />,
    color: 'var(--color-brand-whatsapp)',
    noConvTitleKey: 'chat.no_conversations',
    selectTitleKey: 'chat.select_conversation',
    selectDescKey: 'chat.whatsapp_select_desc',
  },
  'instagram-dm': {
    icon: <InstagramIcon width={40} height={40} />,
    color: 'var(--color-brand-instagram)',
    noConvTitleKey: 'chat.no_messages',
    selectTitleKey: 'chat.select_conversation',
    selectDescKey: 'chat.instagram_select_desc',
  },
  messenger: {
    icon: <MessengerIcon width={40} height={40} />,
    color: 'var(--color-brand-messenger)',
    noConvTitleKey: 'chat.no_messages',
    selectTitleKey: 'chat.select_conversation',
    selectDescKey: 'chat.messenger_select_desc',
  },
  tiktok: {
    icon: <TikTokIcon width={40} height={40} />,
    color: 'var(--color-brand-tiktok)',
    noConvTitleKey: 'chat.no_messages',
    selectTitleKey: 'chat.select_conversation',
    selectDescKey: 'chat.tiktok_select_desc',
  },
}

/**
 * Determine which single setup state to show, in priority order:
 * 1. No catalog (WhatsApp only) → configure catalog
 * 2. Catalog but no agent → configure agent
 * 3. Everything configured → null (show conversations or "empty" state)
 */
export type SetupState = 'catalog' | 'agent' | null

export function useSetupState(
  provider: ChatProvider,
  hasCatalogAssociated: boolean,
  hasReadyAgent: boolean,
): SetupState {
  if (provider === 'whatsapp' && !hasCatalogAssociated) return 'catalog'
  if (!hasReadyAgent) return 'agent'
  return null
}
