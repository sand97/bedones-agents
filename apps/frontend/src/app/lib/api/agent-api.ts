/**
 * Typed API client for Agent, Catalog, Ticket, Promotion endpoints.
 * We use raw fetch via apiClient's baseUrl + credentials since
 * the openapi types (v1.d.ts) don't yet include these new endpoints.
 *
 * The implementation is split by domain under `./agent/`; this file
 * re-exports everything so existing import paths keep working.
 */

export { getApiErrorMessage } from './agent/http'

export { agentApi } from './agent/agent'
export type { Agent, AgentMessage, AgentSocialAccount } from './agent/agent'

export { catalogApi } from './agent/catalog'
export type {
  Catalog,
  CatalogMigration,
  CatalogSocialLink,
  Collection,
  PostLink,
  PostLinkList,
  Product,
} from './agent/catalog'

export { ticketApi } from './agent/ticket'
export type { Ticket, TicketStatusItem } from './agent/ticket'

export { promotionApi } from './agent/promotion'
export type { PromotionItem } from './agent/promotion'

export { labelApi } from './agent/labels'
export type { LabelItem } from './agent/labels'

export { conversationApi, socialApi } from './agent/social'
export type { ConversationItem, SocialAccount } from './agent/social'
