import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFileRoute, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { usePersistedQuery } from '@app/lib/use-persisted-query'
import { App } from 'antd'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { SocialSetup } from '@app/components/social/social-setup'
import { ChatConfigModal } from '@app/components/whatsapp/chat-config-modal'
import { ConfirmDisconnectModal } from '@app/components/shared/confirm-disconnect-modal'
import { CatalogLinkModal } from '@app/components/whatsapp/catalog-link-modal'
import { CommerceManagerMigrationModal } from '@app/components/catalog/commerce-manager-migration-modal'
import {
  AccountSwitcher,
  formatSocialAccountDescription,
  formatSocialAccountName,
  type SocialAccount,
} from '@app/components/social/account-switcher'
import { ChatLayout } from '@app/components/whatsapp/chat-layout'
import { ProductSendModal } from '@app/components/whatsapp/product-send-modal'
import { CatalogSendModal } from '@app/components/whatsapp/catalog-send-modal'
import { TemplateMessageModal } from '@app/components/whatsapp/template-message-modal'
import { TikTokMessageModal } from '@app/components/tiktok/tiktok-message-modal'
import { LoyaltyTemplateModal } from '@app/components/loyalty/loyalty-template-modal'
import { useLayout } from '@app/contexts/layout-context'
import { $api } from '@app/lib/api/$api'
import { agentApi, socialApi, type Agent } from '@app/lib/api/agent-api'
import { setAuthRedirect, buildTikTokOAuthUrl } from '@app/lib/auth-redirect'
import { useTikTokBusinessCheck } from '@app/hooks/use-tiktok-business-check'
import { TikTokBusinessGuideModal } from '@app/components/tiktok/tiktok-business-guide-modal'
import { getStoredChatAccount, setStoredChatAccount } from '@app/lib/chat-account-storage'
import { readCatalogMigrationDraft } from '@app/lib/catalog-migration-draft'
import type { Conversation } from '@app/components/whatsapp/mock-data'
import {
  CHAT_CONFIG,
  PROVIDER_MAP,
  MobileBackButton,
} from '@app/components/whatsapp/chats/chat-config'
import { mapApiConversation } from '@app/components/whatsapp/chats/map-api-conversation'
import { useChatMessaging } from '@app/components/whatsapp/chats/use-chat-messaging'
import { useChatCatalog } from '@app/components/whatsapp/chats/use-chat-catalog'
import { useChatConnect } from '@app/components/whatsapp/chats/use-chat-connect'

export const Route = createFileRoute('/app/$orgSlug/chats/$id')({
  component: ChatsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    conv: (search.conv as string) || undefined,
    ticket: (search.ticket as string) || undefined,
  }),
})

function ChatsPage() {
  const { t } = useTranslation()
  const { id, orgSlug } = useParams({ from: '/app/$orgSlug/chats/$id' })
  const search = useSearch({ from: '/app/$orgSlug/chats/$id' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isDesktop } = useLayout()
  const rawConfig = CHAT_CONFIG[id]
  const config = rawConfig
    ? {
        ...rawConfig,
        title: t(rawConfig.titleKey),
        description: t(rawConfig.descriptionKey),
        button: t(rawConfig.buttonKey),
        connectLabel: t(rawConfig.connectLabelKey),
      }
    : null
  const title = config?.label || `Messagerie — ${id}`

  const hasSelectedConv = !!search.conv

  const { message } = App.useApp()
  const [chatConfigOpen, setChatConfigOpen] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const [catalogLinkOpen, setCatalogLinkOpen] = useState(false)
  const [productSendOpen, setProductSendOpen] = useState(false)
  const [catalogSendOpen, setCatalogSendOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [templateMessageOpen, setTemplateMessageOpen] = useState(false)
  const [tiktokMessageOpen, setTikTokMessageOpen] = useState(false)
  const [migrationOpen, setMigrationOpen] = useState(false)

  // Resume the catalogue-migration wizard after the Meta connect redirect.
  useEffect(() => {
    if (readCatalogMigrationDraft().open) setMigrationOpen(true)
  }, [])

  // ─── Agents query: check if any agent covers the current provider ───
  const agentsQuery = usePersistedQuery<Agent[]>({
    queryKey: ['agents', orgSlug],
    queryFn: () => agentApi.list(orgSlug),
    staleTime: 60_000,
  })

  const hasReadyAgent = useMemo(() => {
    const agents = agentsQuery.data || []
    const provider = PROVIDER_MAP[id]
    return agents.some(
      (a) =>
        ['READY', 'ACTIVE'].includes(a.status) &&
        a.socialAccounts.some((sa) => sa.socialAccount.provider === provider),
    )
  }, [agentsQuery.data, id])

  // ─── Accounts query ───
  const accountsQuery = $api.useQuery('get', '/social/accounts/{organisationId}', {
    params: { path: { organisationId: orgSlug } },
  })

  const accounts = useMemo(
    () =>
      (accountsQuery.data ?? []).filter((a) => {
        if (a.provider !== config?.provider) return false
        // WhatsApp accounts are always messaging accounts — no scope check needed
        if (a.provider === 'WHATSAPP') return true
        if (a.provider === 'TIKTOK') {
          return (
            a.scopes?.includes('messages') ||
            a.scopes?.includes('message.list.read') ||
            a.scopes?.includes('message.list.send') ||
            a.scopes?.includes('message.list.manage')
          )
        }
        return a.scopes?.includes('messages')
      }),
    [accountsQuery.data, config?.provider],
  )

  const urlAccountId = (search as { account?: string }).account
  const currentAccountId = useMemo(() => {
    if (urlAccountId) return urlAccountId
    const stored = getStoredChatAccount(id)
    if (stored && accounts.some((a) => a.id === stored)) return stored
    return accounts[0]?.id || null
  }, [urlAccountId, accounts, id])
  const currentAccount = accounts.find((a) => a.id === currentAccountId) || accounts[0] || null

  // Persist the active account per channel so navigating away & back restores it.
  useEffect(() => {
    if (currentAccountId) setStoredChatAccount(id, currentAccountId)
  }, [id, currentAccountId])

  // ─── TikTok Business account check ───
  const { showBusinessGuide, closeGuide } = useTikTokBusinessCheck(
    currentAccountId,
    config?.provider,
  )

  // ─── Catalog / commerce state ───
  const { commerceQuery, catalogsQuery, hasCatalogAssociated, canMigrateCatalog, linkedCatalog } =
    useChatCatalog({ id, orgSlug, currentAccount, currentAccountId })

  // Auto-select first account
  const setAccountInUrl = useCallback(
    (accountId: string) => {
      navigate({
        search: (prev: Record<string, unknown>) =>
          ({ ...prev, account: accountId, conv: undefined }) as never,
        replace: true,
      })
    },
    [navigate],
  )

  if (accounts.length > 0 && !currentAccountId) {
    setAccountInUrl(accounts[0].id)
  }

  // ─── Conversations query ───
  const conversationsQuery = $api.useQuery(
    'get',
    '/messaging/conversations/{accountId}',
    { params: { path: { accountId: currentAccountId! } } },
    { enabled: !!currentAccountId },
  )

  // ─── Messages query for selected conversation ───
  const messagesQuery = $api.useQuery(
    'get',
    '/messaging/conversations/{conversationId}/messages',
    { params: { path: { conversationId: search.conv! } } },
    { enabled: !!search.conv },
  )

  // ─── Messaging logic (optimistic send, retry, mark-read, …) ───
  const {
    sendMutation,
    sendTemplateMutation,
    handleTyping,
    handleSend,
    handleUploadAndSend,
    handleRetry,
    handleChatClick,
    handleSendProducts,
    handleSendTemplate,
    handleSendTikTokRichMessage,
  } = useChatMessaging({
    convId: search.conv,
    currentAccountId,
    conversationsData: conversationsQuery.data,
    id,
    orgSlug,
    setTikTokMessageOpen,
  })

  // ─── Map conversations to ChatLayout format ───
  const apiConversations: Conversation[] = useMemo(() => {
    if (!conversationsQuery.data) return []

    return conversationsQuery.data.map((conv) => {
      const isSelected = search.conv === conv.id
      const msgs = isSelected && messagesQuery.data ? messagesQuery.data : []
      return mapApiConversation(
        conv as Parameters<typeof mapApiConversation>[0],
        msgs as Parameters<typeof mapApiConversation>[1],
        id,
      )
    })
  }, [conversationsQuery.data, messagesQuery.data, search.conv, id])

  const handleConfigureAgent = useCallback(() => {
    navigate({ to: '/app/$orgSlug/agents' as string, params: { orgSlug } })
  }, [navigate, orgSlug])

  const handleDisconnect = async () => {
    if (!currentAccount) return
    await socialApi.disconnect(currentAccount.id)
    message.success(t('chat.disconnect_success'))
    // The account is now hidden from the list — drop it from the URL and refetch
    // so the page falls back to another account (or the setup screen).
    queryClient.invalidateQueries({ queryKey: ['get', '/social/accounts/{organisationId}'] })
    navigate({
      search: (prev: Record<string, unknown>) =>
        ({ ...prev, account: undefined, conv: undefined }) as never,
      replace: true,
    })
  }

  const handleSelectConv = (convId: string) => {
    navigate({
      search: (prev: Record<string, unknown>) => ({ ...prev, conv: convId }) as never,
    })
  }

  // ─── Connect flow ───
  const { connecting, handleConnect } = useChatConnect({ id, orgSlug })

  // ─── Not found ───
  if (!config) {
    return (
      <div className="flex min-h-screen flex-col">
        <DashboardHeader title={title} />
        <div className="flex flex-1 items-center justify-center text-text-muted">
          {t('comments.page_not_found')}
        </div>
      </div>
    )
  }

  // ─── Loading ───
  if (accountsQuery.isLoading) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <DashboardHeader title={config.label} mobileTitle={config.mobileLabel} />
        <ChatLayout
          conversations={[]}
          loading
          provider={id as 'whatsapp' | 'instagram-dm' | 'messenger' | 'tiktok'}
        />
      </div>
    )
  }

  // ─── No account → Setup ───
  const hasAccounts = accounts.length > 0
  if (!hasAccounts) {
    return (
      <div className="flex min-h-screen flex-col">
        <DashboardHeader title={config.label} mobileTitle={config.mobileLabel} />
        <SocialSetup
          icon={config.icon}
          color={config.color}
          title={config.title}
          description={config.description}
          buttonLabel={config.button}
          loading={connecting}
          onAction={handleConnect}
        />
      </div>
    )
  }

  // ─── Account switcher ───
  const accountSwitcherItems: SocialAccount[] = accounts.map((a) => ({
    id: a.id,
    name: formatSocialAccountName(a),
    description: formatSocialAccountDescription(a),
    avatarUrl: a.profilePictureUrl ?? undefined,
  }))
  const currentSwitcherItem =
    accountSwitcherItems.find((a) => a.id === currentAccountId) || accountSwitcherItems[0]

  // ─── Full chat UI ───
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]">
      <DashboardHeader
        title={config.label}
        mobileTitle={config.mobileLabel}
        action={
          <div className="flex items-center gap-2">
            <AccountSwitcher
              accounts={accountSwitcherItems}
              currentAccount={currentSwitcherItem}
              connectLabel={config.connectLabel}
              onSwitch={(a) => setAccountInUrl(a.id)}
              onConnect={handleConnect}
            />
          </div>
        }
        mobileLeft={hasSelectedConv && !isDesktop ? <MobileBackButton /> : undefined}
      />
      <ChatLayout
        conversations={apiConversations}
        loading={conversationsQuery.isLoading}
        provider={id as 'whatsapp' | 'instagram-dm' | 'messenger' | 'tiktok'}
        onSend={handleSend}
        onUploadAndSend={handleUploadAndSend}
        onTyping={handleTyping}
        onSelectConversation={handleSelectConv}
        onRetry={handleRetry}
        onChatClick={handleChatClick}
        hasReadyAgent={hasReadyAgent}
        hasCatalogAssociated={id !== 'whatsapp' || hasCatalogAssociated}
        onConfigureAgent={handleConfigureAgent}
        onConfigureCatalog={() => setCatalogLinkOpen(true)}
        canMigrateCatalog={canMigrateCatalog}
        onMigrateCatalog={() => setMigrationOpen(true)}
        onOpenOptions={() => setChatConfigOpen(true)}
        onDisconnect={() => setDisconnectOpen(true)}
        onOpenTemplates={() => setTemplatesOpen(true)}
        onOpenCampaigns={() => {
          if (!currentAccount?.id) return
          navigate({
            to: '/app/$orgSlug/$socialAccountId/campaigns' as string,
            params: { orgSlug, socialAccountId: currentAccount.id },
          })
        }}
        socialAccountId={currentAccount?.id}
        hasCatalogForProducts={!!linkedCatalog}
        onProductClick={() => setProductSendOpen(true)}
        onCatalogClick={() => setCatalogSendOpen(true)}
        onTemplateClick={() => setTemplateMessageOpen(true)}
        onTikTokMessageClick={() => setTikTokMessageOpen(true)}
      />
      {currentAccount && (
        <>
          <ChatConfigModal
            open={chatConfigOpen}
            onClose={() => setChatConfigOpen(false)}
            provider={id as 'whatsapp' | 'instagram-dm' | 'messenger' | 'tiktok'}
            socialAccountId={currentAccount.id}
            organisationId={orgSlug}
            catalogs={catalogsQuery.data || []}
            phoneNumberId={id === 'whatsapp' ? currentAccount.providerAccountId : undefined}
            commerceData={
              id === 'whatsapp'
                ? (commerceQuery.data as { data: { id: string; name: string }[] } | undefined)
                : undefined
            }
            onOpenCatalogLink={
              id === 'whatsapp'
                ? () => {
                    setChatConfigOpen(false)
                    setCatalogLinkOpen(true)
                  }
                : undefined
            }
          />
          <ConfirmDisconnectModal
            open={disconnectOpen}
            onClose={() => setDisconnectOpen(false)}
            onConfirm={handleDisconnect}
            resourceLabel={
              currentAccount.pageName || currentAccount.username || currentAccount.providerAccountId
            }
            title={t('chat.disconnect_title')}
            description={t('chat.disconnect_confirm')}
          />
        </>
      )}
      {id === 'whatsapp' && currentAccount && (
        <>
          <CatalogLinkModal
            open={catalogLinkOpen}
            onClose={() => setCatalogLinkOpen(false)}
            phoneNumberId={currentAccount.providerAccountId}
            accountName={
              currentAccount.pageName || currentAccount.username || currentAccount.providerAccountId
            }
            catalogs={catalogsQuery.data || []}
          />
          <CommerceManagerMigrationModal
            open={migrationOpen}
            orgSlug={orgSlug}
            presetAccountId={currentAccount.id}
            onClose={() => setMigrationOpen(false)}
          />
          <LoyaltyTemplateModal
            open={templatesOpen}
            onClose={() => setTemplatesOpen(false)}
            socialAccountId={currentAccount.id}
            defaultFooter={
              currentAccount.pageName || currentAccount.username || currentAccount.providerAccountId
            }
          />
          <TemplateMessageModal
            open={templateMessageOpen}
            onClose={() => setTemplateMessageOpen(false)}
            socialAccountId={currentAccount.id}
            defaultFooter={
              currentAccount.pageName || currentAccount.username || currentAccount.providerAccountId
            }
            onSend={handleSendTemplate}
            loading={sendTemplateMutation.isPending}
          />
          {linkedCatalog && (
            <>
              <ProductSendModal
                open={productSendOpen}
                onClose={() => setProductSendOpen(false)}
                catalog={linkedCatalog}
                onSend={handleSendProducts}
              />
              <CatalogSendModal
                open={catalogSendOpen}
                onClose={() => setCatalogSendOpen(false)}
                catalog={linkedCatalog}
                onSend={handleSendProducts}
              />
            </>
          )}
        </>
      )}
      {id === 'tiktok' && (
        <TikTokMessageModal
          open={tiktokMessageOpen}
          onClose={() => setTikTokMessageOpen(false)}
          onSend={handleSendTikTokRichMessage}
          loading={sendMutation.isPending}
        />
      )}
      {id === 'tiktok' && (
        <TikTokBusinessGuideModal
          open={showBusinessGuide}
          onClose={closeGuide}
          onRetry={() => {
            setAuthRedirect({
              intent: 'connect_pages',
              orgId: orgSlug,
              provider: 'tiktok',
              pageId: 'tiktok',
              scopes: ['messages', 'message.list.read', 'message.list.send', 'message.list.manage'],
              returnTo: window.location.pathname,
            })
            window.location.href = buildTikTokOAuthUrl('messages')
          }}
        />
      )}
    </div>
  )
}
