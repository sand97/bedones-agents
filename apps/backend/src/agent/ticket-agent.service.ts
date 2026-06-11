import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { PrismaService } from '../prisma/prisma.service'
import { LlmFactoryService } from '../common/llm/llm-factory.service'
import { EventsGateway } from '../gateway/events.gateway'
import { AgentPromptsService } from './prompts/agent-prompts.service'
import { TICKET_AGENT_QUEUE } from '../queue/queue.module'

export interface TicketAgentJobData {
  conversationId: string
  agentId: string
  organisationId: string
  /** Optional one-line hint from the live agent about what the customer wants. */
  note?: string
}

export type TicketAgentJobName = 'process'

/** Max conversation messages handed to the ticket agent for context. */
const HISTORY_LIMIT = 30

const decisionSchema = z
  .object({
    action: z
      .enum(['create', 'update', 'noop'])
      .describe(
        '"create" for a new/distinct request, "update" when it is the same request as an existing ticket, "noop" when nothing is actionable.',
      ),
    ticketId: z
      .string()
      .optional()
      .describe('Existing ticket id to update — required only when action = "update".'),
    title: z.string().optional().describe('Short ticket title.'),
    description: z
      .string()
      .optional()
      .describe('Summary of the request: product/studio, dates, total, useful info.'),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    articleRetailerIds: z
      .array(z.string())
      .optional()
      .describe(
        'Retailer ids of the product(s) the customer chose — ONLY ids from the "Produits montrés" list. Never invent an id.',
      ),
  })
  .describe('Single ticket decision for the conversation.')

type TicketDecision = z.infer<typeof decisionSchema>

/**
 * Dedicated, asynchronous ticket agent. The live agent only SIGNALS intent
 * (request_ticket → enqueue); this service then reads the conversation history
 * and the conversation's open tickets and decides whether the latest intent is
 * the SAME request (update) or a new one (create) — or nothing (noop). The
 * contact is linked procedurally from the conversation, never invented.
 */
@Injectable()
export class TicketAgentService {
  private readonly logger = new Logger(TicketAgentService.name)

  constructor(
    @InjectQueue(TICKET_AGENT_QUEUE) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly llmFactory: LlmFactoryService,
    private readonly prompts: AgentPromptsService,
    private readonly gateway: EventsGateway,
  ) {}

  /** Fire-and-forget: queue an async ticket evaluation for a conversation. */
  async enqueue(data: TicketAgentJobData): Promise<void> {
    await this.queue.add('process' satisfies TicketAgentJobName, data, {
      removeOnComplete: true,
      removeOnFail: 50,
    })
  }

  async processTicketRequest(data: TicketAgentJobData): Promise<void> {
    const { conversationId, agentId, organisationId } = data

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        socialAccountId: true,
        participantId: true,
        participantName: true,
        socialAccount: {
          select: {
            provider: true,
            agentLink: { select: { agent: { select: { context: true } } } },
          },
        },
      },
    })
    if (!conversation) {
      this.logger.warn(`[Ticket] conversation ${conversationId} not found — skipping`)
      return
    }

    const messages = await this.prisma.directMessage.findMany({
      where: { conversationId },
      orderBy: { createdTime: 'desc' },
      take: HISTORY_LIMIT,
      select: { message: true, isFromPage: true, mediaType: true },
    })
    const history = messages
      .reverse()
      .map(
        (m) =>
          `${m.isFromPage ? 'Agent' : 'Client'}: ${m.message || (m.mediaType ? `[${m.mediaType}]` : '')}`,
      )
      .join('\n')

    const existingTickets = await this.prisma.ticket.findMany({
      where: { organisationId, conversationId, resolvedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, description: true, priority: true },
    })

    // What the live agent already learned about this customer (address, phone,
    // sizes, preferences…). The live agent may rightly NOT re-ask for these since
    // it already knows them — so the ticket agent must capture them itself and
    // surface anything still missing.
    const contactNotes = await this.prisma.contactNote.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: { category: true, content: true },
    })

    // Products actually shown to the customer in this conversation. Their details
    // (name/price/image) were hydrated and frozen into the message metadata when
    // sent — so the ticket can attach a frozen snapshot, and the agent can only
    // pick from products that really exist (never an invented one).
    const productMessages = await this.prisma.directMessage.findMany({
      where: { conversationId, mediaType: { in: ['catalog', 'catalog_message'] } },
      orderBy: { createdTime: 'desc' },
      take: 20,
      select: { metadata: true },
    })
    const shownProducts = new Map<
      string,
      {
        name: string | null
        price: number | null
        currency: string | null
        imageUrl: string | null
      }
    >()
    for (const dm of productMessages) {
      const items = (dm.metadata as { items?: Array<Record<string, unknown>> } | null)?.items
      if (!Array.isArray(items)) continue
      for (const it of items) {
        const rid = it.productRetailerId
        if (typeof rid === 'string' && !shownProducts.has(rid)) {
          shownProducts.set(rid, {
            name: (it.name as string) ?? null,
            price: (it.price as number) ?? null,
            currency: (it.currency as string) ?? null,
            imageUrl: (it.imageUrl as string) ?? null,
          })
        }
      }
    }

    const systemPrompt = this.prompts.buildTicketAgentPrompt({
      agentContext: conversation.socialAccount.agentLink?.agent?.context || '',
      existingTickets,
      availableProducts: [...shownProducts.entries()].map(([retailerId, p]) => ({
        retailerId,
        name: p.name,
      })),
      contactNotes,
    })

    const model = this.llmFactory.createStructuredChatModel('thinking', decisionSchema)

    let decision: TicketDecision
    try {
      decision = await model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(
          `Conversation (du plus ancien au plus récent) :\n${history}\n\n${
            data.note ? `Indice de l'agent: ${data.note}\n\n` : ''
          }Décide l'action (create / update / noop).`,
        ),
      ])
    } catch (error) {
      this.logger.error(
        `[Ticket] LLM failed for conversation ${conversationId}: ${error instanceof Error ? error.message : error}`,
      )
      return
    }

    if (decision.action === 'noop') {
      this.logger.debug(`[Ticket] noop for conversation ${conversationId}`)
      return
    }

    // Freeze the chosen products as a snapshot (only ids that were really shown).
    const chosenIds = (decision.articleRetailerIds ?? []).filter((id) => shownProducts.has(id))
    const articles = chosenIds.map((rid) => {
      const p = shownProducts.get(rid)!
      return {
        id: rid,
        name: p.name ?? rid,
        price: p.price ?? 0,
        currency: p.currency ?? 'XAF',
        quantity: 1,
        imageUrl: p.imageUrl ?? undefined,
      }
    })
    const metadata = articles.length > 0 ? { articles } : undefined
    const priority = decision.priority ?? 'MEDIUM'

    // Update path — only when the target ticket really belongs to this conversation.
    if (decision.action === 'update' && decision.ticketId) {
      const target = existingTickets.find((t) => t.id === decision.ticketId)
      if (target) {
        const ticket = await this.prisma.ticket.update({
          where: { id: target.id },
          data: {
            ...(decision.title ? { title: decision.title } : {}),
            ...(decision.description ? { description: decision.description } : {}),
            priority,
            contactId: conversation.participantId,
            contactName: conversation.participantName,
            provider: conversation.socialAccount.provider,
            socialAccountId: conversation.socialAccountId,
            ...(metadata ? { metadata } : {}),
          },
          include: { status: true },
        })
        this.gateway.emitToOrg(organisationId, 'ticket:updated', ticket)
        return
      }
      this.logger.warn(
        `[Ticket] update target ${decision.ticketId} not in conversation ${conversationId} — creating instead`,
      )
    }

    const defaultStatus = await this.prisma.ticketStatus.findFirst({
      where: { organisationId, isDefault: true },
      select: { id: true },
    })

    const ticket = await this.prisma.ticket.create({
      data: {
        organisationId,
        agentId,
        statusId: defaultStatus?.id,
        title: decision.title || 'Demande client',
        description: decision.description,
        priority,
        contactId: conversation.participantId,
        contactName: conversation.participantName,
        provider: conversation.socialAccount.provider,
        conversationId,
        socialAccountId: conversation.socialAccountId,
        metadata,
      },
      include: { status: true },
    })
    this.gateway.emitToOrg(organisationId, 'ticket:created', ticket)
  }
}
