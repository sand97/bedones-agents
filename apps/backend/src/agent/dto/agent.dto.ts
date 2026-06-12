import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateAgentDto {
  @ApiProperty()
  organisationId: string

  @ApiProperty({ type: [String] })
  socialAccountIds: string[]

  @ApiPropertyOptional()
  name?: string
}

export class SendAgentMessageDto {
  @ApiProperty()
  content: string
}

export class UpdateAgentSocialAccountsDto {
  @ApiProperty({ type: [String] })
  socialAccountIds: string[]
}

export class UpdateAgentModelDto {
  @ApiProperty({ enum: ['flash', 'pro', 'ultra'], description: 'Live-agent model tier.' })
  tier: string
}

export class ActivateAgentDto {
  @ApiPropertyOptional({
    description: 'Respond on every conversation. Exclusive: overrides the other scopes.',
  })
  activateAll?: boolean

  @ApiPropertyOptional({
    description:
      'Respond when the incoming message originates from an ad (Meta CTWA/referral, TikTok).',
  })
  activateAds?: boolean

  @ApiPropertyOptional({
    description: 'Respond on all new conversations created after activation.',
  })
  activateNewConversations?: boolean

  @ApiPropertyOptional({
    description:
      'Per-social-account test contacts (socialAccountId → phone numbers or profile names). Mainly used to test the agent on a few contacts.',
  })
  contacts?: Record<string, string[]>
}

export class AgentResponseDto {
  @ApiProperty()
  id: string

  @ApiPropertyOptional()
  name?: string

  @ApiProperty()
  status: string

  @ApiProperty()
  score: number

  @ApiPropertyOptional()
  context?: string

  @ApiProperty({ enum: ['flash', 'pro', 'ultra'] })
  liveModelTier: string

  @ApiProperty()
  createdAt: Date

  @ApiProperty()
  updatedAt: Date
}

export class AgentMessageResponseDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  role: string

  @ApiProperty()
  content: string

  @ApiProperty()
  type: string

  @ApiPropertyOptional()
  metadata?: Record<string, unknown>

  @ApiProperty()
  createdAt: Date
}
