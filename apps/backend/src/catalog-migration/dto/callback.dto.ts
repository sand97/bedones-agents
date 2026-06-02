import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

/** One image POSTed by the page script (base64 data URL downloaded in-browser). */
export class UploadImageDto {
  @ApiProperty({ description: 'Image as a data URL (data:image/...;base64,...) or raw base64' })
  image: string

  @ApiPropertyOptional()
  productId?: string

  @ApiPropertyOptional()
  imageIndex?: number | string

  @ApiPropertyOptional()
  imageType?: string
}

/** A product as assembled by the page script, with re-hosted image URLs. */
export class SaveCatalogProductDto {
  @ApiProperty()
  name: string

  @ApiPropertyOptional({ nullable: true })
  description?: string | null

  @ApiPropertyOptional({ nullable: true, description: 'Major currency units (e.g. 1500.0)' })
  price?: number | null

  @ApiPropertyOptional({ nullable: true })
  currency?: string | null

  @ApiPropertyOptional({ nullable: true })
  availability?: string | null

  @ApiPropertyOptional({ nullable: true })
  retailerId?: string | null

  @ApiPropertyOptional({ nullable: true })
  imageUrl?: string | null

  @ApiPropertyOptional({ type: [String] })
  additionalImageUrls?: string[]
}

/** A collection (product set) as assembled by the page script. */
export class SaveCatalogCollectionDto {
  @ApiProperty()
  name: string

  @ApiProperty({ type: [String], description: 'retailer_ids of the products in this collection' })
  retailerIds: string[]
}

export class SaveCatalogDto {
  @ApiProperty({ type: [SaveCatalogProductDto] })
  products: SaveCatalogProductDto[]

  @ApiPropertyOptional({ type: [SaveCatalogCollectionDto] })
  collections?: SaveCatalogCollectionDto[]
}
