import { ApiProperty } from '@nestjs/swagger'

export class UploadResponseDto {
  @ApiProperty({ example: 'https://minio.bedones.local/logos/abc123.png' })
  url: string
}
