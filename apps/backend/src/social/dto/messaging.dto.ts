import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class ConversationResponseDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  socialAccountId: string

  @ApiPropertyOptional()
  platformThreadId?: string

  @ApiProperty()
  participantId: string

  @ApiProperty()
  participantName: string

  @ApiPropertyOptional()
  participantUsername?: string

  @ApiPropertyOptional()
  participantAvatar?: string

  @ApiPropertyOptional()
  languageCode?: string

  @ApiPropertyOptional()
  languageSource?: string

  @ApiPropertyOptional()
  languageConfidence?: number

  @ApiPropertyOptional()
  lastMessageText?: string

  @ApiPropertyOptional()
  lastMessageAt?: Date

  @ApiProperty()
  unreadCount: number
}

export class ReactionDto {
  @ApiProperty()
  senderId: string

  @ApiProperty()
  emoji: string
}

export class ReplyToDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  text: string

  @ApiProperty()
  from: string
}

export class DirectMessageResponseDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  conversationId: string

  @ApiPropertyOptional()
  platformMsgId?: string

  @ApiProperty()
  message: string

  @ApiProperty()
  senderId: string

  @ApiProperty()
  senderName: string

  @ApiProperty()
  isFromPage: boolean

  @ApiPropertyOptional()
  mediaUrl?: string

  @ApiPropertyOptional()
  mediaType?: string

  @ApiPropertyOptional()
  fileName?: string

  @ApiPropertyOptional()
  fileSize?: number

  @ApiPropertyOptional({ description: 'Reply context', type: ReplyToDto })
  replyTo?: ReplyToDto

  @ApiPropertyOptional({ description: 'Reactions on this message', type: [ReactionDto] })
  reactions?: ReactionDto[]

  @ApiPropertyOptional({
    description: 'WhatsApp delivery status',
    enum: ['sent', 'delivered', 'read'],
  })
  deliveryStatus?: string

  @ApiPropertyOptional({
    description:
      'Interactive payload metadata. For catalog messages: { kind, format, header, body, footer, catalogId, items[{ productRetailerId, name, imageUrl, price, currency }] }. For order messages: { kind: "order", catalogId, text, total, currency, items[{ productRetailerId, name, imageUrl, quantity, itemPrice, currency }] }.',
    type: Object,
  })
  metadata?: Record<string, unknown>

  @ApiProperty()
  createdTime: Date

  @ApiProperty()
  isRead: boolean
}

export class SendMessageDto {
  @ApiProperty()
  conversationId: string

  @ApiPropertyOptional()
  message?: string

  @ApiPropertyOptional({ description: 'Public URL of the media file to send' })
  mediaUrl?: string

  @ApiPropertyOptional({ enum: ['image', 'video', 'audio', 'file'] })
  mediaType?: 'image' | 'video' | 'audio' | 'file'

  @ApiPropertyOptional({ description: 'Original file name' })
  fileName?: string

  @ApiPropertyOptional({ description: 'File size in bytes' })
  fileSize?: number

  @ApiPropertyOptional({ description: 'ID of the message to reply to' })
  replyToId?: string

  @ApiPropertyOptional({
    description:
      'TikTok message type. When omitted, the backend infers TEXT, IMAGE, SHARE_POST, TEMPLATE or SENDER_ACTION from the provided fields.',
    enum: ['TEXT', 'IMAGE', 'SHARE_POST', 'TEMPLATE', 'SENDER_ACTION'],
  })
  tiktokMessageType?: 'TEXT' | 'IMAGE' | 'SHARE_POST' | 'TEMPLATE' | 'SENDER_ACTION'

  @ApiPropertyOptional({ description: 'TikTok post item_id for SHARE_POST messages' })
  tiktokSharePostId?: string

  @ApiPropertyOptional({
    description:
      'TikTok Q&A template payload. Supports type QA_BUTTON_CARD or QA_LINK_CARD with 1-3 REPLY buttons.',
    type: 'object',
    additionalProperties: true,
  })
  tiktokTemplate?: {
    type: 'QA_BUTTON_CARD' | 'QA_LINK_CARD'
    title: string
    buttons: Array<{ type?: 'REPLY'; title: string; id?: string }>
  }

  @ApiPropertyOptional({
    description: 'TikTok sender action for SENDER_ACTION messages',
    enum: ['TYPING', 'MARK_READ'],
  })
  tiktokSenderAction?: 'TYPING' | 'MARK_READ'
}

export class SendProductMessageDto {
  @ApiProperty()
  conversationId: string

  @ApiProperty({
    description:
      'Retailer IDs of products to send. Ignored when format is "catalog_message" except for thumbnail (first ID).',
    type: [String],
  })
  productRetailerIds: string[]

  @ApiProperty({ description: 'Meta catalog ID linked to the WhatsApp number' })
  catalogId: string

  @ApiProperty({
    enum: ['product', 'product_list', 'carousel', 'catalog_message'],
    description:
      'Message format: "product" (single, loops if multiple IDs), "product_list" (sectioned list), "carousel" (swipeable cards), "catalog_message" (catalog CTA)',
  })
  format: 'product' | 'product_list' | 'carousel' | 'catalog_message'

  @ApiPropertyOptional({
    description:
      'Header text. Supported by "product_list" (required, max 60 chars). Not supported by "product", "carousel" or "catalog_message" per Meta spec.',
  })
  headerText?: string

  @ApiPropertyOptional({ description: 'Body text accompanying the products (max 1024 chars)' })
  bodyText?: string

  @ApiPropertyOptional({
    description:
      'Footer text (max 60 chars). Supported by "product", "product_list" and "catalog_message". Not supported by "carousel".',
  })
  footerText?: string
}

export class SendTemplateMessageDto {
  @ApiProperty()
  conversationId: string

  @ApiProperty()
  metaTemplateName: string

  @ApiProperty()
  metaTemplateLanguage: string

  @ApiPropertyOptional()
  metaTemplateId?: string

  @ApiPropertyOptional()
  renderedBody?: string

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  variables?: Record<string, string>
}

export class MarkConversationReadDto {
  @ApiProperty()
  conversationId: string
}

export class ConversationAgentSummaryDto {
  @ApiProperty()
  id: string

  @ApiPropertyOptional()
  name?: string

  @ApiProperty()
  score: number

  @ApiProperty({ enum: ['DRAFT', 'CONFIGURING', 'READY', 'ACTIVE', 'PAUSED'] })
  status: string
}

export class ConversationAgentStatusDto {
  @ApiPropertyOptional({ type: ConversationAgentSummaryDto, nullable: true })
  agent: ConversationAgentSummaryDto | null

  @ApiPropertyOptional({ enum: ['FORCE_ON', 'FORCE_OFF'], nullable: true })
  override: 'FORCE_ON' | 'FORCE_OFF' | null

  @ApiProperty({
    description: 'Whether the agent would process a new message on this conversation',
  })
  isActive: boolean
}

export class SetConversationAgentOverrideDto {
  @ApiProperty({ enum: ['FORCE_ON', 'FORCE_OFF'] })
  override: 'FORCE_ON' | 'FORCE_OFF'
}
