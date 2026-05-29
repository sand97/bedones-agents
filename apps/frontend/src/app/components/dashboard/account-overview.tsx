import { Avatar, Button, Card, Typography } from 'antd'
import { MessageCircle, MessageSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  FacebookIcon,
  InstagramIcon,
  MessengerIcon,
  TikTokIcon,
  WhatsAppIcon,
} from '@app/components/icons/social-icons'
import type { components } from '@app/lib/api/v1'

const { Title, Text } = Typography

type SocialAccount = components['schemas']['SocialAccountResponseDto']

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

  const groups = groupByNetwork(accounts)
  // Avoid an unused-var lint when orgSlug isn't read directly (kept in the API
  // for future per-network deep links).
  void orgSlug

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
              return (
                <div
                  key={account.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border-default bg-white p-3"
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
                    <div className="truncate text-sm font-medium text-text-primary">
                      {account.pageName ||
                        account.username ||
                        t('dashboard.account_no_name', { provider: group.label })}
                    </div>
                    {account.username && account.pageName && (
                      <div className="truncate text-xs text-text-muted">@{account.username}</div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {hasComments && (
                      <Button
                        size="small"
                        icon={<MessageCircle size={14} />}
                        onClick={() => onOpenComments(account.provider, account.id)}
                      >
                        {t('dashboard.action_comments')}
                      </Button>
                    )}
                    {hasMessaging && (
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
    </div>
  )
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
