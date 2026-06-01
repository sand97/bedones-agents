import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

export class ExecutePageScriptDto {
  @ApiProperty({
    description:
      'JavaScript to evaluate in the WhatsApp Web page (has access to window.WPP / window.nodeFetch). Use an IIFE that returns a value.',
    example: '(async () => { return window.WPP.conn.getMyUserId()?._serialized })()',
  })
  @IsString()
  @IsNotEmpty()
  script: string
}
