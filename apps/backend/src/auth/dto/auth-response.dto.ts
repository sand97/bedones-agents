import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class StatusResponseDto {
  @ApiProperty({ example: 'success' })
  status: string
}

export class SocialAccountDto {
  @ApiProperty()
  id: string

  @ApiProperty({ enum: ['FACEBOOK', 'INSTAGRAM', 'WHATSAPP', 'TIKTOK'] })
  provider: string

  @ApiProperty({ nullable: true })
  pageName: string | null

  @ApiProperty()
  providerAccountId: string
}

export class OrganisationSummaryDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  name: string

  @ApiProperty({ nullable: true })
  logoUrl: string | null

  @ApiProperty({ enum: ['OWNER', 'ADMIN', 'MEMBER'] })
  role: string

  @ApiProperty({ type: [SocialAccountDto] })
  socialAccounts: SocialAccountDto[]
}

export class PendingInvitationDto {
  @ApiProperty()
  organisationId: string

  @ApiProperty()
  organisationName: string

  @ApiPropertyOptional({ nullable: true })
  organisationLogo: string | null

  @ApiProperty({ enum: ['ADMIN', 'MEMBER'] })
  role: string

  @ApiProperty()
  invitedAt: Date
}

export class UserDto {
  @ApiProperty()
  id: string

  @ApiPropertyOptional({ nullable: true })
  email: string | null

  @ApiPropertyOptional({ nullable: true })
  phone: string | null

  @ApiProperty()
  name: string

  @ApiProperty({ nullable: true })
  avatar: string | null

  @ApiProperty({ enum: ['PASSWORD', 'FACEBOOK', 'INSTAGRAM'] })
  authType: string

  @ApiProperty({ enum: ['PENDING', 'VERIFIED'] })
  status: string
}

export class MeResponseDto {
  @ApiProperty({ type: UserDto })
  user: UserDto

  @ApiProperty({ type: [OrganisationSummaryDto] })
  organisations: OrganisationSummaryDto[]

  @ApiProperty({ type: [PendingInvitationDto] })
  pendingInvitations: PendingInvitationDto[]
}
