import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreatePromotionDto {
  @ApiProperty()
  organisationId: string

  @ApiProperty()
  name: string

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

  @ApiPropertyOptional({ type: [String] })
  productIds?: string[]
}

export class UpdatePromotionDto {
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

  @ApiPropertyOptional({ type: [String] })
  productIds?: string[]
}
