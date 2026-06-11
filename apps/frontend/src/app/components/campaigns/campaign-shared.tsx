import { Button } from 'antd'
import { Megaphone, Plus } from 'lucide-react'
import type { PickerProduct } from '@app/components/promotions/product-picker-modal'
import type { CampaignTemplateSelection, LoyaltyTemplate } from '@app/lib/api/loyalty-api'
import type { components } from '@app/lib/api/v1'

export type TemplateBlock = {
  id: string
  allLanguages?: boolean
  languageCodes: string[]
  template: LoyaltyTemplate | null
  variableValues: Record<string, string>
  mpmProducts: PickerProduct[]
}

export type TicketStatusOption = { id: string; name: string }
export type CampaignFormPayload = components['schemas']['CreateLoyaltyCampaignDto']
export type CampaignUpdatePayload = components['schemas']['UpdateLoyaltyCampaignDto']
export type CampaignAudiencePreview = {
  maxEligible: number
  limitedCount: number
  languages: Array<{ code: string; count: number }>
}
export type CampaignDetails = {
  stats: Array<{ date: string; delivered: number; read: number; replied: number }>
  contacts: {
    data: Array<{
      id: string
      contactName: string | null
      contactPhone: string | null
      languageCode: string | null
      status: string
    }>
    total: number
  }
}

export const ALL_LANGUAGES_VALUE = '__ALL_LANGUAGES__'
export const MAX_MPM_PRODUCTS = 30

export function newBlock(): TemplateBlock {
  return {
    id: crypto.randomUUID(),
    languageCodes: [],
    template: null,
    variableValues: {},
    mpmProducts: [],
  }
}

export function templateHasMpmButton(template?: LoyaltyTemplate | null) {
  return template?.buttons?.some((button) => button.type === 'MPM') ?? false
}

export function templateFromAssignment(
  socialAccountId: string,
  assignment: CampaignTemplateSelection,
): LoyaltyTemplate {
  return {
    id: assignment.metaTemplateId,
    socialAccountId,
    name: assignment.metaTemplateName,
    language: assignment.metaTemplateLanguage,
    category: assignment.metaTemplateCategory ?? 'MARKETING',
    body: assignment.body ?? '',
    variables: Object.keys(assignment.variableValues ?? {}),
    status: 'APPROVED',
    buttons: assignment.mpmProductRetailerIds?.length
      ? [{ type: 'MPM', text: 'View items' }]
      : undefined,
  }
}

export function placeholderProduct(productId: string): PickerProduct {
  return {
    id: productId,
    name: productId,
    description: '',
    imageUrl: '',
    price: 0,
    currency: '',
  }
}

export function TemplateEmptyLike({
  title,
  description,
  buttonLabel,
  onClick,
}: {
  title: string
  description: string
  buttonLabel: string
  onClick: () => void
}) {
  return (
    <div className="create-ticket-empty-section">
      <Megaphone size={32} strokeWidth={1.5} className="text-text-muted opacity-50" />
      <div className="text-sm font-medium text-text-primary">{title}</div>
      <div className="text-xs text-text-muted">{description}</div>
      <Button onClick={onClick} icon={<Plus size={16} />} className="mt-2">
        {buttonLabel}
      </Button>
    </div>
  )
}
