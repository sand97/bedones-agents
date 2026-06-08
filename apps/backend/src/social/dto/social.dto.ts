import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class ConnectPagesDto {
  @ApiProperty()
  organisationId: string

  @ApiProperty()
  code: string

  @ApiProperty()
  redirectUri: string

  @ApiPropertyOptional({
    type: [String],
    description: 'Feature scopes granted (e.g. comments, messages)',
  })
  scopes?: string[]
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

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Catalog associated to this page (null to unlink)',
  })
  catalogId?: string | null
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

  @ApiPropertyOptional({ type: String, nullable: true })
  catalogId?: string | null
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

  @ApiPropertyOptional({ enum: ['FORCE_ON', 'FORCE_OFF'], nullable: true })
  aiOverride?: 'FORCE_ON' | 'FORCE_OFF' | null

  @ApiProperty()
  totalComments: number

  @ApiProperty()
  unreadComments: number

  @ApiProperty({ type: [CommentResponseDto] })
  comments: CommentResponseDto[]
}

export class PostAgentSummaryDto {
  @ApiProperty()
  id: string

  @ApiPropertyOptional()
  name?: string

  @ApiProperty()
  score: number

  @ApiProperty({ enum: ['DRAFT', 'CONFIGURING', 'READY', 'ACTIVE', 'PAUSED'] })
  status: string
}

export class PostAgentStatusDto {
  @ApiPropertyOptional({ type: PostAgentSummaryDto, nullable: true })
  agent: PostAgentSummaryDto | null

  @ApiPropertyOptional({ enum: ['FORCE_ON', 'FORCE_OFF'], nullable: true })
  override: 'FORCE_ON' | 'FORCE_OFF' | null

  @ApiProperty({
    description: "Whether the agent would currently reply to this post's comments",
  })
  isActive: boolean
}

export class SetPostAgentOverrideDto {
  @ApiProperty({ enum: ['FORCE_ON', 'FORCE_OFF'] })
  override: 'FORCE_ON' | 'FORCE_OFF'
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

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  metadata?: Record<string, unknown>

  @ApiProperty({ type: [String], description: 'Feature scopes (e.g. comments, messages)' })
  scopes: string[]

  @ApiProperty({
    description: 'Whether outbound calls are disabled after repeated errors or missing scopes',
  })
  disabled: boolean

  @ApiPropertyOptional({
    description: 'Why the account/feature was disabled (e.g. too_many_errors, missing_scopes:...)',
  })
  disabledReason?: string

  @ApiProperty({
    enum: ['COMMENT', 'MESSAGE'],
    isArray: true,
    description: 'Outbound features disabled granularly',
  })
  featureDisabled: string[]

  @ApiPropertyOptional({ type: PageSettingsResponseDto })
  settings?: PageSettingsResponseDto
}

export class SocialAccountLastErrorDto {
  @ApiPropertyOptional({ description: 'Provider/HTTP error code (e.g. 190, OAuthException)' })
  code?: string

  @ApiPropertyOptional({ description: 'Resource to reconnect (page, catalog, tiktok, …)' })
  resource?: string

  @ApiProperty({ description: 'Raw provider error payload, for "show details"' })
  technical: string

  @ApiProperty()
  createdAt: Date
}

export class SocialAccountHealthDto {
  @ApiProperty()
  disabled: boolean

  @ApiPropertyOptional()
  disabledReason?: string

  @ApiProperty({ enum: ['COMMENT', 'MESSAGE'], isArray: true })
  featureDisabled: string[]

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Human-friendly explanation keyed by language (e.g. { en, fr })',
  })
  message?: Record<string, string> | null

  @ApiPropertyOptional({ type: SocialAccountLastErrorDto, nullable: true })
  lastError?: SocialAccountLastErrorDto | null
}

export class UnreadCountDto {
  @ApiProperty()
  provider: string

  @ApiProperty()
  count: number
}

export class TikTokBusinessCheckDto {
  @ApiProperty()
  isBusiness: boolean
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

export class CommentOnPostDto {
  @ApiProperty()
  postId: string

  @ApiProperty()
  message: string
}

export class CommentActionDto {
  @ApiProperty()
  commentId: string
}

export class ConnectWhatsAppDto {
  @ApiProperty()
  organisationId: string

  @ApiProperty()
  code: string

  @ApiPropertyOptional({ description: 'WABA ID from Embedded Signup session info' })
  wabaId?: string

  @ApiPropertyOptional({ description: 'Phone Number ID from Embedded Signup session info' })
  phoneNumberId?: string
}
