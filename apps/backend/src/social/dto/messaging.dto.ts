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

  @ApiProperty()
  createdTime: Date

  @ApiProperty()
  isRead: boolean
}

export class SendMessageDto {
  @ApiProperty()
  conversationId: string

  @ApiProperty()
  message: string
}

export class MarkConversationReadDto {
  @ApiProperty()
  conversationId: string
}
