export interface IncomingMessageEvent {
  conversationId: string
  socialAccountId: string
  provider: 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK'
  orgId: string
  message: {
    text: string
    mediaUrl: string | null
    mediaType: string | null
    senderId: string
    senderName: string
  }
}

/**
 * Error code returned in a Coexistence `history` webhook when the business chose
 * not to share its message history during Embedded Signup.
 * @see https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
 */
export const HISTORY_NOT_SHARED_ERROR_CODE = 2593109

// ─── Webhook payload types ───

export interface FacebookWebhookPayload {
  object: string
  entry: Array<{
    id: string
    time: number
    changes?: Array<{
      field: string
      value: FacebookChangeValue
    }>
    messaging?: MessagingEvent[]
  }>
}

export interface FacebookChangeValue {
  from?: { id: string; name: string }
  post_id?: string
  comment_id?: string
  parent_id?: string
  message?: string
  created_time: number
  item?: string
  verb?: string
  post?: {
    id?: string
    permalink_url?: string
    status_type?: string
    is_published?: boolean
  }
}

export interface InstagramWebhookPayload {
  object: string
  entry: Array<{
    id: string
    time: number
    changes?: Array<{
      field: string
      value: InstagramChangeValue
    }>
    messaging?: MessagingEvent[]
  }>
}

export interface InstagramChangeValue {
  id?: string
  text?: string
  parent_id?: string
  from?: { id: string; username: string }
  media?: {
    id: string
    media_product_type?: string
    permalink?: string
  }
  timestamp?: string
}

// ─── Messaging event types (Messenger + Instagram DM) ───

// Meta (Messenger/Instagram) ad referral — present when a conversation starts from
// a Click-to-Messenger / Click-to-Instagram ad, an m.me ad link, or an icebreaker.
export interface MetaReferral {
  ref?: string
  source?: string // e.g. 'ADS', 'SHORTLINK', 'CUSTOMER_CHAT_PLUGIN'
  type?: string // e.g. 'OPEN_THREAD', 'AD'
  ad_id?: string
  ads_context_data?: {
    ad_title?: string
    photo_url?: string
    video_url?: string
    post_id?: string
  }
}

export interface MessagingEvent {
  sender?: { id: string }
  recipient?: { id: string }
  timestamp: number
  message?: {
    mid?: string
    text?: string
    is_echo?: boolean
    attachments?: Array<{
      type?: string
      payload?: {
        url?: string
      }
      name?: string
      size?: number
    }>
    reply_to?: {
      mid?: string
    }
    referral?: MetaReferral
  }
  referral?: MetaReferral
  postback?: { referral?: MetaReferral }
  reaction?: {
    mid: string
    action: 'react' | 'unreact'
    reaction?: string
    emoji?: string
  }
}

// ─── WhatsApp webhook payload types ───

export interface WhatsAppWebhookPayload {
  object: string
  entry: Array<{
    id: string
    changes: Array<{
      field: string
      value: WhatsAppWebhookValue
    }>
  }>
}

export interface WhatsAppWebhookValue {
  messaging_product: string
  metadata: {
    display_phone_number: string
    phone_number_id: string
  }
  contacts?: WhatsAppContact[]
  messages?: WhatsAppMessage[]
  message_echoes?: WhatsAppMessageEcho[]
  history?: WhatsAppHistoryEntry[]
  state_sync?: WhatsAppStateSync[]
  errors?: WhatsAppWebhookError[]
  statuses?: Array<{
    id: string
    status: string
    timestamp: string
    recipient_id: string
  }>
}

export interface WhatsAppWebhookError {
  code: number
  title?: string
  message?: string
  error_data?: { details?: string }
}

export interface WhatsAppContact {
  wa_id: string
  user_id?: string
  profile?: { name?: string }
}

export interface WhatsAppMessage {
  id: string
  from: string
  timestamp: string
  type: string
  text?: { body: string }
  image?: { id: string; caption?: string; mime_type?: string }
  video?: { id: string; caption?: string; mime_type?: string }
  audio?: { id: string; mime_type?: string }
  document?: { id: string; filename?: string; mime_type?: string }
  sticker?: { id: string; mime_type?: string }
  order?: {
    catalog_id: string
    text?: string
    product_items?: Array<{
      product_retailer_id: string
      quantity: number | string
      item_price: number | string
      currency: string
    }>
  }
  interactive?: {
    type: string
    button_reply?: { id: string; title: string }
    list_reply?: { id: string; title: string; description?: string }
  }
  button?: { payload?: string; text?: string }
  reaction?: { message_id: string; emoji: string }
  context?: { id?: string; from?: string }
  // Present only on Click-to-WhatsApp (CTWA) ad messages.
  referral?: {
    source_type?: string // e.g. 'ad', 'post'
    source_id?: string // ad / post id
    source_url?: string
    ctwa_clid?: string // Click-to-WhatsApp click id
    headline?: string
    body?: string
  }
}

export interface WhatsAppMessageEcho extends WhatsAppMessage {
  to?: string
  to_user_id?: string
  from_user_id?: string
}

// ─── Coexistence message history (field: "history") ───
export interface WhatsAppHistoryEntry {
  metadata?: {
    phase?: string | number
    chunk_order?: string | number
    progress?: string | number
  }
  errors?: WhatsAppWebhookError[]
  threads?: Array<{ id: string; messages?: WhatsAppHistoryMessage[] }>
}

export interface WhatsAppHistoryMessage extends WhatsAppMessage {
  to?: string
  history_context?: { status?: string; from_me?: boolean }
}

// ─── Coexistence contact sync (field: "smb_app_state_sync") ───
export interface WhatsAppStateSync {
  type: string // "contact"
  contact?: {
    full_name?: string
    first_name?: string
    phone_number?: string
  }
  action?: string // "add" | "update" | "remove"
  metadata?: { timestamp?: string }
}

// ─── TikTok webhook payload types ───

export interface TikTokWebhookPayload {
  client_key: string
  event: string
  create_time: number
  user_openid: string
  content: string | TikTokCommentContent | TikTokDirectMessageContent
}

export interface TikTokCommentContent {
  comment_id: number | string
  video_id: number | string
  parent_comment_id: number | string
  comment_type: string
  comment_action: string // 'insert' | 'set_to_public' | 'delete' | etc.
  timestamp: number
  unique_identifier: string
}

export interface TikTokDirectMessageContent {
  timestamp?: number | string
  unique_identifier?: string
  conversation_id: string
  message_id?: string
  message_type?: string
  type?: string
  from?: string
  to?: string
  from_user?: TikTokDirectMessageUser
  to_user?: TikTokDirectMessageUser
  text?: { body?: string }
  image?: { media_id?: string }
  video?: { media_id?: string }
  share_post?: { item_id?: string; embed_url?: string }
  template?: {
    type: 'QA_BUTTON_CARD' | 'QA_LINK_CARD'
    title: string
    buttons: Array<{ type?: 'REPLY'; title: string; id?: string }>
  }
  referenced_message_info?: { referenced_message_id?: string }
  reactions?: Array<{ sender_id?: string; emoji?: string }>
  read?: Record<string, string | number | undefined>
  scene_type?: number
  is_follower?: boolean
  message_tag?: Record<string, unknown>
}

export interface TikTokDirectMessageUser {
  id?: string
  role?: string
  display_name?: string
  profile_image?: string
  avatar_url?: string
}
