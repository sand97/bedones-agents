import { IsNotEmpty, IsString } from 'class-validator'

export class ExecutePageScriptDto {
  @IsString()
  @IsNotEmpty()
  script: string
}
