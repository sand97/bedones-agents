import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { ConfigService } from '@nestjs/config'
import { HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages'
import { LlmFactoryService } from '../common/llm/llm-factory.service'
import { createRequire } from 'module'
const _require = createRequire(__filename)
const { createReactAgent } = _require('@langchain/langgraph/prebuilt')

import { PrismaService } from '../prisma/prisma.service'
import { EventsGateway } from '../gateway/events.gateway'
import { MessagingService } from '../social/messaging.service'
import { CatalogSearchService } from '../image-processing/catalog-search.service'
import { ImageProductMatchingService } from '../image-processing/image-product-matching.service'
import { AgentPromptsService } from './prompts/agent-prompts.service'
import type { IncomingMessageEvent } from '../social/webhook.service'
import { CreditService } from '../stats/credit.service'
import type { CreditMediaType } from '../../generated/prisma/client'

import { createCommunicationTools } from './tools/live/communication.tools'
import { createCatalogTools } from './tools/live/catalog.tools'
import { createLabelTools } from './tools/live/label.tools'
import { createMessageTools } from './tools/live/message.tools'
import { createTicketTools } from './tools/live/ticket.tools'
import { createPromotionTools } from './tools/live/promotion.tools'
import { createProductMessagingTools } from './tools/live/product-messaging.tools'

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
    private readonly prompts: AgentPromptsService,
    private readonly creditService: CreditService,
    private readonly llmFactory: LlmFactoryService,
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
      contacts.some(
        (contact) =>
          conversation.participantId.includes(contact) ||
          contact.includes(conversation.participantId) ||
          (conversation.participantName &&
            conversation.participantName.toLowerCase().includes(contact.toLowerCase())),
      )
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
      },
    })

    // Build user message content
    let userMessageContent = event.message.text || ''

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

    const systemPrompt = this.prompts.buildLiveAgentSystemPrompt({
      agentContext: agent.context || '',
      labels,
      provider: event.provider,
      canSendProducts,
    })

    // Build conversation history for context
    const historyMessages: BaseMessage[] = recentMessages
      .reverse()
      .slice(0, -1) // Exclude the last message (current)
      .map((m) => {
        const content = m.message || (m.mediaType ? `[${m.mediaType}]` : '')
        if (m.isFromPage) {
          return new SystemMessage(`[Previous AI response]: ${content}`)
        }
        return new HumanMessage(content)
      })

    // Create tools
    const tools = [
      ...createCommunicationTools({
        messagingService: this.messagingService,
        conversationId: event.conversationId,
      }),
      ...createCatalogTools({
        catalogSearchService: this.catalogSearchService,
        catalogIds,
      }),
      ...createLabelTools({
        prisma: this.prisma,
        socialAccountId: event.socialAccountId,
      }),
      ...createMessageTools({
        prisma: this.prisma,
        conversationId: event.conversationId,
      }),
      ...createTicketTools({
        prisma: this.prisma,
        gateway: this.gateway,
        agentId: agent.id,
        organisationId: agent.organisationId,
        conversationId: event.conversationId,
      }),
      ...createPromotionTools({
        prisma: this.prisma,
        organisationId: agent.organisationId,
      }),
      ...(event.provider === 'WHATSAPP' && Object.keys(catalogProviderMap).length > 0
        ? createProductMessagingTools({
            messagingService: this.messagingService,
            conversationId: event.conversationId,
            catalogProviderMap,
          })
        : []),
    ]

    // Create LLM with fallback
    const model = this.createModel()

    // Create and run the agent
    const agentExecutor = createReactAgent({
      llm: model,
      tools,
    })

    const callLimit = this.config.get<number>('AGENT_MODEL_CALL_LIMIT') || 6

    // Fire-and-forget typing indicator while the agent is reflecting.
    // WhatsApp/Meta indicators auto-expire after ~20-25s; we refresh every 18s.
    const typingInterval = setInterval(() => {
      void this.messagingService.sendTypingIndicator(event.conversationId)
    }, 18_000)
    void this.messagingService.sendTypingIndicator(event.conversationId)

    try {
      await agentExecutor.invoke(
        {
          messages: [
            new SystemMessage(systemPrompt),
            ...historyMessages,
            new HumanMessage(userMessageContent || '[Message vide]'),
          ],
        },
        {
          recursionLimit: callLimit * 2 + 1,
        },
      )

      this.logger.log(`Agent ${agent.id} processed message successfully`)
    } catch (error: unknown) {
      this.logger.error(`Agent execution failed: ${error instanceof Error ? error.message : error}`)
    } finally {
      clearInterval(typingInterval)
    }
  }

  /**
   * Returns the LLM used when the agent replies to an incoming DM/comment.
   * Uses the "flash" tier: lightweight/fast model for live response generation.
   * Gemini primary, OpenAI fallback.
   */
  private createModel() {
    return this.llmFactory.createChatModel('flash', {
      trace: { properties: { feature: 'agent-live-response' } },
    })
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
