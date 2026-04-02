import {
  WhatsAppIcon,
  InstagramIcon,
  MessengerIcon,
  FacebookIcon,
  TikTokIcon,
} from '@app/components/icons/social-icons'
import { SOCIAL_NETWORK_CONFIG, type SocialNetwork } from '@app/components/whatsapp/mock-data'

const SOCIAL_ICON_MAP: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  whatsapp: WhatsAppIcon,
  instagram: InstagramIcon,
  messenger: MessengerIcon,
  facebook: FacebookIcon,
  tiktok: TikTokIcon,
}

interface SocialBadgeProps {
  network: SocialNetwork
  size?: number
}

export function SocialBadge({ network, size = 22 }: SocialBadgeProps) {
  const config = SOCIAL_NETWORK_CONFIG[network]
  const IconComponent = SOCIAL_ICON_MAP[network]
  const iconSize = Math.round(size * 0.55)

  return (
    <span
      className="inline-flex items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${config.color} 12%, transparent)`,
      }}
    >
      <IconComponent width={iconSize} height={iconSize} style={{ color: config.color }} />
    </span>
  )
}

export function SocialIconInline({
  network,
  size = 16,
}: {
  network: SocialNetwork
  size?: number
}) {
  const config = SOCIAL_NETWORK_CONFIG[network]
  const IconComponent = SOCIAL_ICON_MAP[network]
  return <IconComponent width={size} height={size} style={{ color: config.color }} />
}
