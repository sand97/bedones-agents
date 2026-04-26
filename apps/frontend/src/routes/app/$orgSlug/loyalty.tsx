import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFileRoute, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Segmented } from 'antd'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { SocialSetup } from '@app/components/social/social-setup'
import { AccountSwitcher, type SocialAccount } from '@app/components/social/account-switcher'
import { WhatsAppIcon } from '@app/components/icons/social-icons'
import { $api } from '@app/lib/api/$api'
import { LoyaltyContactsTab } from '@app/components/loyalty/loyalty-contacts-tab'
import { LoyaltyBonusTab } from '@app/components/loyalty/loyalty-bonus-tab'
import { LoyaltyCampaignsTab } from '@app/components/loyalty/loyalty-campaigns-tab'
import { launchWhatsAppSignup } from '@app/lib/facebook-sdk'
import { useQueryClient } from '@tanstack/react-query'

const VALID_TABS = ['contacts', 'bonus', 'campaigns'] as const
type LoyaltyTab = (typeof VALID_TABS)[number]

export const Route = createFileRoute('/app/$orgSlug/loyalty')({
  component: LoyaltyPage,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: VALID_TABS.includes(search.tab as LoyaltyTab) ? (search.tab as LoyaltyTab) : undefined,
    account: (search.account as string) || undefined,
    templates: search.templates === '1' || search.templates === 1 ? '1' : undefined,
  }),
})

const ICON_SIZE = 40

function LoyaltyPage() {
  const { t } = useTranslation()
  const { orgSlug } = useParams({ strict: false }) as { orgSlug: string }
  const search = useSearch({ from: '/app/$orgSlug/loyalty' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [connecting, setConnecting] = useState(false)

  const updateSearch = useCallback(
    (updates: Record<string, string | undefined>) => {
      navigate({
        search: (prev: Record<string, unknown>) => ({ ...prev, ...updates }) as never,
        replace: true,
      })
    },
    [navigate],
  )

  const activeTab: LoyaltyTab = search.tab ?? 'contacts'

  const accountsQuery = $api.useQuery('get', '/social/accounts/{organisationId}', {
    params: { path: { organisationId: orgSlug } },
  })

  const whatsappAccounts = useMemo(
    () => (accountsQuery.data ?? []).filter((a) => a.provider === 'WHATSAPP'),
    [accountsQuery.data],
  )

  const currentAccount =
    whatsappAccounts.find((a) => a.id === search.account) || whatsappAccounts[0] || null

  // Sync URL with first available account when none selected (or selected one is gone)
  useEffect(() => {
    if (whatsappAccounts.length === 0) return
    if (!search.account || !whatsappAccounts.some((a) => a.id === search.account)) {
      updateSearch({ account: whatsappAccounts[0].id })
    }
  }, [whatsappAccounts, search.account, updateSearch])

  const connectMutation = $api.useMutation('post', '/social/connect/whatsapp')

  const handleConnect = async () => {
    setConnecting(true)
    try {
      const appId = import.meta.env.VITE_FACEBOOK_APP_ID
      const waConfigId = import.meta.env.VITE_WHATSAPP_CONFIGGURATION_ID
      if (!appId || !waConfigId) return
      const { loginResponse, sessionInfo } = await launchWhatsAppSignup(appId, waConfigId)
      if (!loginResponse.authResponse?.code) return
      await connectMutation.mutateAsync({
        body: {
          organisationId: orgSlug,
          code: loginResponse.authResponse.code,
          wabaId: sessionInfo.waba_id,
          phoneNumberId: sessionInfo.phone_number_id,
        },
      })
      queryClient.invalidateQueries({
        queryKey: ['get', '/social/accounts/{organisationId}'],
      })
    } catch (err) {
      console.error('[Loyalty] Connect WhatsApp failed:', err)
    } finally {
      setConnecting(false)
    }
  }

  // ─── No account → SocialSetup ───
  if (accountsQuery.isLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <DashboardHeader title={t('loyalty.title')} />
      </div>
    )
  }

  if (whatsappAccounts.length === 0) {
    return (
      <div className="flex min-h-screen flex-col">
        <DashboardHeader title={t('loyalty.title')} />
        <SocialSetup
          icon={<WhatsAppIcon width={ICON_SIZE} height={ICON_SIZE} />}
          color="var(--color-brand-whatsapp)"
          title={t('loyalty.setup_title')}
          description={t('loyalty.setup_desc')}
          buttonLabel={t('loyalty.setup_btn')}
          loading={connecting}
          onAction={handleConnect}
        />
      </div>
    )
  }

  if (!currentAccount) return null

  const accountSwitcherItems: SocialAccount[] = whatsappAccounts.map((a) => ({
    id: a.id,
    name: a.pageName || a.username || a.providerAccountId,
    avatarUrl: a.profilePictureUrl ?? undefined,
  }))
  const currentSwitcherItem =
    accountSwitcherItems.find((a) => a.id === currentAccount.id) || accountSwitcherItems[0]

  const templatesOpen = search.templates === '1'

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        title={t('loyalty.title')}
        action={
          <AccountSwitcher
            accounts={accountSwitcherItems}
            currentAccount={currentSwitcherItem}
            connectLabel={t('loyalty.connect_label')}
            icon={<WhatsAppIcon width={20} height={20} />}
            onSwitch={(a) => updateSearch({ account: a.id })}
            onConnect={handleConnect}
          />
        }
      />

      <div className="flex-1 p-4 pb-16 lg:p-6 lg:pb-16">
        <div className="mb-4">
          <Segmented
            className="pricing-billing-toggle"
            value={activeTab}
            onChange={(val) => updateSearch({ tab: val as LoyaltyTab })}
            options={[
              { label: t('loyalty.tab_contacts'), value: 'contacts' },
              { label: t('loyalty.tab_bonus'), value: 'bonus' },
              { label: t('loyalty.tab_campaigns'), value: 'campaigns' },
            ]}
          />
        </div>

        {activeTab === 'contacts' && (
          <LoyaltyContactsTab socialAccountId={currentAccount.id} orgSlug={orgSlug} />
        )}
        {activeTab === 'bonus' && (
          <LoyaltyBonusTab socialAccountId={currentAccount.id} orgSlug={orgSlug} />
        )}
        {activeTab === 'campaigns' && (
          <LoyaltyCampaignsTab
            socialAccountId={currentAccount.id}
            templatesOpen={templatesOpen}
            onTemplatesOpenChange={(open) => updateSearch({ templates: open ? '1' : undefined })}
          />
        )}
      </div>
    </div>
  )
}
