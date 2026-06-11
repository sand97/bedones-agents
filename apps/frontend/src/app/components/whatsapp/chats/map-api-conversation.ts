import type { Conversation } from '@app/components/whatsapp/mock-data'

/** Map API conversation to ChatLayout Conversation type */
export function mapApiConversation(
  conv: {
    id: string
    participantId: string
    participantName: string
    participantUsername?: string | null
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
    metadata?: Record<string, unknown> | null
    createdTime: string
    isRead: boolean
  }>,
  provider?: string,
): Conversation {
  const isWhatsApp = provider === 'whatsapp'
  const isTikTok = provider === 'tiktok'
  return {
    id: conv.id,
    contact: {
      id: conv.participantId,
      name: conv.participantName,
      phone: isWhatsApp && conv.participantId ? `+${conv.participantId}` : isTikTok ? '' : '',
      username:
        isTikTok && conv.participantUsername && conv.participantUsername !== conv.participantName
          ? `@${conv.participantUsername}`
          : undefined,
      avatarUrl: conv.participantAvatar ?? undefined,
    },
    messages: messages.map((m) => {
      const raw = m as Record<string, unknown>
      const status = raw._status as 'sending' | 'sent' | 'error' | undefined
      const localId = raw._localId as string | undefined
      const deliveryStatus = raw.deliveryStatus as 'sent' | 'delivered' | 'read' | undefined
      const meta = (m.metadata || undefined) as
        | {
            kind?: 'catalog' | 'order' | 'tiktok_template' | 'tiktok_post'
            format?: 'product' | 'product_list' | 'carousel' | 'catalog_message'
            header?: string
            body?: string
            footer?: string
            catalogId?: string
            text?: string
            itemId?: string
            embedUrl?: string | null
            template?: {
              type?: 'QA_BUTTON_CARD' | 'QA_LINK_CARD'
              title?: string
              buttons?: Array<{ id?: string; title?: string; type?: string }>
            }
            total?: number
            currency?: string | null
            items?: Array<{
              productRetailerId?: string
              name?: string
              imageUrl?: string | null
              price?: number | null
              quantity?: number
              itemPrice?: number
              currency?: string | null
            }>
          }
        | undefined
      const catalogItems =
        meta?.kind === 'catalog' && meta.items?.length
          ? meta.items.map((item) => ({
              retailerId: item.productRetailerId,
              name: item.name ?? item.productRetailerId ?? '',
              imageUrl: item.imageUrl ?? null,
              price: item.price ?? null,
              currency: item.currency ?? null,
            }))
          : undefined
      const order =
        meta?.kind === 'order'
          ? {
              catalogId: meta.catalogId ?? null,
              text: meta.text,
              items: (meta.items || []).map((item) => ({
                retailerId: item.productRetailerId,
                name: item.name ?? item.productRetailerId ?? '',
                imageUrl: item.imageUrl ?? null,
                quantity: item.quantity ?? 1,
                itemPrice: item.itemPrice ?? 0,
                currency: item.currency ?? null,
              })),
              total: meta.total ?? 0,
              currency: meta.currency ?? null,
            }
          : undefined
      const tiktokTemplate = meta?.kind === 'tiktok_template' ? meta.template : undefined
      const tiktokPostText =
        meta?.kind === 'tiktok_post'
          ? meta.embedUrl || meta.itemId || m.message || 'TikTok post'
          : undefined
      const resolvedBody =
        meta?.kind === 'catalog'
          ? meta.body || m.message
          : tiktokTemplate
            ? tiktokTemplate.title || m.message
            : tiktokPostText || m.message
      const rawType = m.mediaType || 'text'
      const type =
        tiktokTemplate || rawType === 'button'
          ? 'button'
          : rawType === 'tiktok_post'
            ? 'text'
            : (rawType as
                | 'text'
                | 'image'
                | 'video'
                | 'audio'
                | 'file'
                | 'catalog'
                | 'catalog_message'
                | 'order')
      return {
        id: m.id,
        type,
        from: (m.isFromPage ? 'business' : 'customer') as 'business' | 'customer',
        isAi: m.isFromPage && m.senderName === 'AI Agent',
        text: resolvedBody,
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
        catalogItems,
        catalogHeader: meta?.header,
        catalogFooter: meta?.footer,
        catalogFormat: meta?.format,
        order,
        buttons: tiktokTemplate?.buttons?.map((button, idx) => ({
          id: button.id || `button-${idx}`,
          label: button.title || '',
        })),
        buttonHeader: tiktokTemplate?.type === 'QA_LINK_CARD' ? 'TikTok Q&A' : undefined,
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
    // No timestamp for contacts synced from the address book that have no
    // message yet (smb_app_state_sync) — keep it empty so the list neither
    // shows a fake "now" time nor floats them to the top.
    lastMessageTime: conv.lastMessageAt || '',
  }
}
