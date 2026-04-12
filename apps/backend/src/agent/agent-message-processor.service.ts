import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { ConfigService } from '@nestjs/config'
import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages'
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

import { createCommunicationTools } from './tools/live/communication.tools'
import { createCatalogTools } from './tools/live/catalog.tools'
import { createLabelTools } from './tools/live/label.tools'
import { createMessageTools } from './tools/live/message.tools'

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
  ) {}

  @OnEvent('message.incoming', { async: true })
  async handleIncomingMessage(event: IncomingMessageEvent): Promise<void> {
    try {
      await this.maybeProcess(event)
    } catch (error: any) {
      this.logger.error(`Error processing incoming message: ${error.message}`)
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
    if (agentLink.agent.status !== 'ACTIVE') return

    // Check activation mode
    const activationMode = agentLink.aiActivationMode
    if (activationMode === 'OFF') return

    if (activationMode === 'CONTACTS') {
      // Only respond to whitelisted contacts
      const allowedContacts = agentLink.aiActivationContacts || []
      if (allowedContacts.length > 0) {
        const conversation = await this.prisma.conversation.findUnique({
          where: { id: event.conversationId },
          select: { participantId: true, participantName: true },
        })
        if (!conversation) return

        // Match by participantId (phone for WhatsApp) or participantName (IG/Messenger)
        const isAllowed = allowedContacts.some(
          (contact) =>
            conversation.participantId.includes(contact) ||
            contact.includes(conversation.participantId) ||
            (conversation.participantName &&
              conversation.participantName.toLowerCase().includes(contact.toLowerCase())),
        )
        if (!isAllowed) return
      }
    }

    if (activationMode === 'LABELS') {
      const activationLabels = agentLink.aiActivationLabels
      if (activationLabels.length > 0) {
        const conversationLabels = await this.prisma.conversationLabel.findMany({
          where: { conversationId: event.conversationId },
          select: { labelId: true },
        })
        const hasMatchingLabel = conversationLabels.some((cl) =>
          activationLabels.includes(cl.labelId),
        )
        if (!hasMatchingLabel) return
      }
    }

    if (activationMode === 'EXCLUDE_LABELS') {
      const excludeLabels = agentLink.aiActivationLabels
      if (excludeLabels.length > 0) {
        const conversationLabels = await this.prisma.conversationLabel.findMany({
          where: { conversationId: event.conversationId },
          select: { labelId: true },
        })
        const hasExcludedLabel = conversationLabels.some((cl) => excludeLabels.includes(cl.labelId))
        if (hasExcludedLabel) return
      }
    }

    // Process the message
    await this.processMessage(event, agentLink.agent)
  }

  private async processMessage(event: IncomingMessageEvent, agent: any): Promise<void> {
    this.logger.log(
      `Processing message for agent ${agent.id} on ${event.provider} (conversation: ${event.conversationId})`,
    )

    // Gather catalog IDs from agent's linked social accounts
    const catalogIds: string[] = []
    for (const sa of agent.socialAccounts) {
      for (const c of sa.socialAccount.catalogs) {
        if (!catalogIds.includes(c.catalog.id)) {
          catalogIds.push(c.catalog.id)
        }
      }
    }

    // Get conversation history
    const recentMessages = await this.prisma.directMessage.findMany({
      where: { conversationId: event.conversationId },
      orderBy: { createdTime: 'desc' },
      take: 15,
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
      } catch (error: any) {
        this.logger.warn(`Image processing failed: ${error.message}`)
        userMessageContent = event.message.text || '[Image envoyee par le contact]'
      }
    }

    // Build system prompt
    const labels = await this.prisma.label.findMany({
      where: { socialAccountId: event.socialAccountId },
      select: { id: true, name: true, color: true },
    })

    const systemPrompt = this.prompts.buildLiveAgentSystemPrompt({
      agentContext: agent.context || '',
      labels,
      provider: event.provider,
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
    ]

    // Create LLM with fallback
    const model = this.createModel()

    // Create and run the agent
    const agentExecutor = createReactAgent({
      llm: model,
      tools,
    })

    const callLimit = this.config.get<number>('AGENT_MODEL_CALL_LIMIT') || 6

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
    } catch (error: any) {
      this.logger.error(`Agent execution failed: ${error.message}`)
    }
  }

  private createModel() {
    const primaryModel = this.config.get<string>('AGENT_PRIMARY_MODEL') || 'gpt-4.1'
    const openaiKey = this.config.get<string>('OPENIA_API_KEY')
    const geminiKey = this.config.get<string>('GEMINI_API_KEY')
    const fallbackModel = this.config.get<string>('AGENT_FALLBACK_MODEL') || 'gemini-2.5-flash'

    if (openaiKey && primaryModel.startsWith('gpt')) {
      return new ChatOpenAI({
        model: primaryModel,
        apiKey: openaiKey,
        temperature: 0.3,
      }).withFallbacks([
        new ChatGoogleGenerativeAI({
          model: fallbackModel,
          apiKey: geminiKey,
          temperature: 0.3,
        }),
      ])
    }

    if (geminiKey) {
      return new ChatGoogleGenerativeAI({
        model: fallbackModel,
        apiKey: geminiKey,
        temperature: 0.3,
      })
    }

    return new ChatOpenAI({
      model: primaryModel,
      apiKey: openaiKey,
      temperature: 0.3,
    })
  }

  private async downloadMedia(url: string): Promise<Buffer> {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw new Error(`Media download failed: ${response.status}`)
    return Buffer.from(await response.arrayBuffer())
  }
}
