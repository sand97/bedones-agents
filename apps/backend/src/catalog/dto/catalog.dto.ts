import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class CreateCatalogDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  organisationId: string

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  providerId?: string
}

export class UpdateCatalogDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string
}

export class LinkSocialAccountsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  socialAccountIds: string[]
}

// ─── Product DTOs ───

export class CreateProductDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  imageUrl?: string

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  price?: string

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  currency?: string

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  category?: string

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  url?: string

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  availability?: string

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  brand?: string

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  condition?: string

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  collectionId?: string
}

export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  imageUrl?: string

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  price?: string

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  currency?: string

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  category?: string

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  url?: string

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  availability?: string

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  brand?: string

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  condition?: string
}

// ─── Collection DTOs ───

export class CreateCollectionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  productIds?: string[]
}

export class UpdateCollectionDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string
}

// ─── Phone Association DTOs ───

export class AssociatePhoneDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  phoneNumberId: string
}

// ─── Response DTOs ───

export class CatalogResponseDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  name: string

  @ApiPropertyOptional()
  providerId?: string

  @ApiPropertyOptional()
  description?: string

  @ApiProperty()
  analysisStatus: string

  @ApiProperty()
  productCount: number

  @ApiProperty()
  indexedCount: number

  @ApiProperty()
  createdAt: Date

  @ApiProperty()
  updatedAt: Date
}

export class ProductResponseDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  name: string

  @ApiPropertyOptional()
  description?: string

  @ApiPropertyOptional()
  imageUrl?: string

  @ApiPropertyOptional()
  price?: number

  @ApiPropertyOptional()
  currency?: string

  @ApiPropertyOptional()
  category?: string

  @ApiProperty()
  status: string

  @ApiProperty()
  needsIndexing: boolean
}
