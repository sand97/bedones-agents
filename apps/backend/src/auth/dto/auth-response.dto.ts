import { ApiProperty } from '@nestjs/swagger'

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

export class UserDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  email: string

  @ApiProperty()
  name: string

  @ApiProperty({ nullable: true })
  avatar: string | null

  @ApiProperty({ enum: ['PASSWORD', 'FACEBOOK', 'INSTAGRAM'] })
  authType: string
}

export class MeResponseDto {
  @ApiProperty({ type: UserDto })
  user: UserDto

  @ApiProperty({ type: [OrganisationSummaryDto] })
  organisations: OrganisationSummaryDto[]
}
