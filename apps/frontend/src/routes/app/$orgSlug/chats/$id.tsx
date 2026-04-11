import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usePersistedQuery } from '@app/lib/use-persisted-query'
import { Button } from 'antd'
import { ArrowLeft } from 'lucide-react'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { SocialSetup } from '@app/components/social/social-setup'
import { WhatsappConfigModal } from '@app/components/whatsapp/whatsapp-config-modal'
import { CatalogLinkModal } from '@app/components/whatsapp/catalog-link-modal'
import { AccountSwitcher, type SocialAccount } from '@app/components/social/account-switcher'
import { ChatLayout } from '@app/components/whatsapp/chat-layout'
import { uploadChatMedia } from '@app/lib/api'
import { WhatsAppIcon, InstagramIcon, MessengerIcon } from '@app/components/icons/social-icons'
import { useLayout } from '@app/contexts/layout-context'
import { $api } from '@app/lib/api/$api'
import { agentApi, catalogApi } from '@app/lib/api/agent-api'
import {
  setAuthRedirect,
  buildFacebookOAuthUrl,
  buildInstagramOAuthUrl,
} from '@app/lib/auth-redirect'
import { launchWhatsAppSignup } from '@app/lib/facebook-sdk'
import type { Conversation, Message } from '@app/components/whatsapp/mock-data'

export const Route = createFileRoute('/app/$orgSlug/chats/$id')({
  component: ChatsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    conv: (search.conv as string) || undefined,
    ticket: (search.ticket as string) || undefined,
  }),
})

const ICON_SIZE = 40

interface ChatConfigEntry {
  label: string
  mobileLabel: string
  icon: ReactNode
  color: string
  titleKey: string
  descriptionKey: string
  buttonKey: string
  connectLabelKey: string
  provider: 'FACEBOOK' | 'INSTAGRAM' | 'WHATSAPP'
}

const CHAT_CONFIG: Record<string, ChatConfigEntry> = {
  whatsapp: {
    label: 'WhatsApp',
    mobileLabel: 'WhatsApp',
    icon: <WhatsAppIcon width={ICON_SIZE} height={ICON_SIZE} />,
    color: 'var(--color-brand-whatsapp)',
    titleKey: 'chat.whatsapp_setup_title',
    descriptionKey: 'chat.whatsapp_setup_desc',
    buttonKey: 'chat.whatsapp_setup_btn',
    connectLabelKey: 'chat.whatsapp_connect_label',
    provider: 'WHATSAPP',
  },
  'instagram-dm': {
    label: 'Messages Instagram',
    mobileLabel: 'Instagram DM',
    icon: <InstagramIcon width={ICON_SIZE} height={ICON_SIZE} />,
    color: 'var(--color-brand-instagram)',
    titleKey: 'chat.instagram_setup_title',
    descriptionKey: 'chat.instagram_setup_desc',
    buttonKey: 'chat.instagram_setup_btn',
    connectLabelKey: 'chat.instagram_connect_label',
    provider: 'INSTAGRAM',
  },
  messenger: {
    label: 'Messenger',
    mobileLabel: 'Messenger',
    icon: <MessengerIcon width={ICON_SIZE} height={ICON_SIZE} />,
    color: 'var(--color-brand-messenger)',
    titleKey: 'chat.messenger_setup_title',
    descriptionKey: 'chat.messenger_setup_desc',
    buttonKey: 'chat.messenger_setup_btn',
    connectLabelKey: 'chat.messenger_connect_label',
    provider: 'FACEBOOK',
  },
}

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
    fileName?: string | null
    fileSize?: number | null
    replyTo?: { id: string; text: string; from: string } | null
    reactions?: { senderId: string; emoji: string }[] | null
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
      avatarUrl: conv.participantAvatar ?? undefined,
    },
    messages: messages.map((m) => {
      const raw = m as Record<string, unknown>
      const status = raw._status as 'sending' | 'sent' | 'error' | undefined
      const localId = raw._localId as string | undefined
      const deliveryStatus = raw.deliveryStatus as 'sent' | 'delivered' | 'read' | undefined
      return {
        id: m.id,
        type: (m.mediaType as 'text' | 'image' | 'video' | 'audio' | 'file') || 'text',
        from: (m.isFromPage ? 'business' : 'customer') as 'business' | 'customer',
        text: m.message,
        timestamp: m.createdTime,
        isRead: m.isRead,
        deliveryStatus,
        localId,
        status,
        imageUrl: m.mediaType === 'image' ? (m.mediaUrl ?? undefined) : undefined,
        audioUrl: m.mediaType === 'audio' ? (m.mediaUrl ?? undefined) : undefined,
        videoUrl: m.mediaType === 'video' ? (m.mediaUrl ?? undefined) : undefined,
        videoThumbnail: m.mediaType === 'video' ? (m.mediaUrl ?? undefined) : undefined,
        fileUrl: m.mediaType === 'file' ? (m.mediaUrl ?? undefined) : undefined,
        fileName: m.fileName ?? undefined,
        fileSize: m.fileSize ?? undefined,
        mediaUrl: m.mediaUrl ?? undefined,
        replyTo: m.replyTo
          ? {
              id: m.replyTo.id,
              text: m.replyTo.text,
              from: m.replyTo.from as 'customer' | 'business',
            }
          : undefined,
        reactions: m.reactions?.length ? m.reactions : undefined,
      }
    }),
    unreadCount: conv.unreadCount,
    labels: [],
    tickets: [],
    lastMessage: conv.lastMessageText || '',
    lastMessageTime: conv.lastMessageAt || new Date().toISOString(),
  }
}

const PROVIDER_MAP: Record<string, string> = {
  whatsapp: 'WHATSAPP',
  messenger: 'FACEBOOK',
  'instagram-dm': 'INSTAGRAM',
}

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

  const [connecting, setConnecting] = useState(false)
  const [whatsappConfigOpen, setWhatsappConfigOpen] = useState(false)
  const [catalogLinkOpen, setCatalogLinkOpen] = useState(false)

  // ─── Agents query: check if any agent covers the current provider ───
  const agentsQuery = usePersistedQuery({
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
        return a.scopes?.includes('messages')
      }),
    [accountsQuery.data, config?.provider],
  )

  const currentAccountId = (search as { account?: string }).account || accounts[0]?.id || null
  const currentAccount = accounts.find((a) => a.id === currentAccountId) || accounts[0] || null

  // ─── WhatsApp commerce settings query ───
  const commerceQuery = usePersistedQuery({
    queryKey: ['whatsapp-commerce', currentAccount?.providerAccountId],
    queryFn: () => catalogApi.getWhatsappCommerceSettings(currentAccount?.providerAccountId || ''),
    enabled: id === 'whatsapp' && !!currentAccountId && !!currentAccount,
    staleTime: 5 * 60 * 1000,
  })

  const hasCatalogAssociated = useMemo(() => {
    const data = commerceQuery.data?.data
    if (!data || data.length === 0) return false
    return data.some((entry) => !!entry.id)
  }, [commerceQuery.data])

  // ─── Catalogs query (for config modal) ───
  const catalogsQuery = useQuery({
    queryKey: ['catalogs', orgSlug],
    queryFn: () => catalogApi.list(orgSlug),
    enabled: id === 'whatsapp' && !!currentAccountId,
    staleTime: 30_000,
  })

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

  // ─── Send mutation ───
  const sendMutation = $api.useMutation('post', '/messaging/send')
  const markReadMutation = $api.useMutation('post', '/messaging/mark-read')
  const syncMutation = $api.useMutation('post', '/messaging/sync/{accountId}')

  // ─── Map conversations to ChatLayout format ───
  const apiConversations: Conversation[] = useMemo(() => {
    if (!conversationsQuery.data) return []

    return conversationsQuery.data.map((conv) => {
      const isSelected = search.conv === conv.id
      const msgs = isSelected && messagesQuery.data ? messagesQuery.data : []
      return mapApiConversation(
        conv as Parameters<typeof mapApiConversation>[0],
        msgs as Parameters<typeof mapApiConversation>[1],
      )
    })
  }, [conversationsQuery.data, messagesQuery.data, search.conv, id])

  // ─── Cache keys ───
  const conversationsKey = [
    'get',
    '/messaging/conversations/{accountId}',
    { params: { path: { accountId: currentAccountId! } } },
  ]
  const messagesKey = (convId: string) => [
    'get',
    '/messaging/conversations/{conversationId}/messages',
    { params: { path: { conversationId: convId } } },
  ]

  // ─── Pending messages for retry ───
  const pendingMessagesRef = useRef<
    Map<
      string,
      {
        message: string
        mediaUrl?: string
        mediaType?: 'image' | 'video' | 'audio' | 'file'
        fileName?: string
        fileSize?: number
        file?: File
      }
    >
  >(new Map())

  // ─── Helper: insert optimistic message ───
  const insertOptimisticMessage = useCallback(
    (convId: string, localId: string, msg: Partial<Message>) => {
      const optimistic: Record<string, unknown> = {
        id: `optimistic-${localId}`,
        _localId: localId,
        conversationId: convId,
        message: msg.text || '',
        senderId: 'page',
        senderName: 'Page',
        isFromPage: true,
        isRead: true,
        mediaUrl: msg.imageUrl || msg.audioUrl || msg.videoUrl || msg.fileUrl || null,
        mediaType: msg.type === 'text' ? null : msg.type,
        fileName: msg.fileName || null,
        fileSize: msg.fileSize || null,
        createdTime: new Date().toISOString(),
        _status: 'sending',
      }

      queryClient.setQueryData(messagesKey(convId), (old: unknown[] | undefined) => [
        ...(old ?? []),
        optimistic,
      ])

      const displayText = msg.text || (msg.type !== 'text' ? `[${msg.type}]` : '')
      queryClient.setQueryData(conversationsKey, (old: unknown[] | undefined) =>
        (old ?? []).map((c: Record<string, unknown>) =>
          c.id === convId
            ? { ...c, lastMessageText: displayText, lastMessageAt: new Date().toISOString() }
            : c,
        ),
      )
    },
    [queryClient, conversationsKey],
  )

  // ─── Helper: reconcile optimistic → real ───
  const reconcileMessage = useCallback(
    (convId: string, localId: string, savedMsg: Record<string, unknown>) => {
      queryClient.setQueryData(messagesKey(convId), (old: unknown[] | undefined) =>
        (old ?? []).map((m: Record<string, unknown>) => {
          if (m._localId !== localId) return m
          // Keep local blob URLs for image/video to avoid re-downloading the same file
          const mediaType = savedMsg.mediaType as string | undefined
          const keepLocal =
            (mediaType === 'image' || mediaType === 'video') && typeof m.mediaUrl === 'string'
          return {
            ...savedMsg,
            _status: undefined,
            ...(keepLocal ? { mediaUrl: m.mediaUrl } : {}),
          }
        }),
      )
      pendingMessagesRef.current.delete(localId)
    },
    [queryClient],
  )

  // ─── Helper: mark optimistic as error ───
  const markMessageError = useCallback(
    (convId: string, localId: string) => {
      queryClient.setQueryData(messagesKey(convId), (old: unknown[] | undefined) =>
        (old ?? []).map((m: Record<string, unknown>) =>
          m._localId === localId ? { ...m, _status: 'error' } : m,
        ),
      )
    },
    [queryClient],
  )

  // ─── Handlers ───
  const handleSend = async (
    message: string,
    media?: { url: string; type: 'image' | 'video' | 'audio' | 'file' },
    replyToId?: string,
  ) => {
    if (!search.conv) return
    const localId = crypto.randomUUID()
    const convId = search.conv

    // Store for retry
    pendingMessagesRef.current.set(localId, {
      message,
      mediaUrl: media?.url,
      mediaType: media?.type,
    })

    // Insert optimistic message
    insertOptimisticMessage(convId, localId, {
      type: media?.type || 'text',
      text: message || undefined,
      imageUrl: media?.type === 'image' ? media.url : undefined,
      audioUrl: media?.type === 'audio' ? media.url : undefined,
      videoUrl: media?.type === 'video' ? media.url : undefined,
      fileUrl: media?.type === 'file' ? media.url : undefined,
    })

    try {
      const savedMsg = await sendMutation.mutateAsync({
        body: {
          conversationId: convId,
          message: message || undefined,
          mediaUrl: media?.url,
          mediaType: media?.type,
          replyToId,
        },
      })
      reconcileMessage(convId, localId, savedMsg as Record<string, unknown>)
    } catch {
      markMessageError(convId, localId)
    }
  }

  const handleUploadAndSend = async (
    file: File,
    type: 'image' | 'video' | 'audio' | 'file',
    replyToId?: string,
  ) => {
    if (!search.conv) return
    const localId = crypto.randomUUID()
    const convId = search.conv

    // Create a local preview URL for images/videos to avoid re-downloading after upload
    const localUrl = type === 'image' || type === 'video' ? URL.createObjectURL(file) : undefined

    // Store for retry
    pendingMessagesRef.current.set(localId, {
      message: '',
      mediaType: type,
      fileName: file.name,
      fileSize: file.size,
      file,
    })

    // Insert optimistic message
    insertOptimisticMessage(convId, localId, {
      type,
      imageUrl: type === 'image' ? localUrl : undefined,
      videoUrl: type === 'video' ? localUrl : undefined,
      fileUrl: type === 'file' ? undefined : undefined,
      fileName: file.name,
      fileSize: file.size,
    })

    try {
      const url = await uploadChatMedia(file)
      const savedMsg = await sendMutation.mutateAsync({
        body: {
          conversationId: convId,
          message: undefined,
          mediaUrl: url,
          mediaType: type,
          fileName: file.name,
          fileSize: file.size,
          replyToId,
        },
      })
      reconcileMessage(convId, localId, savedMsg as Record<string, unknown>)
    } catch {
      markMessageError(convId, localId)
    }
  }

  // ─── Retry handler ───
  const handleRetry = useCallback(
    (messageId: string) => {
      // messageId here is the localId
      const pending = pendingMessagesRef.current.get(messageId)
      if (!pending || !search.conv) return
      const convId = search.conv

      // Remove the failed message from cache
      queryClient.setQueryData(messagesKey(convId), (old: unknown[] | undefined) =>
        (old ?? []).filter((m: Record<string, unknown>) => m._localId !== messageId),
      )
      pendingMessagesRef.current.delete(messageId)

      // Re-send
      if (pending.file) {
        handleUploadAndSend(pending.file, pending.mediaType!)
      } else if (pending.mediaUrl) {
        handleSend(pending.message, { url: pending.mediaUrl, type: pending.mediaType! })
      } else {
        handleSend(pending.message)
      }
    },
    [search.conv, queryClient],
  )

  // Map route id to sidebar unread provider key
  const unreadProviderKey =
    id === 'instagram-dm' ? 'INSTAGRAM_DM' : id === 'whatsapp' ? 'WHATSAPP' : 'MESSENGER'
  const unreadCountsKey = [
    'get',
    '/social/unread-counts/{organisationId}',
    { params: { path: { organisationId: orgSlug } } },
  ]

  // ─── Mark as read when conv is opened, clicked, or tab becomes visible ───
  const markAsRead = useCallback(
    (convId: string) => {
      const convs = conversationsQuery.data as Record<string, unknown>[] | undefined
      const conv = convs?.find((c) => c.id === convId)
      if (!conv || (conv.unreadCount as number) === 0) return

      const convUnread = conv.unreadCount as number

      markReadMutation.mutate({ body: { conversationId: convId } })
      queryClient.setQueryData(conversationsKey, (old: unknown[] | undefined) =>
        (old ?? []).map((c: Record<string, unknown>) =>
          c.id === convId ? { ...c, unreadCount: 0 } : c,
        ),
      )
      // Optimistically subtract from sidebar badge count
      queryClient.setQueryData(
        unreadCountsKey,
        (old: { provider: string; count: number }[] | undefined) =>
          (old ?? []).map((item) =>
            item.provider === unreadProviderKey
              ? { ...item, count: Math.max(0, item.count - convUnread) }
              : item,
          ),
      )
    },
    [
      conversationsQuery.data,
      markReadMutation,
      queryClient,
      conversationsKey,
      unreadCountsKey,
      unreadProviderKey,
    ],
  )

  const handleChatClick = useCallback(() => {
    if (search.conv) markAsRead(search.conv)
  }, [search.conv, markAsRead])

  const markReadConvRef = useRef(search.conv)
  markReadConvRef.current = search.conv

  // Mark as read when conversation URL changes
  useEffect(() => {
    if (search.conv) markAsRead(search.conv)
  }, [search.conv, markAsRead])

  // Mark as read when tab becomes visible again
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && markReadConvRef.current) {
        markAsRead(markReadConvRef.current)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [markAsRead])

  const handleConfigureAgent = useCallback(() => {
    navigate({ to: '/app/$orgSlug/agents' as string, params: { orgSlug } })
  }, [navigate, orgSlug])

  const handleSelectConv = (convId: string) => {
    navigate({
      search: (prev: Record<string, unknown>) => ({ ...prev, conv: convId }) as never,
    })
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

  // ─── WhatsApp connect mutation ───
  const connectWhatsAppMutation = $api.useMutation('post', '/social/connect/whatsapp')

  const handleConnect = async () => {
    setConnecting(true)

    if (id === 'whatsapp') {
      try {
        const appId = import.meta.env.VITE_FACEBOOK_APP_ID
        const waConfigId = import.meta.env.VITE_WHATSAPP_CONFIGGURATION_ID
        if (!appId || !waConfigId) {
          setConnecting(false)
          return
        }

        const { loginResponse, sessionInfo } = await launchWhatsAppSignup(appId, waConfigId)
        if (!loginResponse.authResponse?.code) {
          setConnecting(false)
          return
        }

        await connectWhatsAppMutation.mutateAsync({
          body: {
            organisationId: orgSlug,
            code: loginResponse.authResponse.code,
            wabaId: sessionInfo.waba_id,
            phoneNumberId: sessionInfo.phone_number_id,
          },
        })

        // Refresh accounts list
        queryClient.invalidateQueries({
          queryKey: ['get', '/social/accounts/{organisationId}'],
        })
      } catch (err) {
        console.error('[WhatsApp] Connect failed:', err)
      } finally {
        setConnecting(false)
      }
      return
    }

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
          provider={id as 'whatsapp' | 'instagram-dm' | 'messenger'}
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
        provider={id as 'whatsapp' | 'instagram-dm' | 'messenger'}
        onSend={handleSend}
        onUploadAndSend={handleUploadAndSend}
        onSelectConversation={handleSelectConv}
        onSync={handleSync}
        syncing={syncMutation.isPending}
        onRetry={handleRetry}
        onChatClick={handleChatClick}
        hasReadyAgent={hasReadyAgent}
        hasCatalogAssociated={id !== 'whatsapp' || hasCatalogAssociated}
        onConfigureAgent={handleConfigureAgent}
        onConfigureCatalog={() => setCatalogLinkOpen(true)}
        onOpenOptions={() => setWhatsappConfigOpen(true)}
      />
      {id === 'whatsapp' && currentAccount && (
        <>
          <WhatsappConfigModal
            open={whatsappConfigOpen}
            onClose={() => setWhatsappConfigOpen(false)}
            phoneNumberId={currentAccount.providerAccountId}
            accountName={
              currentAccount.pageName || currentAccount.username || currentAccount.providerAccountId
            }
            socialAccountId={currentAccount.id}
            catalogs={catalogsQuery.data || []}
            commerceData={commerceQuery.data}
            onOpenCatalogLink={() => {
              setWhatsappConfigOpen(false)
              setCatalogLinkOpen(true)
            }}
          />
          <CatalogLinkModal
            open={catalogLinkOpen}
            onClose={() => setCatalogLinkOpen(false)}
            phoneNumberId={currentAccount.providerAccountId}
            accountName={
              currentAccount.pageName || currentAccount.username || currentAccount.providerAccountId
            }
            catalogs={catalogsQuery.data || []}
          />
        </>
      )}
    </div>
  )
}
