import type { TicketActivityDiff, TicketItem } from '@app/components/whatsapp/mock-data'

/** Metadata shape stored in the ticket */
export interface TicketMetadata {
  articles?: Array<{
    id: string
    name: string
    price: number
    currency: string
    quantity: number
    imageUrl?: string
    description?: string
  }>
  charges?: Array<{
    id: string
    reason: string
    amount: number
  }>
  promotionIds?: string[]
  subtotal?: number
  chargesTotal?: number
  grandTotal?: number
}

/** API-compatible ticket shape (activities use createdAt, status can be object or string) */
export interface RealTicket {
  id: string
  title: string
  description?: string
  status?: { id: string; name: string; color: string } | string | null
  priority?: string
  contactName?: string
  contactId?: string
  provider?: string
  conversationId?: string
  createdAt: string
  metadata?: TicketMetadata | null
  activities?: Array<{
    id: string
    type: string
    author: string
    fromStatus?: string | null
    toStatus?: string | null
    diff?: TicketActivityDiff | null
    createdAt: string
  }>
  items?: TicketItem[]
  [key: string]: unknown
}

/** Promotion option from the real API */
export interface DrawerPromotionOption {
  id: string
  name: string
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT'
  discountValue: number
  /** When empty/undefined, the promotion applies to all products */
  productIds?: string[]
}
