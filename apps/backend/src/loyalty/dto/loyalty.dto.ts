import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

// ─── Contacts ───

export class CreateLoyaltyContactDto {
  @ApiProperty()
  socialAccountId: string

  @ApiProperty()
  name: string

  @ApiProperty()
  phone: string

  @ApiPropertyOptional()
  totalSpent?: number

  @ApiPropertyOptional()
  orderCount?: number
}

export class UpdateLoyaltyContactDto {
  @ApiPropertyOptional()
  name?: string

  @ApiPropertyOptional()
  phone?: string

  @ApiPropertyOptional()
  totalSpent?: number

  @ApiPropertyOptional()
  orderCount?: number
}

// ─── Bonus ───

export class CreateLoyaltyBonusDto {
  @ApiProperty()
  socialAccountId: string

  @ApiProperty()
  name: string

  @ApiPropertyOptional()
  description?: string

  @ApiPropertyOptional()
  stackable?: boolean

  @ApiPropertyOptional()
  targetSpend?: number

  @ApiPropertyOptional()
  targetOrderCount?: number

  @ApiPropertyOptional()
  targetProductsCount?: number

  @ApiPropertyOptional({ type: [String] })
  triggerProductIds?: string[]

  @ApiProperty({ enum: ['PRODUCTS', 'CREDIT', 'PERCENT'] })
  rewardType: string

  @ApiPropertyOptional()
  rewardCredit?: number

  @ApiPropertyOptional()
  rewardPercent?: number

  @ApiPropertyOptional({ type: [String] })
  rewardProductIds?: string[]

  @ApiPropertyOptional()
  startDate?: string

  @ApiPropertyOptional()
  endDate?: string
}

export class UpdateLoyaltyBonusDto {
  @ApiPropertyOptional()
  name?: string

  @ApiPropertyOptional()
  description?: string

  @ApiPropertyOptional({ enum: ['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED'] })
  status?: string

  @ApiPropertyOptional()
  stackable?: boolean

  @ApiPropertyOptional()
  targetSpend?: number

  @ApiPropertyOptional()
  targetOrderCount?: number

  @ApiPropertyOptional()
  targetProductsCount?: number

  @ApiPropertyOptional({ type: [String] })
  triggerProductIds?: string[]

  @ApiPropertyOptional({ enum: ['PRODUCTS', 'CREDIT', 'PERCENT'] })
  rewardType?: string

  @ApiPropertyOptional()
  rewardCredit?: number

  @ApiPropertyOptional()
  rewardPercent?: number

  @ApiPropertyOptional({ type: [String] })
  rewardProductIds?: string[]

  @ApiPropertyOptional()
  startDate?: string

  @ApiPropertyOptional()
  endDate?: string
}

// ─── Templates (Meta-only — never persisted) ───

export class CreateLoyaltyTemplateDto {
  @ApiProperty()
  socialAccountId: string

  @ApiProperty()
  name: string

  @ApiPropertyOptional()
  language?: string

  @ApiPropertyOptional({ enum: ['MARKETING', 'UTILITY'] })
  category?: string

  @ApiProperty()
  body: string

  @ApiPropertyOptional({ type: [String] })
  variables?: string[]
}

// ─── Campaigns ───

export class CreateLoyaltyCampaignDto {
  @ApiProperty()
  socialAccountId: string

  @ApiProperty()
  bonusId: string

  @ApiPropertyOptional({ description: 'Meta WhatsApp template id' })
  metaTemplateId?: string

  @ApiPropertyOptional({ description: 'Meta WhatsApp template name' })
  metaTemplateName?: string

  @ApiPropertyOptional({ description: 'Meta WhatsApp template language' })
  metaTemplateLanguage?: string

  @ApiProperty()
  name: string

  @ApiPropertyOptional({ enum: ['ONCE', 'DAILY', 'WEEKLY', 'MONTHLY'] })
  frequency?: string

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  segmentCriteria?: Record<string, unknown>

  @ApiPropertyOptional()
  startDate?: string

  @ApiPropertyOptional()
  endDate?: string
}

export class UpdateLoyaltyCampaignDto {
  @ApiPropertyOptional()
  name?: string

  @ApiPropertyOptional()
  metaTemplateId?: string

  @ApiPropertyOptional()
  metaTemplateName?: string

  @ApiPropertyOptional()
  metaTemplateLanguage?: string

  @ApiPropertyOptional({ enum: ['DRAFT', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'PAUSED'] })
  status?: string

  @ApiPropertyOptional({ enum: ['ONCE', 'DAILY', 'WEEKLY', 'MONTHLY'] })
  frequency?: string

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  segmentCriteria?: Record<string, unknown>

  @ApiPropertyOptional()
  startDate?: string

  @ApiPropertyOptional()
  endDate?: string
}
