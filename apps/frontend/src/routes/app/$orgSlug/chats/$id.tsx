import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from 'antd'
import { ArrowLeft } from 'lucide-react'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { SocialSetup } from '@app/components/social/social-setup'
import { AccountSwitcher, type SocialAccount } from '@app/components/social/account-switcher'
import { ChatLayout } from '@app/components/whatsapp/chat-layout'
import { MOCK_CONVERSATIONS } from '@app/components/whatsapp/mock-data'
import { uploadChatMedia } from '@app/lib/api'
import { WhatsAppIcon, InstagramIcon, MessengerIcon } from '@app/components/icons/social-icons'
import { useLayout } from '@app/contexts/layout-context'
import { $api } from '@app/lib/api/$api'
import {
  setAuthRedirect,
  buildFacebookOAuthUrl,
  buildInstagramOAuthUrl,
} from '@app/lib/auth-redirect'
import type { Conversation, Message } from '@app/components/whatsapp/mock-data'

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
      return {
        id: m.id,
        type: (m.mediaType as 'text' | 'image' | 'video' | 'audio' | 'file') || 'text',
        from: (m.isFromPage ? 'business' : 'customer') as 'business' | 'customer',
        text: m.message,
        timestamp: m.createdTime,
        isRead: m.isRead,
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

  // ─── Mark as read when conv is opened or tab becomes visible ───
  const markAsRead = useCallback(
    (convId: string) => {
      const convs = conversationsQuery.data as Record<string, unknown>[] | undefined
      const conv = convs?.find((c) => c.id === convId)
      if (!conv || (conv.unreadCount as number) === 0) return

      markReadMutation.mutate({ body: { conversationId: convId } })
      queryClient.setQueryData(conversationsKey, (old: unknown[] | undefined) =>
        (old ?? []).map((c: Record<string, unknown>) =>
          c.id === convId ? { ...c, unreadCount: 0 } : c,
        ),
      )
    },
    [conversationsQuery.data, markReadMutation, queryClient, conversationsKey],
  )

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
        <ChatLayout conversations={MOCK_CONVERSATIONS} provider="whatsapp" />
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
        provider={id as 'whatsapp' | 'instagram-dm' | 'messenger'}
        onSend={handleSend}
        onUploadAndSend={handleUploadAndSend}
        onSelectConversation={handleSelectConv}
        onSync={handleSync}
        syncing={syncMutation.isPending}
        onRetry={handleRetry}
      />
    </div>
  )
}
