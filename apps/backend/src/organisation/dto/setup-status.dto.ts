import { ApiProperty } from '@nestjs/swagger'

/** A single page that has not yet been configured for comment moderation. */
export class PendingCommentsStepDto {
  @ApiProperty()
  socialAccountId: string

  @ApiProperty({ enum: ['FACEBOOK', 'INSTAGRAM', 'TIKTOK'] })
  provider: string

  @ApiProperty({ nullable: true })
  pageName: string | null

  @ApiProperty({ nullable: true })
  profilePictureUrl: string | null

  @ApiProperty()
  createdAt: Date
}

/** A messaging account that does not yet have a fully-configured agent (score ≥ 80). */
export class PendingAgentStepDto {
  @ApiProperty()
  socialAccountId: string

  @ApiProperty({ enum: ['FACEBOOK', 'INSTAGRAM', 'WHATSAPP', 'TIKTOK'] })
  provider: string

  /**
   * Display channel — distinguishes the messaging surface from the provider so the
   * front can show "Messenger" / "Instagram DM" / "TikTok DM" rather than the raw provider.
   */
  @ApiProperty({ enum: ['WHATSAPP', 'MESSENGER', 'INSTAGRAM_DM', 'TIKTOK_DM'] })
  channel: string

  @ApiProperty({ nullable: true })
  pageName: string | null

  @ApiProperty({ nullable: true })
  profilePictureUrl: string | null

  @ApiProperty()
  createdAt: Date

  /**
   * NONE  — no agent covers this account
   * DRAFT_OR_CONFIGURING — at least one agent covers it but is still being trained
   * READY_BELOW_THRESHOLD — at least one agent reached READY/ACTIVE but its score is still < 80
   */
  @ApiProperty({ enum: ['NONE', 'DRAFT_OR_CONFIGURING', 'READY_BELOW_THRESHOLD'] })
  agentStatus: string

  /** Best score across agents that cover this account, or 0 if no agent yet. */
  @ApiProperty()
  agentScore: number

  /** Id of the best-covering agent, or null when no agent exists yet. */
  @ApiProperty({ nullable: true })
  agentId: string | null
}

export class SetupStatusResponseDto {
  @ApiProperty({ description: 'True when the organisation has no catalog yet.' })
  catalogPending: boolean

  @ApiProperty({ type: [PendingCommentsStepDto] })
  pendingComments: PendingCommentsStepDto[]

  @ApiProperty({ type: [PendingAgentStepDto] })
  pendingAgents: PendingAgentStepDto[]

  @ApiProperty({ description: 'Sum of all pending steps across categories.' })
  pendingCount: number

  @ApiProperty({ description: 'Convenience flag: `pendingCount === 0`.' })
  allConfigured: boolean
}
