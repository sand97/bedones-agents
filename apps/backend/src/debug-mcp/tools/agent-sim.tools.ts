import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Tool } from '@rekog/mcp-nest'
import { AIMessage, HumanMessage, type BaseMessage } from '@langchain/core/messages'
import { z } from 'zod'

import { PrismaService } from '../../prisma/prisma.service'
import { AgentPromptsService } from '../../agent/prompts/agent-prompts.service'
import { CatalogSearchService } from '../../image-processing/catalog-search.service'
import { LlmFactoryService } from '../../common/llm/llm-factory.service'
import type { EventsGateway } from '../../gateway/events.gateway'
import { runLiveAgent } from '../../agent/run-live-agent'
import { CapturingMessagingDouble } from '../../agent/dry-run/capturing-messaging.double'
import { createDryRunPrisma } from '../../agent/dry-run/dry-run-prisma'
import { buildAgentRunTrace, reconstructReply } from '../../agent/dry-run/extract-trace'
import { ToolCallTracer } from '../../agent/dry-run/tool-call-tracer'
import { debugOrgId } from '../debug-context'
import { DRY_RUN_AGENT, withTitle } from '../annotations'
import { chatWithAgentSchema } from './debug-tool-schemas'

/** Gateway stub — ticket emissions must not fan out during a dry-run. */
const NOOP_GATEWAY = { emitToOrg: () => {} } as unknown as EventsGateway

@Injectable()
export class DebugAgentTools {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prompts: AgentPromptsService,
    private readonly catalogSearch: CatalogSearchService,
    private readonly llmFactory: LlmFactoryService,
    private readonly config: ConfigService,
  ) {}

  @Tool({
    name: 'chat_with_agent',
    annotations: withTitle("Parler à l'agent (dry-run)", DRY_RUN_AGENT),
    description:
      "Run this organisation's live agent on a customer message in DRY-RUN mode and return the FULL trace: every tool call (name + args + result), the customer-facing reply that WOULD have been sent, and the DB writes that WOULD have happened. Uses the real LLM, real catalog search (Qdrant) and the real database (read-only) — but delivers nothing to WhatsApp and commits no write. The exact production agent code path runs, so this faithfully reproduces hallucinations. Even when the run fails (e.g. the recursion limit), the partial tool-call trace, sends and writes captured so far are still returned for diagnosis.",
    parameters: chatWithAgentSchema,
  })
  async chatWithAgent(args: z.infer<typeof chatWithAgentSchema>) {
    const organisationId = debugOrgId()

    const agent = await this.prisma.agent.findFirst({
      where: { organisationId, ...(args.agentId ? { id: args.agentId } : {}) },
      orderBy: { createdAt: 'asc' },
      include: {
        socialAccounts: {
          include: {
            socialAccount: {
              include: { catalogs: { include: { catalog: true } } },
            },
          },
        },
      },
    })
    if (!agent) {
      return { error: `No agent found for organisation ${organisationId}` }
    }

    // Resolve the channel + conversation context.
    let socialAccountId: string
    let provider: string
    let conversationId: string
    let history: BaseMessage[]
    let contactNotes: { category?: string | null; content: string }[] = []

    if (args.conversationId) {
      const conv = await this.prisma.conversation.findFirst({
        where: { id: args.conversationId, socialAccount: { organisationId } },
        include: { socialAccount: { select: { id: true, provider: true } } },
      })
      if (!conv) {
        return { error: `Conversation ${args.conversationId} not found in this organisation` }
      }
      socialAccountId = conv.socialAccount.id
      provider = conv.socialAccount.provider
      conversationId = conv.id

      const recent = await this.prisma.directMessage.findMany({
        where: { conversationId: conv.id },
        orderBy: { createdTime: 'desc' },
        take: 20,
        select: { message: true, isFromPage: true, mediaType: true },
      })
      history = recent
        .reverse()
        .map((m) =>
          m.isFromPage
            ? new AIMessage(m.message || (m.mediaType ? `[${m.mediaType}]` : ''))
            : new HumanMessage(m.message || (m.mediaType ? `[${m.mediaType}]` : '')),
        )

      contactNotes = await this.prisma.contactNote.findMany({
        where: { conversationId: conv.id },
        orderBy: { createdAt: 'asc' },
        select: { category: true, content: true },
      })
    } else {
      const link = agent.socialAccounts[0]
      if (!link) {
        return { error: 'Agent has no linked social account — pass a conversationId instead.' }
      }
      socialAccountId = link.socialAccount.id
      provider = link.socialAccount.provider
      conversationId = 'debug-ephemeral'
      history = (args.history ?? []).map((t) =>
        t.from === 'agent' ? new AIMessage(t.text) : new HumanMessage(t.text),
      )
    }

    // Catalogs linked to the agent (mirrors the production processor).
    const catalogIds: string[] = []
    const catalogProviderMap: Record<string, string> = {}
    for (const link of agent.socialAccounts) {
      for (const c of link.socialAccount.catalogs) {
        if (!catalogIds.includes(c.catalog.id)) {
          catalogIds.push(c.catalog.id)
          if (c.catalog.providerId) catalogProviderMap[c.catalog.id] = c.catalog.providerId
        }
      }
    }

    const labels = await this.prisma.label.findMany({
      where: { socialAccountId },
      select: { id: true, name: true, color: true },
    })

    const canSendProducts = provider === 'WHATSAPP' && Object.keys(catalogProviderMap).length > 0
    const canSendButtons = ['WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'TIKTOK'].includes(provider)

    const systemPrompt = this.prompts.buildLiveAgentSystemPrompt({
      agentContext: agent.context || '',
      labels,
      provider,
      canSendProducts,
      canSendButtons,
      contactNotes,
    })

    const model = this.llmFactory.createToolCallingModel('flash', resolveModelOptions(args))
    const callLimit = Number(this.config.get('AGENT_MODEL_CALL_LIMIT')) || 6

    // Dry-run seams: capture sends, intercept writes, no PostHog tracing.
    const messaging = new CapturingMessagingDouble()
    const { prisma: dryRunPrisma, writes } = createDryRunPrisma(this.prisma)
    // Records tool calls live so the trace survives a thrown run (recursion limit).
    const toolTracer = new ToolCallTracer()
    const startedAt = Date.now()

    try {
      const result = await runLiveAgent({
        systemPrompt,
        history,
        userMessageContent: args.message,
        model,
        recursionLimit: callLimit * 2 + 1,
        callbacks: [toolTracer],
        toolContext: {
          prisma: dryRunPrisma,
          messagingService: messaging.asMessagingService(),
          catalogSearchService: this.catalogSearch,
          gateway: NOOP_GATEWAY,
          conversationId,
          socialAccountId,
          agentId: agent.id,
          organisationId,
          catalogIds,
          catalogProviderMap,
          canSendButtons,
          canSendProducts,
        },
      })
      const durationMs = Date.now() - startedAt

      const trace = buildAgentRunTrace(result.messages, messaging.sends, writes)
      return {
        agent: { id: agent.id, status: agent.status },
        channelProvider: provider,
        conversationId: args.conversationId ?? null,
        socialAccountId,
        catalogIds,
        model: describeModel(model),
        durationMs,
        ...trace,
      }
    } catch (error: unknown) {
      // The run threw (often the LangGraph recursion limit) so there is no final
      // message list — but the tool tracer captured the calls as they ran. Return
      // them, the sends and the writes so a failed turn is still diagnosable.
      return {
        error: `Agent run failed: ${error instanceof Error ? error.message : String(error)}`,
        model: describeModel(model),
        durationMs: Date.now() - startedAt,
        toolCalls: toolTracer.calls,
        capturedSends: messaging.sends,
        finalReplyText: reconstructReply(messaging.sends),
        simulatedDbWrites: writes,
      }
    }
  }
}

function describeModel(model: object): { provider: string; model?: string } {
  const ctor = model.constructor?.name ?? ''
  const provider =
    ctor.includes('Google') || ctor.includes('Gemini')
      ? 'gemini'
      : ctor.includes('OpenAI')
        ? 'openai'
        : ctor || 'unknown'
  return { provider, model: (model as { model?: string }).model }
}

/**
 * Resolve the model choice for a debug run: an explicit provider/model wins,
 * otherwise the provider is inferred from the model name, otherwise we fall back
 * to the env-configured flash model. Temperature defaults to 0 (reproducible).
 */
function resolveModelOptions(args: {
  provider?: 'gemini' | 'openai'
  model?: string
  temperature?: number
}): { provider?: 'gemini' | 'openai'; model?: string; temperature: number } {
  let provider = args.provider
  if (!provider && args.model) {
    const m = args.model.toLowerCase().replace(/^models\//, '')
    if (m.startsWith('gemini')) provider = 'gemini'
    else if (m.startsWith('gpt') || /^o[1-9]/.test(m)) provider = 'openai'
  }
  return { provider, model: args.model, temperature: args.temperature ?? 0 }
}
