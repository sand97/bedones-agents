import { createFileRoute, Link, useNavigate, useParams } from '@tanstack/react-router'
import { Button, Card, Typography } from 'antd'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { $api } from '@app/lib/api/$api'
import {
  FacebookIcon,
  InstagramIcon,
  TikTokIcon,
  WhatsAppIcon,
  MessengerIcon,
} from '@app/components/icons/social-icons'
import { ArrowRight, MessageCircle, MessageSquare, Sparkles, LucideCircleCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMemo } from 'react'

const { Title, Text } = Typography

export const Route = createFileRoute('/app/$orgSlug/dashboard')({
  component: DashboardPage,
})

const COMMENT_PROVIDERS = [
  {
    key: 'FACEBOOK',
    label: 'Facebook',
    Icon: FacebookIcon,
    color: 'var(--color-brand-facebook)',
    path: 'comments/facebook',
  },
  {
    key: 'INSTAGRAM',
    label: 'Instagram',
    Icon: InstagramIcon,
    color: 'var(--color-brand-instagram)',
    path: 'comments/instagram',
  },
  {
    key: 'TIKTOK',
    label: 'TikTok',
    Icon: TikTokIcon,
    color: 'var(--color-brand-tiktok)',
    path: 'comments/tiktok',
  },
] as const

const MESSAGING_PROVIDERS = [
  {
    key: 'WHATSAPP',
    label: 'WhatsApp',
    Icon: WhatsAppIcon,
    color: 'var(--color-brand-whatsapp)',
    path: 'chats/whatsapp',
  },
  {
    key: 'INSTAGRAM',
    label: 'Instagram',
    Icon: InstagramIcon,
    color: 'var(--color-brand-instagram)',
    path: 'chats/instagram-dm',
  },
  {
    key: 'MESSENGER',
    label: 'Messenger',
    Icon: MessengerIcon,
    color: 'var(--color-brand-messenger)',
    path: 'chats/messenger',
  },
] as const

function DashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { orgSlug } = useParams({ strict: false }) as { orgSlug: string }

  const accountsQuery = $api.useQuery('get', '/social/accounts/{organisationId}', {
    params: { path: { organisationId: orgSlug } },
  })

  const connectedProviders = useMemo(() => {
    const set = new Set<string>()
    for (const account of accountsQuery.data ?? []) {
      set.add(account.provider)
      if (account.scopes?.includes('messages')) {
        if (account.provider === 'FACEBOOK') set.add('MESSENGER')
        if (account.provider === 'INSTAGRAM') set.add('INSTAGRAM_DM')
      }
      if (account.provider === 'WHATSAPP') set.add('WHATSAPP')
    }
    return set
  }, [accountsQuery.data])

  const isConnected = (provider: string) => {
    if (provider === 'MESSENGER') return connectedProviders.has('MESSENGER')
    if (provider === 'WHATSAPP') return connectedProviders.has('WHATSAPP')
    return connectedProviders.has(provider)
  }

  return (
    <div>
      <DashboardHeader title={t('dashboard.title')} />
      <div className="flex flex-col gap-6 p-4 md:p-6">
        {/* Welcome section */}
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-bg-subtle">
            <Sparkles size={24} className="text-text-muted" />
          </div>
          <Title level={4} style={{ margin: 0 }}>
            {t('dashboard.welcome_title')}
          </Title>
          <Text type="secondary" className="max-w-lg">
            {t('dashboard.welcome_description')}
          </Text>
        </div>

        {/* Comments + Messaging — side by side */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Comments card */}
          <Card>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-subtle">
                  <MessageCircle size={20} className="text-text-muted" />
                </div>
                <div>
                  <Title level={5} style={{ margin: 0 }}>
                    {t('dashboard.comments_title')}
                  </Title>
                  <Text type="secondary">{t('dashboard.comments_description')}</Text>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {COMMENT_PROVIDERS.map(({ key, label, Icon, color, path }) => {
                  const connected = isConnected(key)
                  return (
                    <Button
                      key={key}
                      variant="outlined"
                      icon={<Icon width={18} height={18} style={{ color }} />}
                      style={{ justifyContent: 'flex-start', gap: 8 }}
                      onClick={() =>
                        navigate({ to: `/app/$orgSlug/${path}` as string, params: { orgSlug } })
                      }
                    >
                      <span className="flex-1 text-left">{label}</span>
                      {connected ? (
                        <LucideCircleCheck strokeWidth={2} width={16} height={16} />
                      ) : (
                        <ArrowRight size={16} />
                      )}
                    </Button>
                  )
                })}
              </div>
            </div>
          </Card>

          {/* Messaging card */}
          <Card>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-subtle">
                  <MessageSquare size={20} className="text-text-muted" />
                </div>
                <div>
                  <Title level={5} style={{ margin: 0 }}>
                    {t('dashboard.messaging_title')}
                  </Title>
                  <Text type="secondary">{t('dashboard.messaging_description')}</Text>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {MESSAGING_PROVIDERS.map(({ key, label, Icon, color, path }) => {
                  const connected = isConnected(key)
                  return (
                    <Button
                      key={key}
                      variant="outlined"
                      icon={<Icon width={18} height={18} style={{ color }} />}
                      onClick={() =>
                        navigate({ to: `/app/$orgSlug/${path}` as string, params: { orgSlug } })
                      }
                    >
                      <span className="flex-1 text-left">{label}</span>
                      {connected ? (
                        <LucideCircleCheck strokeWidth={2} width={16} height={16} />
                      ) : (
                        <ArrowRight size={16} />
                      )}
                    </Button>
                  )
                })}
              </div>
            </div>
          </Card>
        </div>

        {/* Agent creation section */}
        <Card>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-bg-subtle">
              <Sparkles size={24} className="text-text-muted" />
            </div>
            <Title level={4} style={{ margin: 0 }}>
              {t('dashboard.agent_title')}
            </Title>
            <Text type="secondary" className="max-w-xl">
              {t('dashboard.agent_description')}{' '}
              <Link
                to="/app/$orgSlug/members"
                params={{ orgSlug }}
                className="text-text-primary underline"
              >
                {t('dashboard.agent_members_link')}
              </Link>
              {t('dashboard.agent_description_2')}
            </Text>
            <Link to="/app/$orgSlug/agents" params={{ orgSlug }}>
              <Button
                icon={<Sparkles width={16} strokeWidth={1.5} />}
                iconPosition={'start'}
                type={'primary'}
              >
                {t('chat.configure_agent_btn')}
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  )
}
