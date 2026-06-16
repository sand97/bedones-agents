import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { InjectQueue } from '@nestjs/bullmq'
import type { Queue } from 'bullmq'
import { ConfigService } from '@nestjs/config'
import { HumanMessage, AIMessage, type BaseMessage } from '@langchain/core/messages'
import {
  LlmFactoryService,
  LIVE_MODEL_TIERS,
  type LiveModelTier,
} from '../common/llm/llm-factory.service'
import { buildLlmTrace } from '../common/llm/llm-trace'

import { PrismaService } from '../prisma/prisma.service'
import { EventsGateway } from '../gateway/events.gateway'
import { MessagingService } from '../social/messaging.service'
import { CatalogSearchService } from '../image-processing/catalog-search.service'
import { ImageProductMatchingService } from '../image-processing/image-product-matching.service'
import { ReferralProductMatchingService } from '../image-processing/referral-product-matching.service'
import { QdrantService } from '../image-processing/qdrant.service'
import { AgentPromptsService } from './prompts/agent-prompts.service'
import type { IncomingMessageEvent } from '../social/webhook.service'
import { CreditService } from '../stats/credit.service'
import { CatalogService } from '../catalog/catalog.service'
import type { CreditMediaType } from '../../generated/prisma/client'

import { runLiveAgent } from './run-live-agent'
import { describeMessageForAgent, extractProductRefs } from './message-history.util'
import { groupByContent } from './product-context.util'
import { createSingleReplyGuard } from './tools/live/turn-guard'
import { TicketAgentService } from './ticket-agent.service'
import { contactMatchesConversation } from '../social/contact-match.util'
import { MESSAGE_PROCESSING_QUEUE } from '../queue/queue.module'
import { MessageRunCoordinator } from './message-run-coordinator'
import type {
  MessageProcessingJobData,
  MessageProcessingJobName,
} from './message-processing.processor'

/**
 * Délai d'attente avant de traiter un message (debounce par contact). Un client
 * envoie souvent plusieurs messages d'affilée (ex : une rafale d'images) : on
 * laisse passer ce délai pour que tous arrivent en base, puis seul le DERNIER
 * job du contact est traité (les précédents sont supplantés). Évite de lancer
 * l'agent sur un message incomplet et de le faire planter.
 */
const BURST_DEBOUNCE_MS = 5_000

@Injectable()
export class AgentMessageProcessorService {
  private readonly logger = new Logger(AgentMessageProcessorService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly gateway: EventsGateway,
    private readonly messagingService: MessagingService,
    private readonly catalogSearchService: CatalogSearchService,
    private readonly imageProductMatchingService: ImageProductMatchingService,
    private readonly referralProductMatchingService: ReferralProductMatchingService,
    private readonly qdrantService: QdrantService,
    private readonly prompts: AgentPromptsService,
    private readonly creditService: CreditService,
    private readonly llmFactory: LlmFactoryService,
    private readonly ticketAgent: TicketAgentService,
    private readonly catalogService: CatalogService,
    @InjectQueue(MESSAGE_PROCESSING_QUEUE) private readonly queue: Queue,
    private readonly coordinator: MessageRunCoordinator,
  ) {}

  /**
   * Producteur de la file par contact. On NE traite PAS le message ici : on
   * réserve son numéro de séquence (ce qui rend caduc tout run antérieur encore
   * en vol pour ce contact, sur n'importe quelle instance) puis on l'enfile. Le
   * worker {@link MessageProcessingProcessor} fait l'analyse, et l'abandonne si un
   * message plus récent arrive entre temps.
   */
  @OnEvent('message.incoming', { async: true })
  async handleIncomingMessage(event: IncomingMessageEvent): Promise<void> {
    try {
      const seq = await this.coordinator.claim(event.conversationId)
      await this.queue.add(
        'process' satisfies MessageProcessingJobName,
        { event, seq } satisfies MessageProcessingJobData,
        {
          removeOnComplete: true,
          removeOnFail: 100,
          // Debounce des rafales : on attend que le client finisse d'envoyer ses
          // messages groupés. Pendant ce délai, chaque nouveau message supplante
          // le précédent ; à l'expiration, seul le dernier job sera traité.
          delay: BURST_DEBOUNCE_MS,
        },
      )
    } catch (error: unknown) {
      this.logger.error(
        `Failed to enqueue incoming message: ${error instanceof Error ? error.message : error}`,
      )
    }
  }

  /**
   * Agent désactivé sur une conversation depuis l'UI (PUT agent-override →
   * FORCE_OFF) : on annule tout traitement en cours ou en attente pour ce contact,
   * sur toutes les instances. Émis par MessagingService.setConversationAgentOverride.
   */
  @OnEvent('conversation.ai.disabled', { async: true })
  async handleConversationAiDisabled(payload: { conversationId: string }): Promise<void> {
    try {
      await this.coordinator.cancelContact(payload.conversationId)
    } catch (error: unknown) {
      this.logger.error(
        `Failed to cancel runs for disabled conversation ${payload.conversationId}: ${
          error instanceof Error ? error.message : error
        }`,
      )
    }
  }

  /**
   * Point d'entrée du worker : applique les règles d'activation puis lance le run
   * d'agent avec le `signal` d'annulation fourni par la file (annulé dès qu'un
   * message plus récent du même contact arrive).
   */
  async processIncoming(event: IncomingMessageEvent, signal: AbortSignal): Promise<void> {
    try {
      await this.maybeProcess(event, signal)
    } catch (error: unknown) {
      this.logger.error(
        `Error processing incoming message: ${error instanceof Error ? error.message : error}`,
      )
    }
  }

  private async maybeProcess(event: IncomingMessageEvent, signal: AbortSignal): Promise<void> {
    // Find agent linked to this social account
    const agentLink = await this.prisma.agentSocialAccount.findUnique({
      where: { socialAccountId: event.socialAccountId },
      include: {
        agent: {
          include: {
            socialAccounts: {
              include: {
                socialAccount: {
                  include: {
                    catalogs: { include: { catalog: true } },
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!agentLink) return

    // Per-conversation override takes precedence over global agent rules
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: event.conversationId },
      select: {
        participantId: true,
        participantName: true,
        aiOverride: true,
        fromAd: true,
        createdAt: true,
      },
    })
    if (!conversation) return

    if (conversation.aiOverride === 'FORCE_OFF') return

    if (conversation.aiOverride === 'FORCE_ON') {
      // Require agent to be at least READY (score gate enforced via status transitions)
      if (agentLink.agent.status === 'DRAFT' || agentLink.agent.status === 'CONFIGURING') return
      await this.processMessage(event, agentLink.agent, signal)
      return
    }

    // No conversation override → fall back to agent's global activation rules
    if (agentLink.agent.status !== 'ACTIVE') return

    if (!this.isActivatedForConversation(agentLink, conversation)) return

    // Process the message
    await this.processMessage(event, agentLink.agent, signal)
  }

  /**
   * Combinable activation scopes (all of them OR'd together), except `aiActivateAll`
   * which short-circuits to true. Mirrors MessagingService.computeConversationActive
   * so the chat header and the live processor stay consistent.
   */
  private isActivatedForConversation(
    link: {
      aiActivateAll: boolean
      aiActivateAds: boolean
      aiActivateNewConversations: boolean
      aiActivatedAt: Date | null
      aiActivationContacts: string[]
    },
    conversation: {
      participantId: string
      participantName: string
      fromAd: boolean
      createdAt: Date
    },
  ): boolean {
    if (link.aiActivateAll) return true

    // "By contacts" — mainly used to test the agent on a handful of contacts.
    const contacts = link.aiActivationContacts || []
    if (
      contacts.length > 0 &&
      contacts.some((contact) => contactMatchesConversation(contact, conversation))
    ) {
      return true
    }

    if (link.aiActivateAds && conversation.fromAd) return true

    if (
      link.aiActivateNewConversations &&
      link.aiActivatedAt &&
      conversation.createdAt >= link.aiActivatedAt
    ) {
      return true
    }

    return false
  }

  private async processMessage(
    event: IncomingMessageEvent,
    agent: {
      id: string
      context: string | null
      organisationId: string
      status: string
      liveModelTier: string
      socialAccounts: {
        socialAccount: {
          catalogs: { catalog: { id: string; providerId: string | null } }[]
        }
      }[]
    },
    signal: AbortSignal,
  ): Promise<void> {
    this.logger.log(
      `Processing message for agent ${agent.id} on ${event.provider} (conversation: ${event.conversationId})`,
    )

    // We've decided to reply → surface the typing indicator immediately, before the
    // (potentially slow) history backfill / image processing below. A periodic
    // refresh keeps it alive while the agent reflects (see typingInterval).
    void this.messagingService.sendTypingIndicator(event.conversationId)

    await this.creditService.logOperation({
      organisationId: agent.organisationId,
      agentId: agent.id,
      conversationId: event.conversationId,
      mediaType: resolveMediaType(event.message.mediaType),
    })

    // Gather catalog IDs from agent's linked social accounts
    const catalogIds: string[] = []
    const catalogProviderMap: Record<string, string> = {} // internalId → Meta providerId
    for (const sa of agent.socialAccounts) {
      for (const c of sa.socialAccount.catalogs) {
        if (!catalogIds.includes(c.catalog.id)) {
          catalogIds.push(c.catalog.id)
          if (c.catalog.providerId) {
            catalogProviderMap[c.catalog.id] = c.catalog.providerId
          }
        }
      }
    }

    // First-message backfill: when this is the very first message we have for the
    // conversation, pull the last 20 messages from the platform so the agent doesn't
    // answer blind on a thread that already existed (e.g. previous human handover).
    const existingMessageCount = await this.prisma.directMessage.count({
      where: { conversationId: event.conversationId },
    })
    if (existingMessageCount <= 1) {
      try {
        await this.messagingService.backfillConversationHistory(event.conversationId, 20)
      } catch (error: unknown) {
        this.logger.warn(
          `Conversation history backfill failed for ${event.conversationId}: ${error instanceof Error ? error.message : error}`,
        )
      }
    }

    // Live model tier is per-agent (admin-selectable). Unknown/legacy values fall
    // back to flash so a bad value can never break the agent. Resolved here (and
    // not only at model-build time) because the conversation-history depth depends
    // on the tier (a more capable tier gets a longer memory window).
    const tier: LiveModelTier = (LIVE_MODEL_TIERS as readonly string[]).includes(
      agent.liveModelTier,
    )
      ? (agent.liveModelTier as LiveModelTier)
      : 'flash'
    const historyLimit = this.resolveHistoryLimit(tier)

    // Get conversation history
    const recentMessages = await this.prisma.directMessage.findMany({
      where: { conversationId: event.conversationId },
      orderBy: { createdTime: 'desc' },
      take: historyLimit,
      select: {
        message: true,
        isFromPage: true,
        senderName: true,
        mediaType: true,
        mediaUrl: true,
        metadata: true,
        // The message a customer quoted (e.g. tapped "reply" on a product card).
        // Needed so we can describe the referenced product to the agent.
        replyTo: {
          select: { message: true, mediaType: true, metadata: true },
        },
      },
    })

    // Build user message content
    let userMessageContent = event.message.text || ''

    // An order (WhatsApp cart) arrives with empty text — describe it from the
    // stored order metadata so the agent reacts to the products, not a blank.
    if (!userMessageContent.trim() && recentMessages[0]?.mediaType === 'order') {
      userMessageContent = describeMessageForAgent(
        recentMessages[0].message,
        recentMessages[0].mediaType,
        recentMessages[0].metadata,
      )
    }

    // The customer is referring to a previous product ("celle-ci", "la même
    // couleur", "je veux ça taille 58"). Surface that product — with its retailer
    // id — so the agent knows what they mean instead of asking in a loop. Two
    // sources, in priority:
    //   1. WhatsApp's explicit `referred_product` (stored as metadata.referredProduct
    //      by the webhook): the exact retailer id, reliable even when we never
    //      stored the quoted message ourselves.
    //   2. Otherwise the quoted message resolved via context.id (replyTo).
    // Images go through their own pipeline below.
    const currentMeta =
      recentMessages[0]?.metadata && typeof recentMessages[0].metadata === 'object'
        ? (recentMessages[0].metadata as { referredProduct?: { retailerId?: string } })
        : null
    const referredRetailerId = currentMeta?.referredProduct?.retailerId
    const quotedMessage = recentMessages[0]?.replyTo
    if (event.message.mediaType !== 'image' && (referredRetailerId || quotedMessage)) {
      let quotedText: string | null = null
      if (referredRetailerId) {
        // Enrich the id with a human-readable name from the quoted card when we have it.
        const name = quotedMessage
          ? extractProductRefs(quotedMessage.metadata).find(
              (r) => r.retailerId === referredRetailerId,
            )?.name
          : undefined
        quotedText = name ? `${name} (${referredRetailerId})` : `produit ${referredRetailerId}`
      } else if (quotedMessage) {
        quotedText = describeMessageForAgent(
          quotedMessage.message,
          quotedMessage.mediaType,
          quotedMessage.metadata,
        )
      }
      if (quotedText) {
        userMessageContent = userMessageContent
          ? `${userMessageContent} [en réponse à : ${quotedText}]`
          : `[en réponse à : ${quotedText}]`
      }
    }

    // Handle image messages via product matching pipeline
    if (event.message.mediaType === 'image' && event.message.mediaUrl && catalogIds.length > 0) {
      try {
        const imageBuffer = await this.downloadMedia(event.message.mediaUrl)
        const matchResult = await this.imageProductMatchingService.matchIncomingImage({
          imageBuffer,
          catalogIds,
          messageBody: event.message.text,
        })
        userMessageContent = matchResult.agentPayload.body
      } catch (error: unknown) {
        this.logger.warn(
          `Image processing failed: ${error instanceof Error ? error.message : error}`,
        )
        userMessageContent = event.message.text || '[Image envoyee par le contact]'
      }
    }

    // Build system prompt
    const labels = await this.prisma.label.findMany({
      where: { socialAccountId: event.socialAccountId },
      select: { id: true, name: true, color: true },
    })

    const canSendProducts =
      event.provider === 'WHATSAPP' && Object.keys(catalogProviderMap).length > 0

    // Interactive reply buttons: WhatsApp/Messenger/Instagram (reply buttons /
    // quick replies) and TikTok (QA_BUTTON_CARD), all capped at 3 buttons.
    const canSendButtons = ['WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'TIKTOK'].includes(event.provider)

    // Per-customer memory saved on previous turns — injected so the agent reuses
    // it (delivery address, phone, sizes…) instead of asking again.
    const contactNotes = await this.prisma.contactNote.findMany({
      where: { conversationId: event.conversationId },
      orderBy: { createdAt: 'asc' },
      select: { category: true, content: true },
    })

    // Message opened from a social post: resolve the product it was about so the agent
    // can answer "more info on this?" without re-asking. Best-effort — never blocks a reply.
    const postOrigin = await this.buildPostOrigin(event, agent.organisationId)

    // Re-inject the merchant context of products already in this conversation so
    // a follow-up that does NOT trigger a new search still respects each
    // product's rules (available sizes, advice…). Best-effort — never blocks.
    const conversationProductContext = await this.buildConversationProductContext(
      event.conversationId,
      catalogIds,
    )

    const systemPrompt = this.prompts.buildLiveAgentSystemPrompt({
      agentContext: agent.context || '',
      labels,
      provider: event.provider,
      canSendProducts,
      canSendButtons,
      contactNotes,
      conversationProductContext,
      postOrigin,
    })

    // Build conversation history for context
    const historyMessages: BaseMessage[] = recentMessages
      .reverse()
      .slice(0, -1) // Exclude the last message (current)
      .map((m) => {
        const content = describeMessageForAgent(m.message, m.mediaType, m.metadata, m.replyTo)
        // Previous page/agent replies must be AI messages, not system messages:
        // the model (Gemini) requires the single system message to be first, and
        // interleaved system messages trigger "System message should be the first one".
        if (m.isFromPage) {
          return new AIMessage(content)
        }
        return new HumanMessage(content)
      })

    const model = this.createModel(tier)

    const callLimit = this.config.get<number>('AGENT_MODEL_CALL_LIMIT') || 6

    // Fire-and-forget typing indicator while the agent is reflecting.
    // WhatsApp/Meta indicators auto-expire after ~20-25s; we refresh every 18s —
    // but STOP as soon as the agent has delivered its message, otherwise a late
    // tool call (save_contact_note, request_ticket…) would re-show "typing" to
    // the customer after the reply was already sent.
    const replyGuard = createSingleReplyGuard()
    const typingInterval = setInterval(() => {
      // Stop dès que la réponse est partie OU que le run a été annulé par un
      // message plus récent — sinon on ré-afficherait "en train d'écrire" pour
      // un traitement qui n'aboutira jamais.
      if (replyGuard.sent || signal.aborted) {
        clearInterval(typingInterval)
        return
      }
      void this.messagingService.sendTypingIndicator(event.conversationId)
    }, 18_000)
    void this.messagingService.sendTypingIndicator(event.conversationId)

    // Un message plus récent a pu arriver pendant le backfill / le traitement
    // d'image ci-dessus : ne pas lancer l'analyse LLM d'un run déjà périmé.
    if (signal.aborted) {
      clearInterval(typingInterval)
      this.logger.log(`Run annulé avant analyse pour la conversation ${event.conversationId}`)
      return
    }

    try {
      // Shared core (also used by the debug MCP and the e2e harness) so the tool
      // wiring under test never drifts from production.
      await runLiveAgent({
        systemPrompt,
        history: historyMessages,
        userMessageContent,
        model,
        signal,
        recursionLimit: callLimit * 2 + 1,
        // Trace at invoke time so the model passed to createReactAgent keeps
        // its `bindTools` method (a wrapped/traced Runnable would hide it).
        // Attribute the whole turn to the org/contact/conversation so PostHog
        // tracks users & traces, not just cost.
        callbacks: this.llmFactory.buildTraceCallbacks(
          buildLlmTrace({
            feature: 'agent-live-response',
            organisationId: agent.organisationId,
            conversationId: event.conversationId,
            contactId: event.message.senderId,
            agentId: agent.id,
            socialAccountId: event.socialAccountId,
            provider: event.provider,
            tier,
          }),
        ),
        toolContext: {
          prisma: this.prisma,
          messagingService: this.messagingService,
          catalogSearchService: this.catalogSearchService,
          gateway: this.gateway,
          conversationId: event.conversationId,
          socialAccountId: event.socialAccountId,
          agentId: agent.id,
          organisationId: agent.organisationId,
          catalogIds,
          catalogProviderMap,
          catalogService: this.catalogService,
          canSendButtons,
          canSendProducts,
          replyGuard,
          enqueueTicketRequest: (p) => this.ticketAgent.enqueue(p),
        },
      })

      this.logger.log(`Agent ${agent.id} processed message successfully`)
    } catch (error: unknown) {
      // Annulation volontaire (message plus récent du même contact) : ce n'est
      // pas une erreur, le run a été abandonné avant d'envoyer une réponse.
      if (signal.aborted) {
        this.logger.log(
          `Analyse IA annulée pour la conversation ${event.conversationId} (message plus récent)`,
        )
      } else {
        this.logger.error(
          `Agent execution failed: ${error instanceof Error ? error.message : error}`,
        )
      }
    } finally {
      clearInterval(typingInterval)
    }
  }

  /**
   * How many of the conversation's most recent messages are loaded into the
   * agent's context window. Defaults to 40 and is tunable per live tier so a more
   * capable offer (flash → pro → ultra) can carry a longer memory:
   *   AGENT_HISTORY_LIMIT          (global default, fallback 40)
   *   AGENT_HISTORY_LIMIT_FLASH    (overrides the default for the flash tier)
   *   AGENT_HISTORY_LIMIT_PRO      (overrides the default for the pro tier)
   *   AGENT_HISTORY_LIMIT_ULTRA    (overrides the default for the ultra tier)
   * A non-numeric / non-positive value falls back to the default (40).
   */
  private resolveHistoryLimit(tier: LiveModelTier): number {
    const DEFAULT_HISTORY_LIMIT = 40
    const parse = (raw: unknown): number | null => {
      const n = Number(raw)
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : null
    }
    const fallback = parse(this.config.get('AGENT_HISTORY_LIMIT')) ?? DEFAULT_HISTORY_LIMIT
    const perTier = parse(this.config.get(`AGENT_HISTORY_LIMIT_${tier.toUpperCase()}`))
    return perTier ?? fallback
  }

  /**
   * Returns the LLM used when the agent replies to an incoming DM/comment, on the
   * agent's chosen live tier (flash/pro/ultra). Gemini primary, OpenAI fallback.
   */
  private createModel(tier: LiveModelTier) {
    // createReactAgent needs a model that exposes `bindTools`, so we use a single
    // tool-callable model here (not the fallback/traced Runnable from
    // createChatModel). PostHog tracing is attached at invoke time via callbacks.
    return this.llmFactory.createToolCallingModel(tier)
  }

  /**
   * Resolve the catalog product a social-post referral points to, shaped for the
   * system prompt's `postOrigin`. Returns undefined when the message has no referral;
   * returns the post text with a null product when nothing could be resolved.
   */
  private async buildPostOrigin(
    event: IncomingMessageEvent,
    organisationId: string,
  ): Promise<
    | {
        headline: string | null
        body: string | null
        product: {
          name: string
          price?: number
          currency?: string
          retailerId?: string
          source: 'post-link' | 'semantic'
        } | null
      }
    | undefined
  > {
    const referral = event.referral
    if (!referral) return undefined

    const match = await this.referralProductMatchingService
      .resolveFromReferral({
        organisationId,
        sourceId: referral.sourceId,
        body: referral.body,
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `Referral product resolution failed: ${error instanceof Error ? error.message : error}`,
        )
        return null
      })

    return {
      headline: referral.headline,
      body: referral.body,
      product: match
        ? {
            name: match.name,
            price: match.price,
            currency: match.currency,
            retailerId: match.retailerId,
            source: match.source,
          }
        : null,
    }
  }

  /**
   * Build the grouped merchant context of products ALREADY referenced in this
   * conversation (sent product cards, orders). Conversations carry products only
   * by retailer_id, so we resolve retailer_id → product_id via Qdrant, load the
   * ProductContext (keyed by product_id) and group products sharing the same
   * context. Best-effort: any failure yields no block, never an error.
   */
  private async buildConversationProductContext(
    conversationId: string,
    catalogIds: string[],
  ): Promise<
    Array<{ content: string; products: Array<{ name: string; retailerId: string }> }> | undefined
  > {
    if (catalogIds.length === 0) return undefined

    try {
      // Last 40 messages — covers the active part of the conversation.
      const recent = await this.prisma.directMessage.findMany({
        where: { conversationId },
        orderBy: { createdTime: 'desc' },
        take: 40,
        select: { metadata: true },
      })

      // Unique retailer ids referenced (exact structured ids only), keep a name.
      const nameByRetailerId = new Map<string, string>()
      for (const m of recent) {
        for (const ref of extractProductRefs(m.metadata)) {
          if (!nameByRetailerId.has(ref.retailerId)) {
            nameByRetailerId.set(ref.retailerId, ref.name ?? ref.retailerId)
          }
        }
      }
      if (nameByRetailerId.size === 0) return undefined

      const retailerIds = [...nameByRetailerId.keys()]

      // retailer_id → { product_id, catalogId }; first catalog that knows it wins.
      const resolved = new Map<string, { productId: string; catalogId: string }>()
      for (const catalogId of catalogIds) {
        const pending = retailerIds.filter((id) => !resolved.has(id))
        if (pending.length === 0) break
        const map = await this.qdrantService.findProductIdsByRetailerIds(catalogId, pending)
        for (const [retailerId, productId] of map) {
          if (!resolved.has(retailerId)) resolved.set(retailerId, { productId, catalogId })
        }
      }
      if (resolved.size === 0) return undefined

      // Curated context for those products (keyed by product_id).
      const contexts = await this.prisma.productContext.findMany({
        where: {
          OR: [...resolved.values()].map((r) => ({
            catalogId: r.catalogId,
            providerProductId: r.productId,
          })),
        },
        select: { providerProductId: true, content: true },
      })
      const contentByProductId = new Map<string, string>()
      for (const c of contexts) {
        const content = c.content?.trim()
        if (content) contentByProductId.set(c.providerProductId, content)
      }
      if (contentByProductId.size === 0) return undefined

      // Group products that share the same context (written once).
      const entries = [...resolved].flatMap(([retailerId, r]) => {
        const content = contentByProductId.get(r.productId)
        if (!content) return []
        return [
          { item: { name: nameByRetailerId.get(retailerId) ?? retailerId, retailerId }, content },
        ]
      })
      return groupByContent(entries).map((g) => ({ content: g.content, products: g.items }))
    } catch (error) {
      this.logger.warn(
        `Conversation product context build failed: ${error instanceof Error ? error.message : error}`,
      )
      return undefined
    }
  }

  private async downloadMedia(url: string): Promise<Buffer> {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw new Error(`Media download failed: ${response.status}`)
    return Buffer.from(await response.arrayBuffer())
  }
}

function resolveMediaType(raw: string | null | undefined): CreditMediaType {
  if (raw === 'image') return 'IMAGE'
  if (raw === 'audio') return 'AUDIO'
  return 'TEXT'
}
