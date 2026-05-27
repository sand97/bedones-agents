import { ApiProperty } from '@nestjs/swagger'

export class UploadResponseDto {
  @ApiProperty({ example: 'https://minio.bedones.test/logos/abc123.png' })
  url: string
}
