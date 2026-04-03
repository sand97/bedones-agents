import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateOrganisationDto {
  @ApiProperty({ example: 'Mon entreprise' })
  name: string
}

export class UpdateOrganisationDto {
  @ApiPropertyOptional({ example: 'Nouveau nom' })
  name?: string

  @ApiPropertyOptional({ example: 'https://minio.bedones.local/logos/logo.png' })
  logoUrl?: string
}

export class OrgMemberUserDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  name: string

  @ApiProperty()
  email: string

  @ApiProperty({ nullable: true })
  avatar: string | null
}

export class OrgMemberDto {
  @ApiProperty()
  id: string

  @ApiProperty({ enum: ['OWNER', 'ADMIN', 'MEMBER'] })
  role: string

  @ApiProperty({ type: OrgMemberUserDto })
  user: OrgMemberUserDto
}

export class OrgSocialAccountDto {
  @ApiProperty()
  id: string

  @ApiProperty({ enum: ['FACEBOOK', 'INSTAGRAM', 'WHATSAPP', 'TIKTOK'] })
  provider: string

  @ApiProperty()
  providerAccountId: string

  @ApiProperty({ nullable: true })
  pageName: string | null

  @ApiProperty({ type: [String] })
  scopes: string[]

  @ApiProperty()
  createdAt: Date
}

export class OrganisationResponseDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  name: string

  @ApiProperty({ nullable: true })
  logoUrl: string | null

  @ApiProperty()
  createdAt: Date

  @ApiProperty()
  updatedAt: Date

  @ApiProperty({ type: [OrgSocialAccountDto] })
  socialAccounts: OrgSocialAccountDto[]

  @ApiProperty({ type: [OrgMemberDto] })
  members: OrgMemberDto[]
}
