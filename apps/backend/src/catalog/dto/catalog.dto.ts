import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator'

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

  @ApiProperty({ description: 'Code produit du marchand (retailer_id / SKU)' })
  @IsString()
  @IsNotEmpty()
  retailerId: string

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  imageUrl?: string

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  additionalImageUrls?: string[]

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

  @ApiPropertyOptional({ description: 'Code produit du marchand (retailer_id / SKU)' })
  @IsString()
  @IsOptional()
  retailerId?: string

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  imageUrl?: string

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  additionalImageUrls?: string[]

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

// ─── Image Studio Template DTOs ───

export class CreateImageTemplateDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string

  @ApiProperty({ description: "Format réseau social (ex: '1:1', '4:5', '9:16', '16:9')" })
  @IsString()
  @IsNotEmpty()
  format: string

  @ApiPropertyOptional({ description: "Couleur d'accent (hex)" })
  @IsString()
  @IsOptional()
  accent?: string

  @ApiProperty({ description: 'Définition du template (éléments, etc.) en JSON.' })
  @IsObject()
  definition: Record<string, unknown>

  @ApiPropertyOptional({
    description: "Id du template statique d'origine (absent si créé de zéro).",
  })
  @IsString()
  @IsOptional()
  sourceKey?: string
}

export class UpdateImageTemplateDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  format?: string

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  accent?: string

  @ApiPropertyOptional({ description: 'Définition du template en JSON.' })
  @IsObject()
  @IsOptional()
  definition?: Record<string, unknown>
}

// ─── Context DTOs ───

export class AnalyzeContextDto {
  @ApiProperty({ description: 'User natural-language prompt describing the change to apply.' })
  @IsString()
  @IsNotEmpty()
  prompt: string

  @ApiPropertyOptional({ type: [String], description: 'Meta product IDs targeted.' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  productIds?: string[]

  @ApiPropertyOptional({
    type: [String],
    description: 'Meta product set (collection) IDs targeted.',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  collectionIds?: string[]
}

export class SaveContextDto {
  @ApiProperty({ description: 'Final context content to persist on each selected entity.' })
  @IsString()
  content: string

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  productIds?: string[]

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  collectionIds?: string[]
}

export class UpdateProductContextDto {
  @ApiProperty()
  @IsString()
  content: string

  @ApiPropertyOptional({
    description: 'When true, also update every product sharing the previous identical content.',
  })
  @IsOptional()
  applyToSiblings?: boolean
}

// ─── Post linking DTOs ───

export class LinkPostsDto {
  @ApiProperty({ type: [String], description: 'Provider post IDs (FB post / IG media) to link.' })
  @IsArray()
  @IsString({ each: true })
  postIds: string[]

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  productIds?: string[]

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  collectionIds?: string[]
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

  @ApiPropertyOptional({ type: [String] })
  additionalImageUrls?: string[]

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
