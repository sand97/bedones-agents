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

export class ActivateAgentDto {
  @ApiProperty({ enum: ['CONTACTS', 'LABELS', 'EXCLUDE_LABELS'] })
  mode: 'CONTACTS' | 'LABELS' | 'EXCLUDE_LABELS'

  @ApiPropertyOptional({
    type: [String],
    description: 'Label IDs for LABELS / EXCLUDE_LABELS modes',
  })
  labelIds?: string[]

  @ApiPropertyOptional({
    description: 'Per-social-account contacts for CONTACTS mode',
  })
  contacts?: Record<string, string[]> // socialAccountId → phone numbers or profile names
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
