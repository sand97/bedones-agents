import { ApiProperty } from '@nestjs/swagger'
import { IsIn } from 'class-validator'

export class CookieConsentDto {
  @ApiProperty({ enum: ['all', 'essential'], example: 'all' })
  @IsIn(['all', 'essential'])
  consent: 'all' | 'essential'
}
