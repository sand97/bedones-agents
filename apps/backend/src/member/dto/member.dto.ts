import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class InviteMemberDto {
  @ApiProperty({ example: 'Aminata' })
  firstName: string

  @ApiProperty({ example: 'Diallo' })
  lastName: string

  @ApiProperty({ example: '+2250701020304' })
  phone: string

  @ApiProperty({ enum: ['ADMIN', 'MEMBER'], example: 'MEMBER' })
  role: 'ADMIN' | 'MEMBER'
}

export class MemberUserDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  name: string

  @ApiPropertyOptional({ nullable: true })
  email: string | null

  @ApiPropertyOptional({ nullable: true })
  phone: string | null

  @ApiPropertyOptional({ nullable: true })
  avatar: string | null

  @ApiProperty({ enum: ['PENDING', 'VERIFIED'] })
  status: string
}

export class MemberResponseDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  userId: string

  @ApiProperty()
  organisationId: string

  @ApiProperty({ enum: ['OWNER', 'ADMIN', 'MEMBER'] })
  role: string

  @ApiProperty({ enum: ['ACTIVE', 'INVITED'] })
  status: string

  @ApiProperty({ type: MemberUserDto })
  user: MemberUserDto

  @ApiProperty()
  createdAt: Date
}

export class VerifyInviteOtpDto {
  @ApiProperty({ example: '123456' })
  code: string
}

export class AcceptInvitationDto {
  @ApiPropertyOptional({ example: 'Aminata' })
  firstName?: string

  @ApiPropertyOptional({ example: 'Diallo' })
  lastName?: string
}
