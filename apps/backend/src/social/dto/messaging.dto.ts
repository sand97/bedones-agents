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
  participantAvatar?: string

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

export class MarkConversationReadDto {
  @ApiProperty()
  conversationId: string
}
