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

export class LoyaltyTemplateButtonDto {
  @ApiProperty({ enum: ['QUICK_REPLY', 'URL', 'PHONE_NUMBER', 'CATALOG', 'MPM'] })
  type: string

  @ApiProperty()
  text: string

  @ApiPropertyOptional()
  url?: string

  @ApiPropertyOptional()
  phoneNumber?: string
}

export class CreateLoyaltyTemplateDto {
  @ApiProperty()
  socialAccountId: string

  @ApiProperty()
  name: string

  @ApiPropertyOptional()
  language?: string

  @ApiPropertyOptional({ enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION'] })
  category?: string

  @ApiProperty()
  body: string

  @ApiPropertyOptional({ type: [String] })
  variables?: string[]

  @ApiPropertyOptional({ enum: ['NONE', 'TEXT', 'IMAGE', 'VIDEO'] })
  headerType?: string

  @ApiPropertyOptional()
  headerText?: string

  @ApiPropertyOptional()
  headerMediaUrl?: string

  @ApiPropertyOptional()
  footerText?: string

  @ApiPropertyOptional({ type: [LoyaltyTemplateButtonDto] })
  buttons?: LoyaltyTemplateButtonDto[]
}

export class UpdateLoyaltyTemplateDto {
  @ApiPropertyOptional()
  socialAccountId?: string

  @ApiPropertyOptional()
  name?: string

  @ApiPropertyOptional()
  language?: string

  @ApiPropertyOptional({ enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION'] })
  category?: string

  @ApiPropertyOptional()
  body?: string

  @ApiPropertyOptional({ type: [String] })
  variables?: string[]

  @ApiPropertyOptional({ enum: ['NONE', 'TEXT', 'IMAGE', 'VIDEO'] })
  headerType?: string

  @ApiPropertyOptional()
  headerText?: string

  @ApiPropertyOptional()
  headerMediaUrl?: string

  @ApiPropertyOptional()
  footerText?: string

  @ApiPropertyOptional({ type: [LoyaltyTemplateButtonDto] })
  buttons?: LoyaltyTemplateButtonDto[]
}

// ─── Campaigns ───

export class CampaignTemplateSelectionDto {
  @ApiPropertyOptional({ type: [String] })
  languageCodes?: string[]

  @ApiPropertyOptional()
  allLanguages?: boolean

  @ApiProperty()
  metaTemplateId: string

  @ApiProperty()
  metaTemplateName: string

  @ApiProperty()
  metaTemplateLanguage: string

  @ApiPropertyOptional()
  metaTemplateCategory?: string

  @ApiPropertyOptional()
  body?: string

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  variableValues?: Record<string, string>

  @ApiPropertyOptional({ type: [String] })
  mpmProductRetailerIds?: string[]

  @ApiPropertyOptional()
  mpmSectionTitle?: string

  @ApiPropertyOptional()
  mpmThumbnailProductRetailerId?: string
}

export class CampaignAudiencePreviewDto {
  @ApiProperty({ enum: ['RECENT_CONTACTS', 'PRODUCT_INTEREST', 'TICKET_STATUS'] })
  audienceType: string

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  audienceCriteria?: Record<string, unknown>

  @ApiPropertyOptional()
  audienceLimit?: number

  @ApiPropertyOptional()
  marketingTopic?: string
}

export class CreateLoyaltyCampaignDto {
  @ApiProperty()
  socialAccountId: string

  @ApiPropertyOptional()
  bonusId?: string

  @ApiPropertyOptional({ enum: ['LOYALTY', 'GENERAL'] })
  origin?: string

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

  @ApiPropertyOptional()
  marketingTopic?: string

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  segmentCriteria?: Record<string, unknown>

  @ApiPropertyOptional({ enum: ['RECENT_CONTACTS', 'PRODUCT_INTEREST', 'TICKET_STATUS'] })
  audienceType?: string

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  audienceCriteria?: Record<string, unknown>

  @ApiPropertyOptional()
  audienceLimit?: number

  @ApiPropertyOptional({ type: [CampaignTemplateSelectionDto] })
  templateAssignments?: CampaignTemplateSelectionDto[]

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  variableValues?: Record<string, string>

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

  @ApiPropertyOptional({
    enum: ['DRAFT', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'PAUSED', 'CANCELLED', 'FAILED'],
  })
  status?: string

  @ApiPropertyOptional({ enum: ['ONCE', 'DAILY', 'WEEKLY', 'MONTHLY'] })
  frequency?: string

  @ApiPropertyOptional()
  marketingTopic?: string

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  segmentCriteria?: Record<string, unknown>

  @ApiPropertyOptional({ enum: ['RECENT_CONTACTS', 'PRODUCT_INTEREST', 'TICKET_STATUS'] })
  audienceType?: string

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  audienceCriteria?: Record<string, unknown>

  @ApiPropertyOptional()
  audienceLimit?: number

  @ApiPropertyOptional({ type: [CampaignTemplateSelectionDto] })
  templateAssignments?: CampaignTemplateSelectionDto[]

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  variableValues?: Record<string, string>

  @ApiPropertyOptional()
  startDate?: string

  @ApiPropertyOptional()
  endDate?: string
}
