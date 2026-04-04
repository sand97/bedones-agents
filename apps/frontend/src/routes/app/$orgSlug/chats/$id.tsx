import type { ReactNode } from 'react'
import { useCallback, useMemo, useState } from 'react'
import { createFileRoute, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from 'antd'
import { ArrowLeft } from 'lucide-react'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { SocialSetup } from '@app/components/social/social-setup'
import { AccountSwitcher, type SocialAccount } from '@app/components/social/account-switcher'
import { ChatLayout } from '@app/components/whatsapp/chat-layout'
import { MOCK_CONVERSATIONS } from '@app/components/whatsapp/mock-data'
import { WhatsAppIcon, InstagramIcon, MessengerIcon } from '@app/components/icons/social-icons'
import { useLayout } from '@app/contexts/layout-context'
import { $api } from '@app/lib/api/$api'
import {
  setAuthRedirect,
  buildFacebookOAuthUrl,
  buildInstagramOAuthUrl,
} from '@app/lib/auth-redirect'
import type { Conversation } from '@app/components/whatsapp/mock-data'

export const Route = createFileRoute('/app/$orgSlug/chats/$id')({
  component: ChatsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    conv: (search.conv as string) || undefined,
    ticket: (search.ticket as string) || undefined,
  }),
})

const ICON_SIZE = 40

const CHAT_CONFIG: Record<
  string,
  {
    label: string
    mobileLabel: string
    icon: ReactNode
    color: string
    title: string
    description: string
    button: string
    connectLabel: string
    provider: 'FACEBOOK' | 'INSTAGRAM'
  }
> = {
  whatsapp: {
    label: 'WhatsApp',
    mobileLabel: 'WhatsApp',
    icon: <WhatsAppIcon width={ICON_SIZE} height={ICON_SIZE} />,
    color: 'var(--color-brand-whatsapp)',
    title: 'Connecter un numéro Whatsapp',
    description:
      'Associez votre compte WhatsApp Business via Facebook Cloud API pour centraliser vos conversations et répondre à vos clients directement depuis Bedones.',
    button: 'Connecter un numéro WhatsApp',
    connectLabel: 'Connecter un numéro',
    provider: 'FACEBOOK',
  },
  'instagram-dm': {
    label: 'Messages Instagram',
    mobileLabel: 'Instagram DM',
    icon: <InstagramIcon width={ICON_SIZE} height={ICON_SIZE} />,
    color: 'var(--color-brand-instagram)',
    title: 'Connecter Instagram Direct',
    description:
      'Reliez votre compte Instagram professionnel pour recevoir et répondre aux messages directs de vos clients depuis Bedones.',
    button: 'Connecter un compte Instagram',
    connectLabel: 'Connecter un compte',
    provider: 'INSTAGRAM',
  },
  messenger: {
    label: 'Messenger',
    mobileLabel: 'Messenger',
    icon: <MessengerIcon width={ICON_SIZE} height={ICON_SIZE} />,
    color: 'var(--color-brand-messenger)',
    title: 'Connecter Messenger',
    description:
      'Reliez votre page Facebook pour gérer les conversations Messenger de vos clients directement depuis Bedones.',
    button: 'Connecter une page Facebook',
    connectLabel: 'Connecter une page',
    provider: 'FACEBOOK',
  },
}

const MOCK_WA_ACCOUNTS: SocialAccount[] = [
  { id: '1', name: '+237 691 000 001' },
  { id: '2', name: '+237 655 000 002' },
]

/* ── Mobile back button ── */

function MobileBackButton() {
  const navigate = useNavigate()

  return (
    <Button
      type="text"
      onClick={() => navigate({ search: {} as never })}
      icon={<ArrowLeft size={18} strokeWidth={1.5} />}
      className="p-0!"
    >
      Chats
    </Button>
  )
}

/** Map API conversation to ChatLayout Conversation type */
function mapApiConversation(
  conv: {
    id: string
    participantId: string
    participantName: string
    participantAvatar?: string | null
    lastMessageText?: string | null
    lastMessageAt?: string | null
    unreadCount: number
  },
  messages: Array<{
    id: string
    message: string
    senderId: string
    senderName: string
    isFromPage: boolean
    mediaUrl?: string | null
    mediaType?: string | null
    createdTime: string
    isRead: boolean
  }>,
): Conversation {
  return {
    id: conv.id,
    contact: {
      id: conv.participantId,
      name: conv.participantName,
      phone: '',
      avatar: conv.participantAvatar ?? undefined,
    },
    messages: messages.map((m) => ({
      id: m.id,
      type: (m.mediaType as 'text' | 'image' | 'video' | 'audio') || 'text',
      content: m.message,
      timestamp: m.createdTime,
      isOutgoing: m.isFromPage,
      mediaUrl: m.mediaUrl ?? undefined,
    })),
    unreadCount: conv.unreadCount,
    labels: [],
    lastMessage: conv.lastMessageText || '',
    lastMessageTime: conv.lastMessageAt || new Date().toISOString(),
  }
}

function ChatsPage() {
  const { id, orgSlug } = useParams({ from: '/app/$orgSlug/chats/$id' })
  const search = useSearch({ from: '/app/$orgSlug/chats/$id' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isDesktop } = useLayout()
  const config = CHAT_CONFIG[id]
  const title = config?.label || `Messagerie — ${id}`

  const hasSelectedConv = !!search.conv

  const [connecting, setConnecting] = useState(false)

  // ─── Accounts query (for Messenger & Instagram DM) ───
  const accountsQuery = $api.useQuery(
    'get',
    '/social/accounts/{organisationId}',
    { params: { path: { organisationId: orgSlug } } },
    { enabled: id !== 'whatsapp' },
  )

  const accounts = useMemo(
    () =>
      (accountsQuery.data ?? []).filter(
        (a) => a.provider === config?.provider && a.scopes?.includes('messages'),
      ),
    [accountsQuery.data, config?.provider],
  )

  const currentAccountId = (search as { account?: string }).account || accounts[0]?.id || null

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

  if (id !== 'whatsapp' && accounts.length > 0 && !currentAccountId) {
    setAccountInUrl(accounts[0].id)
  }

  // ─── Conversations query ───
  const conversationsQuery = $api.useQuery(
    'get',
    '/messaging/conversations/{accountId}',
    { params: { path: { accountId: currentAccountId! } } },
    { enabled: id !== 'whatsapp' && !!currentAccountId },
  )

  // ─── Messages query for selected conversation ───
  const messagesQuery = $api.useQuery(
    'get',
    '/messaging/conversations/{conversationId}/messages',
    { params: { path: { conversationId: search.conv! } } },
    { enabled: id !== 'whatsapp' && !!search.conv },
  )

  // ─── Send mutation ───
  const sendMutation = $api.useMutation('post', '/messaging/send')
  const markReadMutation = $api.useMutation('post', '/messaging/mark-read')
  const syncMutation = $api.useMutation('post', '/messaging/sync/{accountId}')

  // ─── Map conversations to ChatLayout format ───
  const apiConversations: Conversation[] = useMemo(() => {
    if (id === 'whatsapp' || !conversationsQuery.data) return []

    return conversationsQuery.data.map((conv) => {
      const isSelected = search.conv === conv.id
      const msgs = isSelected && messagesQuery.data ? messagesQuery.data : []
      return mapApiConversation(
        conv as Parameters<typeof mapApiConversation>[0],
        msgs as Parameters<typeof mapApiConversation>[1],
      )
    })
  }, [conversationsQuery.data, messagesQuery.data, search.conv, id])

  // ─── Handlers ───
  const handleSend = async (message: string) => {
    if (!search.conv) return
    await sendMutation.mutateAsync({ body: { conversationId: search.conv, message } })
    // Invalidate messages and conversations
    queryClient.invalidateQueries({
      queryKey: ['get', '/messaging/conversations/{conversationId}/messages'],
    })
    queryClient.invalidateQueries({
      queryKey: ['get', '/messaging/conversations/{accountId}'],
    })
  }

  const handleSelectConv = (convId: string) => {
    navigate({
      search: (prev: Record<string, unknown>) => ({ ...prev, conv: convId }) as never,
    })
    // Mark as read
    markReadMutation.mutate({ body: { conversationId: convId } })
  }

  const handleSync = () => {
    if (!currentAccountId) return
    syncMutation.mutate(
      { params: { path: { accountId: currentAccountId } } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: ['get', '/messaging/conversations/{accountId}'],
          })
        },
      },
    )
  }

  const handleConnect = () => {
    setConnecting(true)

    if (id === 'messenger') {
      setAuthRedirect({
        intent: 'connect_pages',
        orgId: orgSlug,
        provider: 'facebook',
        pageId: 'messenger',
        scopes: ['messages'],
      })
      const configId = import.meta.env.VITE_FB_MESSAGES_CONFIGGURATION_ID
      if (!configId) {
        setConnecting(false)
        return
      }
      window.location.href = buildFacebookOAuthUrl(configId)
    } else if (id === 'instagram-dm') {
      setAuthRedirect({
        intent: 'connect_pages',
        orgId: orgSlug,
        provider: 'instagram',
        igScope: 'messages',
        pageId: 'instagram-dm',
        scopes: ['messages'],
      })
      window.location.href = buildInstagramOAuthUrl('messages')
    }
  }

  // ─── Not found ───
  if (!config) {
    return (
      <div className="flex min-h-screen flex-col">
        <DashboardHeader title={title} />
        <div className="flex flex-1 items-center justify-center text-text-muted">
          Page introuvable
        </div>
      </div>
    )
  }

  // ─── WhatsApp: full chat UI with mock data ───
  if (id === 'whatsapp') {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <DashboardHeader
          title={config.label}
          mobileTitle={config.mobileLabel}
          action={
            <AccountSwitcher
              accounts={MOCK_WA_ACCOUNTS}
              currentAccount={MOCK_WA_ACCOUNTS[0]}
              connectLabel={config.connectLabel}
              icon={<WhatsAppIcon width={18} height={18} className="text-brand-whatsapp" />}
            />
          }
          mobileLeft={hasSelectedConv && !isDesktop ? <MobileBackButton /> : undefined}
        />
        <ChatLayout conversations={MOCK_CONVERSATIONS} />
      </div>
    )
  }

  // ─── Loading ───
  if (accountsQuery.isLoading) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <DashboardHeader title={config.label} mobileTitle={config.mobileLabel} />
        <ChatLayout conversations={[]} loading />
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
    name: a.pageName || a.username || a.providerAccountId,
    avatarUrl: a.profilePictureUrl ?? undefined,
  }))
  const currentSwitcherItem =
    accountSwitcherItems.find((a) => a.id === currentAccountId) || accountSwitcherItems[0]

  // ─── Full chat UI ───
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <DashboardHeader
        title={config.label}
        mobileTitle={config.mobileLabel}
        action={
          <AccountSwitcher
            accounts={accountSwitcherItems}
            currentAccount={currentSwitcherItem}
            connectLabel={config.connectLabel}
            onSwitch={(a) => setAccountInUrl(a.id)}
            onConnect={handleConnect}
          />
        }
        mobileLeft={hasSelectedConv && !isDesktop ? <MobileBackButton /> : undefined}
      />
      <ChatLayout
        conversations={apiConversations}
        loading={conversationsQuery.isLoading}
        onSend={handleSend}
        onSelectConversation={handleSelectConv}
        onSync={handleSync}
        syncing={syncMutation.isPending}
      />
    </div>
  )
}
