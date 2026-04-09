import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateTicketDto {
  @ApiProperty()
  organisationId: string

  @ApiPropertyOptional()
  agentId?: string

  @ApiProperty()
  title: string

  @ApiPropertyOptional()
  description?: string

  @ApiPropertyOptional()
  statusId?: string

  @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] })
  priority?: string

  @ApiPropertyOptional()
  contactName?: string

  @ApiPropertyOptional()
  contactId?: string

  @ApiPropertyOptional({ enum: ['FACEBOOK', 'INSTAGRAM', 'WHATSAPP', 'TIKTOK'] })
  provider?: string

  @ApiPropertyOptional()
  conversationId?: string

  @ApiPropertyOptional()
  assignedTo?: string

  @ApiPropertyOptional()
  metadata?: Record<string, unknown>
}

export class UpdateTicketDto {
  @ApiPropertyOptional()
  title?: string

  @ApiPropertyOptional()
  description?: string

  @ApiPropertyOptional()
  statusId?: string

  @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] })
  priority?: string

  @ApiPropertyOptional()
  assignedTo?: string

  @ApiPropertyOptional()
  metadata?: Record<string, unknown>
}

export class TicketFilterDto {
  @ApiPropertyOptional()
  statusId?: string

  @ApiPropertyOptional()
  agentId?: string

  @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] })
  priority?: string

  @ApiPropertyOptional()
  search?: string

  @ApiPropertyOptional()
  page?: string

  @ApiPropertyOptional()
  pageSize?: string
}
