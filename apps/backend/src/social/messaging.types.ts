import { Prisma } from 'generated/prisma/client'

/**
 * Rolling window (in days) for the connect-time message history backfill.
 *
 * Configurable via `MESSAGE_HISTORY_SYNC_WINDOW_DAYS` (default 30). The backfill
 * runs progressively in the background, so widening the window only adds more
 * paginated work — it does not block the connect flow. Bounded to a sane range
 * (1..180) since most providers cap history depth anyway (WhatsApp ~6 months,
 * TikTok 90 days, Messenger/Instagram ~20 most-recent messages per thread).
 */
export const HISTORY_SYNC_WINDOW_DAYS = (() => {
  const raw = Number(process.env.MESSAGE_HISTORY_SYNC_WINDOW_DAYS)
  if (!Number.isFinite(raw) || raw <= 0) return 30
  return Math.min(Math.floor(raw), 180)
})()
/** Safety cap on paginated provider requests per backfill run. */
export const HISTORY_MAX_PAGES = 40

export type TikTokMessageType = 'TEXT' | 'IMAGE' | 'SHARE_POST' | 'TEMPLATE' | 'SENDER_ACTION'
export type TikTokSenderAction = 'TYPING' | 'MARK_READ'
export type TikTokTemplatePayload = {
  type: 'QA_BUTTON_CARD' | 'QA_LINK_CARD'
  title: string
  buttons: Array<{ type?: 'REPLY'; title: string; id?: string }>
}

export interface TikTokSendResult {
  platformMsgId: string | null
  message: string
  displayText: string
  mediaUrl?: string | null
  mediaType?: string | null
  metadata?: Prisma.InputJsonValue
}

export interface TikTokApiResponse<T> {
  code?: number
  message?: string
  request_id?: string
  data?: T
}

export interface EchoMessageOptions {
  createConversation?: boolean
  recipientName?: string | null
  senderId?: string | null
  senderName?: string | null
  deliveryStatus?: string | null
  metadata?: Record<string, unknown> | null
}

export interface EchoMessageResult {
  conversationId: string
  messageId: string
}

export interface TikTokConversationMessage {
  sender?: string
  recipient?: string
  conversation_id?: string
  message_id?: string
  timestamp?: string | number
  message_type?: string
  text?: { body?: string }
  image?: { media_id?: string }
  video?: { media_id?: string }
  share_post?: { item_id?: string; embed_url?: string }
  template?: TikTokTemplatePayload
  from_user?: { id?: string; role?: string; display_name?: string }
  to_user?: { id?: string; role?: string; display_name?: string }
  referenced_message_info?: { referenced_message_id?: string }
  reactions?: Array<{ sender_id?: string; emoji?: string }>
}

export interface TikTokConversationParticipant {
  id?: string
  role?: string
  display_name?: string
  profile_image?: string
  is_follower?: boolean
}

export interface TikTokConversationContent {
  messages?: TikTokConversationMessage[]
  participants?: TikTokConversationParticipant[]
}

/** A conversation discovered during phase 1 of the history backfill. */
export interface HistoryConversationRef {
  /** Local Conversation id. Null for TikTok until resolved in phase 2. */
  conversationId: string | null
  /** Provider thread/conversation id. */
  platformThreadId: string | null
  /** Platform user id of the other party. Null for TikTok until resolved. */
  participantId: string | null
}

/** Normalized input for persisting a single backfilled (historical) message. */
export interface HistoricalMessageInput {
  socialAccountId: string
  participantId: string
  participantName?: string | null
  participantUsername?: string | null
  participantAvatar?: string | null
  platformThreadId?: string | null
  platformMsgId: string | null
  message: string
  senderId: string
  senderName: string
  isFromPage: boolean
  mediaUrl?: string | null
  mediaType?: string | null
  fileName?: string | null
  fileSize?: number | null
  replyToMid?: string | null
  deliveryStatus?: string | null
  metadata?: Record<string, unknown> | null
  timestamp: Date
}

export interface MetaConversationListResponse {
  data?: Array<{
    id: string
    participants?: { data: Array<{ id: string; name?: string; username?: string }> }
    updated_time?: string
    unread_count?: number
  }>
  paging?: { next?: string }
}

export interface MetaMessageListResponse {
  data?: Array<{
    id: string
    message?: string
    from?: { id: string; name?: string; username?: string }
    created_time: string
    attachments?: { data?: Array<{ mime_type?: string; image_data?: { url?: string } }> }
  }>
  paging?: { next?: string }
}
