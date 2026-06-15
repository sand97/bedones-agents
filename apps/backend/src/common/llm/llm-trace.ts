import { randomUUID } from 'node:crypto'
import type { LlmTraceContext } from './llm-factory.service'

/**
 * Semantic inputs for a PostHog LLM trace. Everything is optional except the
 * `feature` label, so any call site passes only what it knows. The helper turns
 * these into the {@link LlmTraceContext} the factory understands, applying ONE
 * consistent convention across the whole backend so PostHog → LLM analytics gets
 * far more than just cost:
 *
 * - `distinctId` = the conversation when known. A conversation is exactly one
 *   (socialAccount, contact) pair — `Conversation @@unique[socialAccountId,
 *   participantId]` — i.e. one customer on one channel, and it groups all the
 *   messages of an exchange (and therefore all the AI replies). So keying the
 *   "Generative AI user" on `conversationId` makes one user = one real
 *   conversation, and it lines up with the `conversation_id` used in Logs.
 *   Falls back to the organisation id for conversation-less tasks (onboarding,
 *   catalog analysis, error explanation), then a stable `backend:<feature>`
 *   bucket so internal/background features stay separable.
 * - `groups.organisation` = the organisation id, matching the group key already
 *   used everywhere else (see POSTHOG.md) for coherent end-to-end per-org rollups.
 * - `traceId` groups every model call of one logical run (a whole agent turn —
 *   tool calls and provider fallback included) into a single PostHog trace. A
 *   fresh one is generated per run unless the caller pins it.
 * - the remaining ids land in `properties` so any generation can be filtered by
 *   conversation, contact, agent, channel, tier… in the LLM analytics UI.
 */
export interface LlmTraceInput {
  /** Feature label surfaced in PostHog (e.g. `agent-live-response`). */
  feature: string
  /** Organisation the call belongs to → `distinctId` + `organisation` group. */
  organisationId?: string | null
  /** Conversation the call is about (live agent, ticketing, language…). */
  conversationId?: string | null
  /** End customer the agent is talking to (platform sender / participant id). */
  contactId?: string | null
  /** Agent that triggered the call. */
  agentId?: string | null
  /** Social account / channel the call relates to. */
  socialAccountId?: string | null
  /** Channel provider (WHATSAPP, INSTAGRAM, FACEBOOK, TIKTOK). */
  provider?: string | null
  /** Model tier in play (flash / pro / ultra / thinking). */
  tier?: string | null
  /** Catalog the call is about (catalog tooling). */
  catalogId?: string | null
  /** Pin the trace id (else a fresh one groups this run's calls). */
  traceId?: string
  /** Extra free-form properties, merged last. */
  properties?: Record<string, unknown>
}

/**
 * Builds a consistent {@link LlmTraceContext} from semantic inputs. Cheap and
 * pure — safe to call inline at any LLM call site.
 */
export function buildLlmTrace(input: LlmTraceInput): LlmTraceContext {
  const properties: Record<string, unknown> = { feature: input.feature }
  const put = (key: string, value: unknown): void => {
    if (value !== undefined && value !== null && value !== '') properties[key] = value
  }
  put('organisationId', input.organisationId)
  put('conversationId', input.conversationId)
  put('contactId', input.contactId)
  put('agentId', input.agentId)
  put('socialAccountId', input.socialAccountId)
  put('provider', input.provider)
  put('tier', input.tier)
  put('catalogId', input.catalogId)
  if (input.properties) Object.assign(properties, input.properties)

  const organisationId = input.organisationId || undefined
  const conversationId = input.conversationId || undefined

  return {
    // A PostHog LLM "user" = a unique conversation = one (socialAccount, contact)
    // pair (see the interface docs). Every message + AI reply of the same
    // exchange therefore rolls up to one user. Conversation-less tasks fall back
    // to the org, then a per-feature bucket. The organisation stays available as
    // a group for org-level rollups regardless.
    distinctId: conversationId ?? organisationId ?? `backend:${input.feature}`,
    traceId: input.traceId ?? randomUUID(),
    groups: organisationId ? { organisation: organisationId } : undefined,
    properties,
  }
}
