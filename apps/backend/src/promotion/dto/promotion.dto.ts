import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreatePromotionDto {
  @ApiProperty()
  organisationId: string

  @ApiPropertyOptional({ description: 'Catalog the promotion targets' })
  catalogId?: string

  @ApiProperty()
  name: string

  @ApiPropertyOptional()
  description?: string

  @ApiPropertyOptional({ enum: ['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED'] })
  status?: string

  @ApiPropertyOptional({ enum: ['PERCENTAGE', 'FIXED_AMOUNT'] })
  discountType?: string

  @ApiPropertyOptional()
  discountValue?: number

  @ApiPropertyOptional()
  code?: string

  @ApiPropertyOptional()
  startDate?: string

  @ApiPropertyOptional()
  endDate?: string

  @ApiPropertyOptional({ description: 'Minimum order amount (FCFA) to be eligible' })
  minOrderAmount?: number

  @ApiPropertyOptional({ description: 'Minimum number of articles in the order to be eligible' })
  minItemCount?: number

  @ApiPropertyOptional({ enum: ['PRODUCTS', 'CREDIT', 'PERCENT'] })
  rewardType?: string

  @ApiPropertyOptional()
  rewardCredit?: number

  @ApiPropertyOptional()
  rewardPercent?: number

  @ApiPropertyOptional({ type: [String] })
  rewardProductIds?: string[]

  @ApiPropertyOptional({ type: [String] })
  productIds?: string[]

  @ApiPropertyOptional()
  stackable?: boolean
}

export class UpdatePromotionDto {
  @ApiPropertyOptional({ description: 'Catalog the promotion targets' })
  catalogId?: string

  @ApiPropertyOptional()
  name?: string

  @ApiPropertyOptional()
  description?: string

  @ApiPropertyOptional({ enum: ['PERCENTAGE', 'FIXED_AMOUNT'] })
  discountType?: string

  @ApiPropertyOptional()
  discountValue?: number

  @ApiPropertyOptional()
  code?: string

  @ApiPropertyOptional()
  startDate?: string

  @ApiPropertyOptional()
  endDate?: string

  @ApiPropertyOptional({ enum: ['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED'] })
  status?: string

  @ApiPropertyOptional({ description: 'Minimum order amount (FCFA) to be eligible' })
  minOrderAmount?: number

  @ApiPropertyOptional({ description: 'Minimum number of articles in the order to be eligible' })
  minItemCount?: number

  @ApiPropertyOptional({ enum: ['PRODUCTS', 'CREDIT', 'PERCENT'] })
  rewardType?: string

  @ApiPropertyOptional()
  rewardCredit?: number

  @ApiPropertyOptional()
  rewardPercent?: number

  @ApiPropertyOptional({ type: [String] })
  rewardProductIds?: string[]

  @ApiPropertyOptional({ type: [String] })
  productIds?: string[]

  @ApiPropertyOptional()
  stackable?: boolean
}
