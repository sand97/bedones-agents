import { ApiProperty } from '@nestjs/swagger'

export class SendWhatsAppOtpDto {
  @ApiProperty({ example: '+237', description: 'Country dial code with leading +' })
  countryCode: string

  @ApiProperty({ example: '657888690', description: 'Local phone number (digits only)' })
  phone: string
}

export class VerifyWhatsAppOtpDto {
  @ApiProperty({ example: '+237' })
  countryCode: string

  @ApiProperty({ example: '657888690' })
  phone: string

  @ApiProperty({ example: '123456' })
  code: string
}

export class WhatsAppLoginUserDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  name: string

  @ApiProperty({ nullable: true })
  phone: string | null

  @ApiProperty({ nullable: true })
  phoneCountryCode: string | null

  @ApiProperty({ nullable: true })
  phoneLocal: string | null
}

export class WhatsAppVerifyResponseDto {
  @ApiProperty({ type: WhatsAppLoginUserDto })
  user: WhatsAppLoginUserDto

  @ApiProperty({ description: 'True if the user was just created on this verification' })
  isNewUser: boolean
}
