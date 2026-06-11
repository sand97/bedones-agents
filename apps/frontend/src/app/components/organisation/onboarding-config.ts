import type { ReactNode } from 'react'
import { MessageSquareText, MessagesSquare } from 'lucide-react'
import {
  FacebookIcon,
  InstagramIcon,
  MessengerIcon,
  TikTokIcon,
  WhatsAppIcon,
} from '@app/components/icons/social-icons'

/* ─── Types ─── */

export type FeatureType = 'comments' | 'messaging'

export interface PlatformBranding {
  name: string
  icon: (props: React.SVGProps<SVGSVGElement>) => ReactNode
  color: string
}

export interface PlatformConfig {
  id: string
  name: string
  icon: (props: React.SVGProps<SVGSVGElement>) => ReactNode
  color: string
  supportedFeatures: FeatureType[]
  /** When ONLY messaging is selected, use this alternate branding */
  messagingOnlyBranding?: PlatformBranding
  priority: number
  description: string
  connectButton: string
  addMoreLabel: string
}

export interface FeatureCategoryConfig {
  id: FeatureType
  label: string
  description: string
  icon: (props: { size?: number; strokeWidth?: number; className?: string }) => ReactNode
  platforms: { id: string; label: string }[]
}

/* ─── Configuration ─── */

export const PLATFORMS: PlatformConfig[] = [
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    icon: WhatsAppIcon,
    color: 'var(--color-brand-whatsapp)',
    supportedFeatures: ['messaging'],
    priority: 1,
    description:
      'Associez votre compte WhatsApp Business via Facebook Cloud API pour centraliser vos conversations et recevoir les commandes catalogue.',
    connectButton: 'Connecter un numéro WhatsApp',
    addMoreLabel: 'Connecter un autre numéro',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    icon: FacebookIcon,
    color: 'var(--color-brand-facebook)',
    supportedFeatures: ['comments', 'messaging'],
    messagingOnlyBranding: {
      name: 'Messenger',
      icon: MessengerIcon,
      color: 'var(--color-brand-messenger)',
    },
    priority: 2,
    description:
      'Reliez votre page Facebook pour gérer les commentaires et les conversations Messenger directement depuis Bedones.',
    connectButton: 'Connecter une page Facebook',
    addMoreLabel: 'Connecter une autre page',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: TikTokIcon,
    color: 'var(--color-brand-tiktok)',
    supportedFeatures: ['comments', 'messaging'],
    priority: 3,
    description:
      'Connectez votre compte TikTok Business pour surveiller les commentaires et répondre aux messages directs.',
    connectButton: 'Connecter un compte TikTok',
    addMoreLabel: 'Connecter un autre compte',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: InstagramIcon,
    color: 'var(--color-brand-instagram)',
    supportedFeatures: ['comments', 'messaging'],
    priority: 4,
    description:
      'Reliez votre compte Instagram professionnel pour gérer les commentaires et les messages directs de vos clients.',
    connectButton: 'Connecter un compte Instagram',
    addMoreLabel: 'Connecter un autre compte',
  },
]

export const FEATURE_CATEGORIES: FeatureCategoryConfig[] = [
  {
    id: 'comments',
    label: 'Gestion de commentaires',
    description: 'Surveillez et répondez aux commentaires sur vos publications',
    icon: MessagesSquare,
    platforms: [
      { id: 'facebook', label: 'Facebook' },
      { id: 'instagram', label: 'Instagram' },
      { id: 'tiktok', label: 'TikTok' },
    ],
  },
  {
    id: 'messaging',
    label: 'Gestion de messagerie',
    description: 'Centralisez vos conversations et messages directs',
    icon: MessageSquareText,
    platforms: [
      { id: 'whatsapp', label: 'WhatsApp' },
      { id: 'facebook', label: 'Messenger' },
      { id: 'instagram', label: 'Instagram DM' },
      { id: 'tiktok', label: 'TikTok DM' },
    ],
  },
]

/* ─── Onboarding ─── */

/** Map an onboarding platform id to its social account provider. */
export const PROVIDER_BY_PLATFORM: Record<
  string,
  'WHATSAPP' | 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK'
> = {
  whatsapp: 'WHATSAPP',
  facebook: 'FACEBOOK',
  instagram: 'INSTAGRAM',
  tiktok: 'TIKTOK',
}

/** A connected social account, ready to display in a connection step. */
export interface ConnectedAccount {
  id: string
  name: string
  description?: string
  /** The page's own profile picture; the platform logo is used as a fallback. */
  avatarUrl?: string
}

/* ─── Helpers ─── */

/** Get which features the user actually selected for this specific platform */
export function getSelectedFeaturesForPlatform(
  platform: PlatformConfig,
  selectedFeatures: Record<FeatureType, Set<string>>,
): FeatureType[] {
  return platform.supportedFeatures.filter((f) => selectedFeatures[f].has(platform.id))
}

/** Get the label for a platform step based on which features the user selected */
export function getPlatformStepLabel(
  platform: PlatformConfig,
  selectedFeatures: Record<FeatureType, Set<string>>,
): string {
  const selected = getSelectedFeaturesForPlatform(platform, selectedFeatures)

  if (selected.length === 0) return platform.name

  // If only messaging and platform has alternate branding
  if (selected.length === 1 && selected[0] === 'messaging' && platform.messagingOnlyBranding) {
    return platform.messagingOnlyBranding.name
  }

  const parts: string[] = []
  if (selected.includes('comments')) parts.push('Commentaires')
  if (selected.includes('messaging')) parts.push('Messages')

  return `${parts.join(' et ')} ${platform.name}`
}

/** Get branding (icon, color, name) for a platform based on selected features */
export function getPlatformBranding(
  platform: PlatformConfig,
  selectedFeatures: Record<FeatureType, Set<string>>,
): PlatformBranding {
  const selected = getSelectedFeaturesForPlatform(platform, selectedFeatures)

  if (selected.length === 1 && selected[0] === 'messaging' && platform.messagingOnlyBranding) {
    return platform.messagingOnlyBranding
  }

  return { name: platform.name, icon: platform.icon, color: platform.color }
}

/** Get the description for a platform step based on selected features */
export function getPlatformStepDescription(
  platform: PlatformConfig,
  selectedFeatures: Record<FeatureType, Set<string>>,
): string {
  const selected = getSelectedFeaturesForPlatform(platform, selectedFeatures)
  const branding = getPlatformBranding(platform, selectedFeatures)

  if (selected.length === 2) {
    return `Connectez ${branding.name} pour gérer les commentaires et les messages de vos clients.`
  }
  if (selected.includes('comments')) {
    return `Connectez ${branding.name} pour surveiller et répondre aux commentaires de vos publications.`
  }
  return `Connectez ${branding.name} à notre système pour qu'il réponde à vos clients. Pas de panique il ne sera actif qu'après configuration`
}

/**
 * Get the Facebook Login Configuration ID for a given platform based on selected features.
 * These configuration IDs are set up in Meta Business Suite and define which permissions to request.
 */
export function getConfigIdForPlatform(
  platformId: string,
  selectedFeatures: Record<FeatureType, Set<string>>,
): string | null {
  const hasComments = selectedFeatures.comments.has(platformId)
  const hasMessaging = selectedFeatures.messaging.has(platformId)

  if (platformId === 'facebook') {
    if (hasComments && hasMessaging)
      return import.meta.env.VITE_FB_COMMENTS_MESSAGES_CONFIGGURATION_ID
    if (hasComments) return import.meta.env.VITE_FB_COMMENTS_CONFIGGURATION_ID
    if (hasMessaging) return import.meta.env.VITE_FB_MESSAGES_CONFIGGURATION_ID
  }

  // Instagram uses its own OAuth with scopes, no config_id needed
  if (platformId === 'instagram') return null

  return null
}

/** Format connected pages for stepper description */
export function formatConnectedPages(pages: string[], platformId?: string): string {
  if (pages.length === 0) {
    if (platformId === 'whatsapp') return 'Aucun numéro connecté'
    if (platformId === 'tiktok' || platformId === 'instagram') return 'Aucun compte connecté'
    return 'Aucune page connectée'
  }
  if (pages.length <= 2) return pages.join(', ')
  return `${pages.slice(0, 2).join(', ')} +${pages.length - 2}`
}
