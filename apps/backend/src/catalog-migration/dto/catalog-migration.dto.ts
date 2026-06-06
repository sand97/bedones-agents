import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class StartCatalogMigrationDto {
  @ApiProperty({ description: 'Organisation owning the target Commerce Manager catalogue' })
  @IsString()
  @IsNotEmpty()
  organisationId: string

  @ApiProperty({ description: 'Local id of the destination (Commerce Manager) catalogue' })
  @IsString()
  @IsNotEmpty()
  catalogId: string

  @ApiProperty({
    description: 'WhatsApp number to import the public catalogue from (digits only, no "+")',
    example: '237657888690',
  })
  @IsString()
  @IsNotEmpty()
  sourcePhone: string

  @ApiPropertyOptional({
    description: 'Id of the connected SocialAccount the number belongs to, when known',
  })
  @IsString()
  @IsOptional()
  sourceSocialAccountId?: string
}

export class CatalogMigrationResponseDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  catalogId: string

  @ApiProperty()
  sourcePhone: string

  @ApiProperty({ enum: ['QUEUED', 'EXTRACTING', 'IMPORTING', 'COMPLETED', 'FAILED'] })
  status: string

  @ApiProperty()
  totalProducts: number

  @ApiProperty()
  importedProducts: number

  @ApiProperty()
  failedProducts: number

  @ApiPropertyOptional({ nullable: true })
  error?: string | null

  @ApiProperty({ description: 'Number of migrations to run before this one (0 = running/next)' })
  position: number

  @ApiProperty({ description: 'Estimated minutes before this migration starts (~1 min per sync)' })
  etaMinutes: number

  @ApiProperty()
  createdAt: Date
}
