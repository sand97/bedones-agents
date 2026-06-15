import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
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
import { AgentPromptsService } from './prompts/agent-prompts.service'
import type { IncomingMessageEvent } from '../social/webhook.service'
import { CreditService } from '../stats/credit.service'
import type { CreditMediaType } from '../../generated/prisma/client'

import { runLiveAgent } from './run-live-agent'
import { describeMessageForAgent } from './message-history.util'
import { createSingleReplyGuard } from './tools/live/turn-guard'
import { TicketAgentService } from './ticket-agent.service'
import { contactMatchesConversation } from '../social/contact-match.util'

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
    private readonly prompts: AgentPromptsService,
    private readonly creditService: CreditService,
    private readonly llmFactory: LlmFactoryService,
    private readonly ticketAgent: TicketAgentService,
  ) {}

  @OnEvent('message.incoming', { async: true })
  async handleIncomingMessage(event: IncomingMessageEvent): Promise<void> {
    try {
      await this.maybeProcess(event)
    } catch (error: unknown) {
      this.logger.error(
        `Error processing incoming message: ${error instanceof Error ? error.message : error}`,
      )
    }
  }

  private async maybeProcess(event: IncomingMessageEvent): Promise<void> {
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
      await this.processMessage(event, agentLink.agent)
      return
    }

    // No conversation override → fall back to agent's global activation rules
    if (agentLink.agent.status !== 'ACTIVE') return

    if (!this.isActivatedForConversation(agentLink, conversation)) return

    // Process the message
    await this.processMessage(event, agentLink.agent)
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

    // Get conversation history
    const recentMessages = await this.prisma.directMessage.findMany({
      where: { conversationId: event.conversationId },
      orderBy: { createdTime: 'desc' },
      take: 20,
      select: {
        message: true,
        isFromPage: true,
        senderName: true,
        mediaType: true,
        mediaUrl: true,
        metadata: true,
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

    const systemPrompt = this.prompts.buildLiveAgentSystemPrompt({
      agentContext: agent.context || '',
      labels,
      provider: event.provider,
      canSendProducts,
      canSendButtons,
      contactNotes,
      postOrigin,
    })

    // Build conversation history for context
    const historyMessages: BaseMessage[] = recentMessages
      .reverse()
      .slice(0, -1) // Exclude the last message (current)
      .map((m) => {
        const content = describeMessageForAgent(m.message, m.mediaType, m.metadata)
        // Previous page/agent replies must be AI messages, not system messages:
        // the model (Gemini) requires the single system message to be first, and
        // interleaved system messages trigger "System message should be the first one".
        if (m.isFromPage) {
          return new AIMessage(content)
        }
        return new HumanMessage(content)
      })

    // Live model tier is per-agent (admin-selectable). Unknown/legacy values fall
    // back to flash so a bad value can never break the agent.
    const tier: LiveModelTier = (LIVE_MODEL_TIERS as readonly string[]).includes(
      agent.liveModelTier,
    )
      ? (agent.liveModelTier as LiveModelTier)
      : 'flash'
    const model = this.createModel(tier)

    const callLimit = this.config.get<number>('AGENT_MODEL_CALL_LIMIT') || 6

    // Fire-and-forget typing indicator while the agent is reflecting.
    // WhatsApp/Meta indicators auto-expire after ~20-25s; we refresh every 18s —
    // but STOP as soon as the agent has delivered its message, otherwise a late
    // tool call (save_contact_note, request_ticket…) would re-show "typing" to
    // the customer after the reply was already sent.
    const replyGuard = createSingleReplyGuard()
    const typingInterval = setInterval(() => {
      if (replyGuard.sent) {
        clearInterval(typingInterval)
        return
      }
      void this.messagingService.sendTypingIndicator(event.conversationId)
    }, 18_000)
    void this.messagingService.sendTypingIndicator(event.conversationId)

    try {
      // Shared core (also used by the debug MCP and the e2e harness) so the tool
      // wiring under test never drifts from production.
      await runLiveAgent({
        systemPrompt,
        history: historyMessages,
        userMessageContent,
        model,
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
          canSendButtons,
          canSendProducts,
          replyGuard,
          enqueueTicketRequest: (p) => this.ticketAgent.enqueue(p),
        },
      })

      this.logger.log(`Agent ${agent.id} processed message successfully`)
    } catch (error: unknown) {
      this.logger.error(`Agent execution failed: ${error instanceof Error ? error.message : error}`)
    } finally {
      clearInterval(typingInterval)
    }
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
        ? { name: match.name, price: match.price, currency: match.currency, source: match.source }
        : null,
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
