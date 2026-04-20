import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class FeedbackTurnDto {
  @ApiProperty({ enum: ['user', 'agent'] })
  from: 'user' | 'agent'

  @ApiProperty()
  text: string
}

export class AgentFeedbackRequestDto {
  @ApiProperty({
    type: [FeedbackTurnDto],
    description:
      'Full feedback conversation so far (user turns = operator feedback, agent turns = clarifying questions from the supervisor).',
  })
  conversation: FeedbackTurnDto[]
}

export class AgentFeedbackResponseDto {
  @ApiProperty({
    enum: ['complete', 'clarify'],
    description:
      '"complete" → agent context was updated and a success message is returned. "clarify" → a clarifying question must be shown to the operator.',
  })
  mode: 'complete' | 'clarify'

  @ApiPropertyOptional({
    description: 'Success message shown to the operator when mode = "complete".',
  })
  successMessage?: string

  @ApiPropertyOptional({
    description: 'Clarifying question shown to the operator when mode = "clarify".',
  })
  question?: string

  @ApiPropertyOptional({
    description: 'The updated agent context (markdown) that was persisted when mode = "complete".',
  })
  newContext?: string
}
