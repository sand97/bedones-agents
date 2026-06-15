import {
  HumanMessage,
  SystemMessage,
  isAIMessage,
  type BaseMessage,
} from '@langchain/core/messages'
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import type { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import type { ChatOpenAI } from '@langchain/openai'
import { createRequire } from 'module'

import type { PrismaService } from '../prisma/prisma.service'
import type { EventsGateway } from '../gateway/events.gateway'
import type { MessagingService } from '../social/messaging.service'
import type { CatalogSearchService } from '../image-processing/catalog-search.service'

import { createCommunicationTools } from './tools/live/communication.tools'
import { createCatalogTools } from './tools/live/catalog.tools'
import { createMessageTools } from './tools/live/message.tools'
import { createTicketTools } from './tools/live/ticket.tools'
import { createPromotionTools } from './tools/live/promotion.tools'
import { createProductMessagingTools } from './tools/live/product-messaging.tools'
import { createContactNoteTools } from './tools/live/contact-note.tools'
import { createButtonMessagingTools } from './tools/live/button-messaging.tools'
import { createSingleReplyGuard, type SingleReplyGuard } from './tools/live/turn-guard'

const _require = createRequire(__filename)
const { createReactAgent } = _require('@langchain/langgraph/prebuilt')

/**
 * Tools that deliver a message to the customer. The turn-guard already lets at
 * most ONE of these run per turn; the post-model hook in runLiveAgent uses this
 * set to END the turn after that one send, so a model that ignores the "end your
 * turn now" notice can't keep emitting blocked sends until it trips the
 * recursion limit and fails the whole turn.
 */
const CUSTOMER_FACING_TOOLS = new Set(['reply_to_message', 'send_products', 'send_buttons'])

/**
 * Injectable seams for the live agent's tools. Production passes the real
 * NestJS services; the debug MCP and the e2e harness pass doubles (a capturing
 * messaging service, a write-capturing Prisma proxy, a Postgres-backed catalog
 * search) so the SAME tool wiring can run in a dry-run / sandboxed mode.
 */
export interface LiveAgentToolContext {
  prisma: PrismaService
  messagingService: MessagingService
  catalogSearchService: CatalogSearchService
  gateway: EventsGateway
  conversationId: string
  socialAccountId: string
  agentId: string
  organisationId: string
  catalogIds: string[]
  /** internal catalog id → Meta provider catalog id */
  catalogProviderMap: Record<string, string>
  canSendButtons: boolean
  canSendProducts: boolean
  /** Shared single-reply guard. When provided, the caller can observe when the
   *  agent has delivered its message (e.g. to stop the typing indicator). */
  replyGuard?: SingleReplyGuard
  /** Enqueue an async ticket evaluation for this conversation. Omitted in dry-run. */
  enqueueTicketRequest?: (payload: {
    conversationId: string
    agentId: string
    organisationId: string
    note?: string
  }) => Promise<void> | void
}

/**
 * Assemble the exact tool set the live agent exposes to the LLM. Extracted from
 * AgentMessageProcessorService so production, the debug MCP and the e2e harness
 * all build the identical wiring (no logic drift).
 */
export async function buildLiveAgentTools(ctx: LiveAgentToolContext) {
  // One guard per turn, shared by the customer-facing tools, to GUARANTEE that
  // at most one message is delivered to the customer (no double replies). The
  // caller may pass its own so it can observe delivery (e.g. to stop typing).
  const replyGuard = ctx.replyGuard ?? createSingleReplyGuard()

  // Shared product→catalog index: search_products fills it, send_products reads
  // it so the catalog is resolved from the product (never guessed by the model).
  const productCatalogIndex = new Map<string, string>()

  // Only expose tools the agent can actually use, so every config carries the
  // smallest tool set (fewer tokens per call + fewer chances to misuse a tool):
  //  - catalog search only when at least one catalog is linked;
  //  - promotion tools only when the org has promotions.
  // (send_buttons / send_products are already gated by the canSend* flags, and
  // labels / contact notes are injected into the system prompt rather than read
  // through a tool.)
  const hasCatalog = ctx.catalogIds.length > 0
  // Promotions the agent may surface: those targeting one of this social
  // account's catalogs, plus legacy org-wide promotions (no catalog).
  const hasPromotions =
    (await ctx.prisma.promotion.count({
      where: {
        organisationId: ctx.organisationId,
        OR: [{ catalogId: null }, { catalogId: { in: ctx.catalogIds } }],
      },
    })) > 0

  return [
    ...createCommunicationTools({
      messagingService: ctx.messagingService,
      conversationId: ctx.conversationId,
      replyGuard,
    }),
    ...(hasCatalog
      ? createCatalogTools({
          catalogSearchService: ctx.catalogSearchService,
          catalogIds: ctx.catalogIds,
          productCatalogIndex,
        })
      : []),
    ...createMessageTools({
      prisma: ctx.prisma,
      conversationId: ctx.conversationId,
    }),
    ...createTicketTools({
      agentId: ctx.agentId,
      organisationId: ctx.organisationId,
      conversationId: ctx.conversationId,
      enqueueTicketRequest: ctx.enqueueTicketRequest,
    }),
    ...(hasPromotions
      ? createPromotionTools({
          prisma: ctx.prisma,
          organisationId: ctx.organisationId,
          catalogIds: ctx.catalogIds,
        })
      : []),
    ...createContactNoteTools({
      prisma: ctx.prisma,
      conversationId: ctx.conversationId,
      agentId: ctx.agentId,
    }),
    ...(ctx.canSendButtons
      ? createButtonMessagingTools({
          messagingService: ctx.messagingService,
          conversationId: ctx.conversationId,
          replyGuard,
        })
      : []),
    ...(ctx.canSendProducts
      ? createProductMessagingTools({
          messagingService: ctx.messagingService,
          conversationId: ctx.conversationId,
          catalogProviderMap: ctx.catalogProviderMap,
          productCatalogIndex,
          replyGuard,
        })
      : []),
  ]
}

export interface RunLiveAgentInput {
  systemPrompt: string
  /** Prior turns, oldest first, excluding the current incoming message. */
  history: BaseMessage[]
  userMessageContent: string
  model: ChatGoogleGenerativeAI | ChatOpenAI
  toolContext: LiveAgentToolContext
  recursionLimit: number
  callbacks?: BaseCallbackHandler[]
}

/**
 * Run one turn of the live agent (LangGraph react agent) and return the full
 * message list it accumulated. Callers extract the customer-facing reply from
 * the captured tool sends and the tool-call trace from these messages.
 */
export async function runLiveAgent(input: RunLiveAgentInput): Promise<{ messages: BaseMessage[] }> {
  // Own the single-reply guard so the post-model hook can observe it. The SAME
  // instance is handed to buildLiveAgentTools, so the customer-facing tools and
  // the hook share one source of truth for "has the reply been delivered?".
  const replyGuard = input.toolContext.replyGuard ?? createSingleReplyGuard()
  const tools = await buildLiveAgentTools({ ...input.toolContext, replyGuard })

  const agentExecutor = createReactAgent({
    llm: input.model,
    tools,
    // Hard stop. Once the turn's single customer-facing message has been
    // delivered, drop any further customer-facing tool calls the model emits so
    // the react agent routes to END instead of looping on blocked re-sends.
    // Some models (e.g. Gemini) ignore the "end your turn now" notice and keep
    // calling reply/send tools until they exhaust the recursion limit and the
    // whole turn fails. The hook is a no-op until the reply is actually sent,
    // and it keeps internal tools (save_contact_note, request_ticket…) intact.
    postModelHook: (state: { messages: BaseMessage[] }) => {
      if (!replyGuard.sent) return {}
      for (let i = state.messages.length - 1; i >= 0; i -= 1) {
        const m = state.messages[i]
        if (!isAIMessage(m)) continue
        const calls = m.tool_calls ?? []
        const kept = calls.filter((c) => !CUSTOMER_FACING_TOOLS.has(c.name))
        if (kept.length !== calls.length) {
          // Mutate in place: the conditional edge after this hook re-reads this
          // same message's tool_calls, so removing the customer-facing call(s)
          // makes it route to END (or to the remaining internal tools).
          m.tool_calls = kept
          m.additional_kwargs = { ...m.additional_kwargs, tool_calls: undefined }
        }
        break
      }
      return {}
    },
  })

  const result = await agentExecutor.invoke(
    {
      messages: [
        new SystemMessage(input.systemPrompt),
        ...input.history,
        new HumanMessage(input.userMessageContent || '[Message vide]'),
      ],
    },
    {
      recursionLimit: input.recursionLimit,
      callbacks: input.callbacks ?? [],
    },
  )

  return result as { messages: BaseMessage[] }
}
