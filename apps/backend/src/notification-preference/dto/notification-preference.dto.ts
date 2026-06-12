import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator'

export const NOTIFICATION_TYPES = [
  'COMMENT_TO_READ',
  'COMMENT_AI_SUGGESTION',
  'COMMENT_DAILY_SUMMARY',
  'MESSAGE_TO_READ',
  'MESSAGE_AI_SUGGESTION',
  'MESSAGE_TICKET_CREATED',
  'MESSAGE_TICKET_CLOSED',
  'MESSAGE_DAILY_SUMMARY',
] as const

export type NotificationTypeValue = (typeof NOTIFICATION_TYPES)[number]

export class BulkUpdateNotificationPreferenceDto {
  @ApiProperty({
    type: [String],
    description: 'Organisation members user IDs to apply the change to',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  userIds: string[]

  @ApiProperty()
  @IsUUID()
  socialAccountId: string

  @ApiProperty({ enum: NOTIFICATION_TYPES })
  @IsIn(NOTIFICATION_TYPES as readonly string[])
  type: NotificationTypeValue

  @ApiProperty()
  @IsBoolean()
  enabled: boolean

  @ApiPropertyOptional({
    type: [String],
    description:
      'Ticket notifications only: restrict to these product collection ids. Empty/omitted = all collections.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  collectionIds?: string[]
}

export class BulkUpdateTicketStatusNotificationDto {
  @ApiProperty({
    type: [String],
    description: 'Organisation members user IDs to apply the change to',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  userIds: string[]

  @ApiProperty()
  @IsUUID()
  socialAccountId: string

  @ApiProperty({ description: 'Ticket status the notification is attached to' })
  @IsUUID()
  ticketStatusId: string

  @ApiProperty()
  @IsBoolean()
  enabled: boolean

  @ApiPropertyOptional({
    type: [String],
    description: 'Restrict to these product collection ids. Empty/omitted = all collections.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  collectionIds?: string[]
}

export class GetNotificationPreferencesQueryDto {
  @ApiPropertyOptional({
    description: 'Comma-separated user IDs to fetch preferences for. Defaults to current user.',
  })
  @IsString()
  userIds?: string
}
