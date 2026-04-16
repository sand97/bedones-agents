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

  @ApiProperty({ description: 'Retailer IDs of products to send', type: [String] })
  productRetailerIds: string[]

  @ApiProperty({ description: 'Meta catalog ID linked to the WhatsApp number' })
  catalogId: string

  @ApiProperty({
    enum: ['product', 'product_list'],
    description: 'Single product or multi-product list',
  })
  format: 'product' | 'product_list'

  @ApiPropertyOptional({ description: 'Header text for product list messages' })
  headerText?: string

  @ApiPropertyOptional({ description: 'Body text accompanying the products' })
  bodyText?: string
}

export class MarkConversationReadDto {
  @ApiProperty()
  conversationId: string
}
