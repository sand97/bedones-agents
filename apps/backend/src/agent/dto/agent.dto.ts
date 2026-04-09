import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateAgentDto {
  @ApiProperty()
  organisationId: string

  @ApiProperty({ type: [String] })
  socialAccountIds: string[]

  @ApiPropertyOptional()
  name?: string
}

export class SendMessageDto {
  @ApiProperty()
  content: string
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
