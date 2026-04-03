import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class ConnectPagesDto {
  @ApiProperty()
  organisationId: string

  @ApiProperty()
  code: string

  @ApiProperty()
  redirectUri: string
}

export class FAQRuleDto {
  @ApiProperty()
  question: string

  @ApiProperty()
  answer: string
}

export class UpdatePageSettingsDto {
  @ApiPropertyOptional({ enum: ['hide', 'delete', 'none'] })
  undesiredCommentsAction?: string

  @ApiPropertyOptional({ enum: ['hide', 'delete', 'none'] })
  spamAction?: string

  @ApiPropertyOptional()
  customInstructions?: string

  @ApiPropertyOptional({ type: [FAQRuleDto] })
  faqRules?: FAQRuleDto[]
}

export class FAQRuleResponseDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  question: string

  @ApiProperty()
  answer: string
}

export class PageSettingsResponseDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  isConfigured: boolean

  @ApiProperty()
  undesiredCommentsAction: string

  @ApiProperty()
  spamAction: string

  @ApiPropertyOptional()
  customInstructions?: string

  @ApiProperty({ type: [FAQRuleResponseDto] })
  faqRules: FAQRuleResponseDto[]
}

export class CommentResponseDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  postId: string

  @ApiPropertyOptional()
  parentId?: string

  @ApiProperty()
  message: string

  @ApiProperty()
  fromId: string

  @ApiProperty()
  fromName: string

  @ApiPropertyOptional()
  fromAvatar?: string

  @ApiProperty()
  createdTime: Date

  @ApiProperty()
  isRead: boolean

  @ApiProperty()
  isPageReply: boolean

  @ApiProperty({ enum: ['VISIBLE', 'HIDDEN', 'DELETED'] })
  status: string

  @ApiProperty({ enum: ['NONE', 'HIDE', 'DELETE', 'REPLY'] })
  action: string

  @ApiPropertyOptional()
  actionReason?: string

  @ApiPropertyOptional()
  replyMessage?: string
}

export class PostResponseDto {
  @ApiProperty()
  id: string

  @ApiPropertyOptional()
  message?: string

  @ApiPropertyOptional()
  imageUrl?: string

  @ApiPropertyOptional()
  permalinkUrl?: string

  @ApiProperty()
  totalComments: number

  @ApiProperty()
  unreadComments: number

  @ApiProperty({ type: [CommentResponseDto] })
  comments: CommentResponseDto[]
}

export class SocialAccountResponseDto {
  @ApiProperty()
  id: string

  @ApiProperty({ enum: ['FACEBOOK', 'INSTAGRAM', 'WHATSAPP', 'TIKTOK'] })
  provider: string

  @ApiProperty()
  providerAccountId: string

  @ApiPropertyOptional()
  pageName?: string

  @ApiPropertyOptional()
  username?: string

  @ApiPropertyOptional()
  profilePictureUrl?: string

  @ApiPropertyOptional({ type: PageSettingsResponseDto })
  settings?: PageSettingsResponseDto
}

export class UnreadCountDto {
  @ApiProperty()
  provider: string

  @ApiProperty()
  count: number
}

export class UserStatsResponseDto {
  @ApiProperty()
  fromId: string

  @ApiProperty()
  fromName: string

  @ApiPropertyOptional()
  fromAvatar?: string

  @ApiProperty()
  totalComments: number

  @ApiProperty()
  hiddenComments: number

  @ApiProperty()
  deletedComments: number
}

export class MarkReadDto {
  @ApiProperty()
  postId: string
}

export class ReplyToCommentDto {
  @ApiProperty()
  commentId: string

  @ApiProperty()
  message: string
}

export class CommentActionDto {
  @ApiProperty()
  commentId: string
}
