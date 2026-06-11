import { Avatar, Button } from 'antd'
import { Plus } from 'lucide-react'
import {
  getPlatformBranding,
  getPlatformStepDescription,
  getPlatformStepLabel,
  type ConnectedAccount,
  type FeatureType,
  type PlatformConfig,
} from './onboarding-config'

/* ─── Step: Connect Platform ─── */

export function StepConnectPlatform({
  platform,
  selectedFeatures,
  connectedAccounts,
  connecting,
  onConnect,
}: {
  platform: PlatformConfig
  selectedFeatures: Record<FeatureType, Set<string>>
  connectedAccounts: ConnectedAccount[]
  connecting: boolean
  onConnect: () => void
}) {
  if (!platform) return null

  const branding = getPlatformBranding(platform, selectedFeatures)
  const description = getPlatformStepDescription(platform, selectedFeatures)
  const BrandIcon = branding.icon
  const isConnected = connectedAccounts.length > 0
  // Only WhatsApp connects inline (popup); the others redirect away to OAuth.
  const connectLoading = platform.id === 'whatsapp' && connecting

  if (isConnected) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h3 className="m-0 mb-1 text-lg font-semibold text-text-primary">
            {getPlatformStepLabel(platform, selectedFeatures)}
          </h3>
          <p className="m-0 text-sm text-text-secondary">
            Vos comptes connectés à {branding.name}.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {connectedAccounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center gap-3 rounded-xl border border-border-default bg-white p-3"
            >
              {/* Page profile picture, falling back to the platform logo */}
              <Avatar
                size={32}
                shape="square"
                src={account.avatarUrl || undefined}
                icon={<BrandIcon width={16} height={16} />}
                style={{ background: `${branding.color}14`, color: branding.color, flexShrink: 0 }}
              />
              <div className="flex flex-1 flex-col">
                <span className="text-sm font-medium text-text-primary">{account.name}</span>
                {account.description && (
                  <span className="text-xs text-text-soft">{account.description}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <Button
          onClick={onConnect}
          icon={<Plus size={16} />}
          loading={connectLoading}
          className="self-start"
        >
          {platform.addMoreLabel}
        </Button>
      </div>
    )
  }

  // Empty state — not yet connected
  return (
    <div className="flex flex-col items-center py-8">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ background: `${branding.color}14`, color: branding.color }}
      >
        <BrandIcon width={32} height={32} />
      </div>

      <div className="mt-4 mb-6 text-center">
        <h3 className="m-0 mb-1 text-lg font-semibold text-text-primary">
          {getPlatformStepLabel(platform, selectedFeatures)}
        </h3>
        <p className="m-0 max-w-sm text-sm text-text-secondary">{description}</p>
      </div>

      <Button
        type="primary"
        size="large"
        icon={<Plus size={16} />}
        loading={connectLoading}
        onClick={onConnect}
      >
        {platform.connectButton}
      </Button>
    </div>
  )
}
