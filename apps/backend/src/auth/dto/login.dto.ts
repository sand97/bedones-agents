import { ApiProperty } from '@nestjs/swagger'

export class LoginDto {
  @ApiProperty({ example: 'test@bedones.com' })
  email: string

  @ApiProperty({ example: 'test1234' })
  password: string
}
