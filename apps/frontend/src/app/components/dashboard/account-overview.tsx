import { useCallback, useState } from 'react'
import { App, Avatar, Button, Card, Tag, Tooltip, Typography } from 'antd'
import { AlertCircle, MessageCircle, MessageSquare, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
  FacebookIcon,
  InstagramIcon,
  MessengerIcon,
  TikTokIcon,
  WhatsAppIcon,
} from '@app/components/icons/social-icons'
import { SocialAccountErrorDetails } from '@app/components/social/social-account-error-details'
import { reconnectSocialAccount } from '@app/lib/social-reconnect'
import { launchWhatsAppSignup } from '@app/lib/facebook-sdk'
import { exchangeWhatsAppCode } from '@app/server/whatsapp'
import type { components } from '@app/lib/api/v1'

const { Title, Text } = Typography

const FACEBOOK_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID
const WHATSAPP_CONFIG_ID = import.meta.env.VITE_WHATSAPP_CONFIGGURATION_ID

type SocialAccount = components['schemas']['SocialAccountResponseDto']

/** An account is unhealthy when fully disabled or with a feature turned off. */
function isUnhealthy(account: SocialAccount): boolean {
  return account.disabled || (account.featureDisabled?.length ?? 0) > 0
}

/**
 * The "all configured" dashboard view: groups every connected account by
 * social network and lets the user jump to Comments / Messaging for each one.
 */
export function AccountOverview({
  accounts,
  orgSlug,
  onOpenComments,
  onOpenMessaging,
}: {
  accounts: SocialAccount[]
  orgSlug: string
  onOpenComments: (provider: string, accountId: string) => void
  onOpenMessaging: (provider: string, accountId: string) => void
}) {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [detailsAccount, setDetailsAccount] = useState<SocialAccount | null>(null)
  const [reconnectingId, setReconnectingId] = useState<string | null>(null)

  const handleReconnect = useCallback(
    async (account: SocialAccount) => {
      // Facebook / Instagram / TikTok: redirect to the provider's OAuth screen.
      if (account.provider !== 'WHATSAPP') {
        const outcome = reconnectSocialAccount(account, orgSlug)
        if (outcome === 'unsupported') message.error(t('social.reconnect_unavailable'))
        return
      }

      // WhatsApp: re-run the Embedded Signup flow, then refresh the list.
      setReconnectingId(account.id)
      try {
        const { loginResponse, sessionInfo } = await launchWhatsAppSignup(
          FACEBOOK_APP_ID,
          WHATSAPP_CONFIG_ID,
        )
        if (loginResponse.authResponse?.code) {
          const res = await exchangeWhatsAppCode({
            data: {
              code: loginResponse.authResponse.code,
              wabaId: sessionInfo.waba_id,
              phoneNumberId: sessionInfo.phone_number_id,
            },
          })
          if (res.success) {
            message.success(t('social.reconnect_success'))
            queryClient.invalidateQueries({
              queryKey: ['get', '/social/accounts/{organisationId}'],
            })
          } else {
            message.error(res.error || t('social.connection_error'))
          }
        }
      } catch (err) {
        message.error(err instanceof Error ? err.message : t('social.connection_error'))
      } finally {
        setReconnectingId(null)
      }
    },
    [orgSlug, t, message, queryClient],
  )

  const groups = groupByNetwork(accounts)

  if (groups.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Title level={5} style={{ margin: 0 }}>
            {t('dashboard.no_accounts_title')}
          </Title>
          <Text type="secondary" className="max-w-sm">
            {t('dashboard.no_accounts_desc')}
          </Text>
        </div>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <Card key={group.network}>
          <div className="mb-4 flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: `${group.color}14`, color: group.color }}
            >
              <group.Icon width={20} height={20} />
            </div>
            <div>
              <Title level={5} style={{ margin: 0 }}>
                {group.label}
              </Title>
              <Text type="secondary">
                {t('dashboard.network_accounts_count', { count: group.accounts.length })}
              </Text>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {group.accounts.map((account) => {
              const hasComments = NETWORKS_WITH_COMMENTS.has(account.provider)
              const hasMessaging = accountSupportsMessaging(account)
              const unhealthy = isUnhealthy(account)
              return (
                <div
                  key={account.id}
                  className={`flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3 ${
                    unhealthy ? 'border-red-300 bg-red-50/40' : 'border-border-default'
                  }`}
                >
                  <Avatar
                    size={36}
                    shape="square"
                    src={account.profilePictureUrl}
                    style={{
                      background: `${group.color}14`,
                      color: group.color,
                      flexShrink: 0,
                    }}
                    icon={<group.Icon width={18} height={18} />}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-text-primary">
                        {account.pageName ||
                          account.username ||
                          t('dashboard.account_no_name', { provider: group.label })}
                      </span>
                      {unhealthy && (
                        <Tooltip title={accountErrorTooltip(account, t)}>
                          <Tag
                            color="error"
                            icon={<AlertCircle size={12} className="inline" />}
                            className="m-0! flex items-center gap-1"
                          >
                            {t('dashboard.account_needs_reconnect')}
                          </Tag>
                        </Tooltip>
                      )}
                    </div>
                    {account.username && account.pageName && (
                      <div className="truncate text-xs text-text-muted">@{account.username}</div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {unhealthy && (
                      <>
                        <Button
                          size="small"
                          type="primary"
                          danger
                          loading={reconnectingId === account.id}
                          icon={<RefreshCw size={14} />}
                          onClick={() => handleReconnect(account)}
                        >
                          {t('dashboard.action_reconnect')}
                        </Button>
                        <Button size="small" onClick={() => setDetailsAccount(account)}>
                          {t('social.error_show_details')}
                        </Button>
                      </>
                    )}
                    {!unhealthy && hasComments && (
                      <Button
                        size="small"
                        icon={<MessageCircle size={14} />}
                        onClick={() => onOpenComments(account.provider, account.id)}
                      >
                        {t('dashboard.action_comments')}
                      </Button>
                    )}
                    {!unhealthy && hasMessaging && (
                      <Button
                        size="small"
                        icon={<MessageSquare size={14} />}
                        onClick={() => onOpenMessaging(account.provider, account.id)}
                      >
                        {t('dashboard.action_messaging')}
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      ))}
      {detailsAccount && (
        <SocialAccountErrorDetails
          accountId={detailsAccount.id}
          open={!!detailsAccount}
          onClose={() => setDetailsAccount(null)}
        />
      )}
    </div>
  )
}

/** Short reason shown on hover of the "needs reconnect" badge. */
function accountErrorTooltip(
  account: SocialAccount,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (account.featureDisabled?.length) {
    const features = account.featureDisabled
      .map((f) => (f === 'MESSAGE' ? t('social.feature_messaging') : t('social.feature_comments')))
      .join(', ')
    return t('social.feature_disabled_tooltip', { features })
  }
  return t('social.account_disabled_tooltip')
}

interface NetworkGroup {
  network: string
  label: string
  Icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactNode
  color: string
  accounts: SocialAccount[]
}

const NETWORKS_WITH_COMMENTS = new Set(['FACEBOOK', 'INSTAGRAM', 'TIKTOK'])

const MESSAGING_SCOPES = new Set([
  'messages',
  'whatsapp_business_messaging',
  'whatsapp_business_management',
  'message.list.read',
  'message.list.send',
  'message.list.manage',
])

function accountSupportsMessaging(account: SocialAccount): boolean {
  if (account.provider === 'WHATSAPP') return true
  return (account.scopes ?? []).some((s) => MESSAGING_SCOPES.has(s))
}

function groupByNetwork(accounts: SocialAccount[]): NetworkGroup[] {
  const order = ['WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'TIKTOK']
  const byProvider: Record<string, SocialAccount[]> = {}
  for (const a of accounts) {
    ;(byProvider[a.provider] ??= []).push(a)
  }
  const groups: NetworkGroup[] = []
  for (const provider of order) {
    const items = byProvider[provider]
    if (!items?.length) continue
    groups.push({
      network: provider,
      ...brandingFor(provider),
      accounts: items,
    })
  }
  return groups
}

function brandingFor(provider: string): Omit<NetworkGroup, 'network' | 'accounts'> {
  switch (provider) {
    case 'WHATSAPP':
      return { label: 'WhatsApp', Icon: WhatsAppIcon, color: 'var(--color-brand-whatsapp)' }
    case 'FACEBOOK':
      return { label: 'Facebook', Icon: FacebookIcon, color: 'var(--color-brand-facebook)' }
    case 'INSTAGRAM':
      return { label: 'Instagram', Icon: InstagramIcon, color: 'var(--color-brand-instagram)' }
    case 'TIKTOK':
      return { label: 'TikTok', Icon: TikTokIcon, color: 'var(--color-brand-tiktok)' }
    default:
      return { label: provider, Icon: MessengerIcon, color: 'var(--color-text-muted)' }
  }
}
