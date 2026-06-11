import type { ReactNode } from 'react'
import { FacebookIcon, InstagramIcon, TikTokIcon } from '@app/components/icons/social-icons'

const ICON_SIZE = 40

export interface CommentConfigEntry {
  labelKey: string
  mobileLabel: string
  icon: ReactNode
  color: string
  titleKey: string
  descriptionKey: string
  buttonKey: string
  connectLabelKey: string
  provider: 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK'
}

export const COMMENT_CONFIG: Record<string, CommentConfigEntry> = {
  facebook: {
    labelKey: 'comments.facebook_label',
    mobileLabel: 'Facebook',
    icon: <FacebookIcon width={ICON_SIZE} height={ICON_SIZE} />,
    color: 'var(--color-brand-facebook)',
    titleKey: 'comments.connect_facebook_title',
    descriptionKey: 'comments.connect_facebook_desc',
    buttonKey: 'comments.connect_facebook_btn',
    connectLabelKey: 'comments.connect_facebook_short',
    provider: 'FACEBOOK',
  },
  instagram: {
    labelKey: 'comments.instagram_label',
    mobileLabel: 'Instagram',
    icon: <InstagramIcon width={ICON_SIZE} height={ICON_SIZE} />,
    color: 'var(--color-brand-instagram)',
    titleKey: 'comments.connect_instagram_title',
    descriptionKey: 'comments.connect_instagram_desc',
    buttonKey: 'comments.connect_instagram_btn',
    connectLabelKey: 'comments.connect_instagram_short',
    provider: 'INSTAGRAM',
  },
  tiktok: {
    labelKey: 'comments.tiktok_label',
    mobileLabel: 'TikTok',
    icon: <TikTokIcon width={ICON_SIZE} height={ICON_SIZE} />,
    color: 'var(--color-brand-tiktok)',
    titleKey: 'comments.connect_tiktok_title',
    descriptionKey: 'comments.connect_tiktok_desc',
    buttonKey: 'comments.connect_tiktok_btn',
    connectLabelKey: 'comments.connect_tiktok_short',
    provider: 'TIKTOK',
  },
}
