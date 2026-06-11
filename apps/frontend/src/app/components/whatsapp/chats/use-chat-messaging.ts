import { useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { TikTokRichMessagePayload } from '@app/components/tiktok/tiktok-message-modal'
import { uploadChatMedia } from '@app/lib/api'
import { $api } from '@app/lib/api/$api'
import type { Message } from '@app/components/whatsapp/mock-data'

/**
 * Messaging logic for the chats page: optimistic send, media upload, retry,
 * mark-as-read (incl. sidebar badge updates), typing, product/template/TikTok
 * rich-message sending. Extracted verbatim from the chats/$id route.
 */
export function useChatMessaging({
  convId: selectedConv,
  currentAccountId,
  conversationsData,
  id,
  orgSlug,
  setTikTokMessageOpen,
}: {
  convId: string | undefined
  currentAccountId: string | null
  conversationsData: unknown[] | undefined
  id: string
  orgSlug: string
  setTikTokMessageOpen: (open: boolean) => void
}) {
  const queryClient = useQueryClient()

  // ─── Send mutation ───
  const sendMutation = $api.useMutation('post', '/messaging/send')
  const sendTemplateMutation = $api.useMutation('post', '/messaging/send-template')
  const sendProductMutation = $api.useMutation('post', '/messaging/send-products')
  const markReadMutation = $api.useMutation('post', '/messaging/mark-read')
  const typingMutation = $api.useMutation('post', '/messaging/typing/{conversationId}')

  const handleTyping = useCallback(() => {
    const convId = selectedConv
    if (!convId) return
    typingMutation.mutate({ params: { path: { conversationId: convId } } })
  }, [selectedConv, typingMutation])

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
        (old ?? []).map((c) => {
          const item = c as Record<string, unknown>
          return item.id === convId
            ? { ...item, lastMessageText: displayText, lastMessageAt: new Date().toISOString() }
            : c
        }),
      )
    },
    [queryClient, conversationsKey],
  )

  // ─── Helper: reconcile optimistic → real ───
  const reconcileMessage = useCallback(
    (convId: string, localId: string, savedMsg: Record<string, unknown>) => {
      queryClient.setQueryData(messagesKey(convId), (old: unknown[] | undefined) =>
        (old ?? []).map((m) => {
          const msg = m as Record<string, unknown>
          if (msg._localId !== localId) return m
          // Keep local blob URLs for image/video to avoid re-downloading the same file
          const mediaType = savedMsg.mediaType as string | undefined
          const keepLocal =
            (mediaType === 'image' || mediaType === 'video') && typeof msg.mediaUrl === 'string'
          return {
            ...savedMsg,
            _status: undefined,
            ...(keepLocal ? { mediaUrl: msg.mediaUrl } : {}),
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
        (old ?? []).map((m) => {
          const msg = m as Record<string, unknown>
          return msg._localId === localId ? { ...msg, _status: 'error' } : m
        }),
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
    if (!selectedConv) return
    const localId = crypto.randomUUID()
    const convId = selectedConv

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
    if (!selectedConv) return
    const localId = crypto.randomUUID()
    const convId = selectedConv

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
      if (!pending || !selectedConv) return
      const convId = selectedConv

      // Remove the failed message from cache
      queryClient.setQueryData(messagesKey(convId), (old: unknown[] | undefined) =>
        (old ?? []).filter((m) => (m as Record<string, unknown>)._localId !== messageId),
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
    [selectedConv, queryClient],
  )

  // Map route id to sidebar unread provider key
  const unreadProviderKey =
    id === 'instagram-dm'
      ? 'INSTAGRAM_DM'
      : id === 'whatsapp'
        ? 'WHATSAPP'
        : id === 'tiktok'
          ? 'TIKTOK_DM'
          : 'MESSENGER'
  const unreadCountsKey = [
    'get',
    '/social/unread-counts/{organisationId}',
    { params: { path: { organisationId: orgSlug } } },
  ]

  // ─── Mark as read when conv is opened, clicked, or tab becomes visible ───
  const markAsRead = useCallback(
    (convId: string) => {
      const convs = conversationsData as Record<string, unknown>[] | undefined
      const conv = convs?.find((c) => c.id === convId)
      if (!conv || (conv.unreadCount as number) === 0) return

      const convUnread = conv.unreadCount as number

      markReadMutation.mutate({ body: { conversationId: convId } })
      queryClient.setQueryData(conversationsKey, (old: unknown[] | undefined) =>
        (old ?? []).map((c) => {
          const item = c as Record<string, unknown>
          return item.id === convId ? { ...item, unreadCount: 0 } : c
        }),
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
      conversationsData,
      markReadMutation,
      queryClient,
      conversationsKey,
      unreadCountsKey,
      unreadProviderKey,
    ],
  )

  const handleChatClick = useCallback(() => {
    if (selectedConv) markAsRead(selectedConv)
  }, [selectedConv, markAsRead])

  const markReadConvRef = useRef(selectedConv)
  markReadConvRef.current = selectedConv

  // Mark as read when conversation URL changes
  useEffect(() => {
    if (selectedConv) markAsRead(selectedConv)
  }, [selectedConv, markAsRead])

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

  const handleSendProducts = async (data: {
    productRetailerIds: string[]
    catalogId: string
    format: 'product' | 'product_list' | 'carousel' | 'catalog_message'
    headerText?: string
    bodyText?: string
    footerText?: string
  }) => {
    if (!selectedConv) return
    const convId = selectedConv

    await sendProductMutation.mutateAsync({
      body: {
        conversationId: convId,
        ...data,
      },
    })

    // Invalidate messages to show the new product message
    queryClient.invalidateQueries({
      queryKey: messagesKey(convId),
    })
  }

  const handleSendTemplate = async (data: {
    template: { id: string; name: string; language: string }
    variables: Record<string, string>
    renderedBody: string
  }) => {
    if (!selectedConv) return
    const convId = selectedConv
    await sendTemplateMutation.mutateAsync({
      body: {
        conversationId: convId,
        metaTemplateId: data.template.id,
        metaTemplateName: data.template.name,
        metaTemplateLanguage: data.template.language,
        variables: data.variables,
        renderedBody: data.renderedBody,
      },
    })
    queryClient.invalidateQueries({ queryKey: messagesKey(convId) })
  }

  const handleSendTikTokRichMessage = async (payload: TikTokRichMessagePayload) => {
    if (!selectedConv) return
    const convId = selectedConv
    const savedMsg = await sendMutation.mutateAsync({
      body: {
        conversationId: convId,
        ...payload,
      },
    })

    queryClient.setQueryData(messagesKey(convId), (old: unknown[] | undefined) => [
      ...(old ?? []),
      savedMsg,
    ])

    const displayText =
      payload.tiktokMessageType === 'SHARE_POST' ? '[tiktok post]' : payload.tiktokTemplate.title
    queryClient.setQueryData(conversationsKey, (old: unknown[] | undefined) =>
      (old ?? []).map((c) => {
        const item = c as Record<string, unknown>
        return item.id === convId
          ? { ...item, lastMessageText: displayText, lastMessageAt: new Date().toISOString() }
          : c
      }),
    )
    setTikTokMessageOpen(false)
  }

  return {
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
  }
}
