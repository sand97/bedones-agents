import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { EventsGateway } from '../gateway/events.gateway'
import { AgentPromptsService } from './prompts/agent-prompts.service'
import { AgentDbToolsService } from './tools/agent-db-tools.service'
import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'

const DEFAULT_TICKET_STATUSES = [
  { name: 'Nouveau', color: '#1677ff', order: 0, isDefault: true },
  { name: 'En cours', color: '#fa8c16', order: 1, isDefault: false },
  { name: 'En attente', color: '#faad14', order: 2, isDefault: false },
  { name: 'Résolu', color: '#52c41a', order: 3, isDefault: false },
  { name: 'Annulé', color: '#ff4d4f', order: 4, isDefault: false },
]

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name)

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private gateway: EventsGateway,
    private prompts: AgentPromptsService,
    private dbTools: AgentDbToolsService,
  ) {}

  // ─── CRUD ───

  async findAllByOrg(organisationId: string) {
    return this.prisma.agent.findMany({
      where: { organisationId },
      include: {
        socialAccounts: {
          include: {
            socialAccount: {
              select: {
                id: true,
                provider: true,
                pageName: true,
                username: true,
                profilePictureUrl: true,
              },
            },
          },
        },
        _count: { select: { messages: true, tickets: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })
  }

  async findById(id: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id },
      include: {
        socialAccounts: {
          include: {
            socialAccount: {
              select: {
                id: true,
                provider: true,
                pageName: true,
                pageAbout: true,
                username: true,
                profilePictureUrl: true,
              },
            },
          },
        },
        ticketStatuses: { orderBy: { order: 'asc' } },
      },
    })
    if (!agent) throw new NotFoundException('Agent introuvable')
    return agent
  }

  async create(data: { organisationId: string; socialAccountIds: string[]; name?: string }) {
    // Validate that none of these social accounts are already in another agent
    const existingLinks = await this.prisma.agentSocialAccount.findMany({
      where: { socialAccountId: { in: data.socialAccountIds } },
      include: { agent: true },
    })

    if (existingLinks.length > 0) {
      const agentNames = existingLinks.map((l) => l.agent.name || l.agent.id)
      throw new BadRequestException(
        `Certains réseaux sociaux sont déjà associés à un agent: ${agentNames.join(', ')}`,
      )
    }

    // Build default name from social accounts
    let name = data.name
    if (!name) {
      const accounts = await this.prisma.socialAccount.findMany({
        where: { id: { in: data.socialAccountIds } },
        select: { pageName: true, username: true, provider: true },
      })
      name = accounts.map((a) => a.pageName || a.username || a.provider).join(', ')
    }

    // Create agent with social account links and default ticket statuses
    const agent = await this.prisma.agent.create({
      data: {
        organisationId: data.organisationId,
        name,
        status: 'DRAFT',
        socialAccounts: {
          create: data.socialAccountIds.map((socialAccountId) => ({
            socialAccountId,
          })),
        },
        ticketStatuses: {
          create: DEFAULT_TICKET_STATUSES,
        },
      },
      include: {
        socialAccounts: {
          include: { socialAccount: true },
        },
        ticketStatuses: true,
      },
    })

    return agent
  }

  async remove(id: string) {
    return this.prisma.agent.delete({ where: { id } })
  }

  // ─── Messages ───

  async getMessages(agentId: string, limit = 50, before?: string) {
    const where: Record<string, unknown> = { agentId }
    if (before) {
      where.createdAt = { lt: new Date(before) }
    }

    return this.prisma.agentMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: limit,
    })
  }

  // ─── Onboarding Chat ───

  async processUserMessage(agentId: string, content: string, organisationId: string) {
    const agent = await this.findById(agentId)

    // Save user message
    await this.prisma.agentMessage.create({
      data: {
        agentId,
        role: 'user',
        content,
        type: 'text',
      },
    })

    // Emit that we're processing
    this.gateway.emitToOrg(organisationId, 'agent:thinking', { agentId })

    try {
      // Get conversation history
      const history = await this.prisma.agentMessage.findMany({
        where: { agentId },
        orderBy: { createdAt: 'asc' },
        take: 30,
      })

      // Get catalogs linked to agent's social accounts
      const catalogsData = await this.getAgentCatalogs(agentId)
      const socialAccountsData = agent.socialAccounts.map((sa) => sa.socialAccount)

      // Build message history string
      const messageHistory = history
        .map((m) => `${m.role === 'user' ? 'Utilisateur' : 'Agent'}: ${m.content}`)
        .join('\n')

      // Build prompt
      const prompt = this.prompts.buildConversationPrompt({
        catalogs: catalogsData.map((c) => ({
          name: c.name,
          description: c.description,
          productCount: c.productCount,
        })),
        socialAccounts: socialAccountsData.map((sa) => ({
          provider: sa.provider,
          pageName: sa.pageName,
          pageAbout: sa.pageAbout,
          username: sa.username,
        })),
        existingContext: agent.context,
        score: agent.score,
        messageHistory,
      })

      // Call LLM
      const model = this.createModel()
      const result = await model.invoke([new SystemMessage(prompt), new HumanMessage(content)])

      // Parse response
      const responseText = typeof result.content === 'string' ? result.content : ''
      const parsed = this.parseAgentResponse(responseText)

      // Update agent score and context
      if (parsed.score !== undefined || parsed.context) {
        await this.prisma.agent.update({
          where: { id: agentId },
          data: {
            score: parsed.score ?? agent.score,
            context: parsed.context ?? agent.context,
            status: (parsed.score ?? agent.score) >= 80 ? 'READY' : 'CONFIGURING',
          },
        })
      }

      // Save agent response
      const agentMessage = await this.prisma.agentMessage.create({
        data: {
          agentId,
          role: 'agent',
          content: parsed.question || responseText,
          type: parsed.questionType || 'text',
          metadata: parsed.options
            ? { options: parsed.options, needs: parsed.needs }
            : parsed.needs
              ? { needs: parsed.needs }
              : undefined,
        },
      })

      // Emit response
      this.gateway.emitToOrg(organisationId, 'agent:message', {
        agentId,
        message: agentMessage,
        score: parsed.score ?? agent.score,
        context: parsed.context,
      })

      return agentMessage
    } catch (error) {
      this.logger.error(`Agent processing error: ${error}`)

      this.gateway.emitToOrg(organisationId, 'agent:error', {
        agentId,
        message: 'Une erreur est survenue. Réessayez.',
        retryable: true,
      })

      throw error
    }
  }

  // ─── Initial Evaluation (called after catalog analysis) ───

  async performInitialEvaluation(agentId: string, organisationId: string) {
    const agent = await this.findById(agentId)

    const catalogsData = await this.getAgentCatalogs(agentId)
    const socialAccountsData = agent.socialAccounts.map((sa) => sa.socialAccount)

    // Build initial prompt
    const prompt = this.prompts.buildInitialEvaluationPrompt({
      catalogs: catalogsData.map((c) => ({
        name: c.name,
        description: c.description,
        productCount: c.productCount,
      })),
      socialAccounts: socialAccountsData.map((sa) => ({
        provider: sa.provider,
        pageName: sa.pageName,
        pageAbout: sa.pageAbout,
        username: sa.username,
      })),
      existingContext: agent.context,
      score: agent.score,
    })

    const model = this.createModel()
    const result = await model.invoke([new SystemMessage(prompt)])

    const responseText = typeof result.content === 'string' ? result.content : ''
    const parsed = this.parseAgentResponse(responseText)

    // Update agent
    await this.prisma.agent.update({
      where: { id: agentId },
      data: {
        score: parsed.score ?? 5,
        context: parsed.context,
        status: 'CONFIGURING',
      },
    })

    // Save the first AI message
    const agentMessage = await this.prisma.agentMessage.create({
      data: {
        agentId,
        role: 'agent',
        content: parsed.question || 'Bonjour ! Je vais vous aider à configurer votre agent.',
        type: parsed.questionType || 'text',
        metadata: parsed.options ? { options: parsed.options } : undefined,
      },
    })

    this.gateway.emitToOrg(organisationId, 'agent:message', {
      agentId,
      message: agentMessage,
      score: parsed.score ?? 5,
      context: parsed.context,
    })

    return agentMessage
  }

  // ─── Catalog Analysis ───

  async analyzeCatalogs(agentId: string, organisationId: string) {
    const catalogs = await this.getAgentCatalogs(agentId)

    for (const catalog of catalogs) {
      if (catalog.analysisStatus === 'COMPLETED') continue

      await this.prisma.catalog.update({
        where: { id: catalog.id },
        data: { analysisStatus: 'ANALYZING' },
      })

      this.gateway.emitToOrg(organisationId, 'catalog:analyzing', {
        catalogId: catalog.id,
        agentId,
      })

      try {
        const products = await this.prisma.product.findMany({
          where: { catalogId: catalog.id },
          select: { name: true, description: true },
          take: 50,
        })

        if (products.length === 0) {
          await this.prisma.catalog.update({
            where: { id: catalog.id },
            data: { analysisStatus: 'COMPLETED', description: 'Catalogue vide' },
          })
          continue
        }

        const prompt = this.prompts.buildCatalogAnalysisPrompt(products)
        const model = this.createModel()
        const result = await model.invoke([new HumanMessage(prompt)])
        const description = typeof result.content === 'string' ? result.content : ''

        await this.prisma.catalog.update({
          where: { id: catalog.id },
          data: { analysisStatus: 'COMPLETED', description },
        })

        this.gateway.emitToOrg(organisationId, 'catalog:analyzed', {
          catalogId: catalog.id,
          agentId,
          description,
        })
      } catch (error) {
        this.logger.error(`Catalog analysis failed for ${catalog.id}: ${error}`)
        await this.prisma.catalog.update({
          where: { id: catalog.id },
          data: { analysisStatus: 'FAILED' },
        })

        this.gateway.emitToOrg(organisationId, 'catalog:analysis-failed', {
          catalogId: catalog.id,
          agentId,
        })
      }
    }
  }

  // ─── Check if agent's catalogs are all analyzed ───

  async areCatalogsAnalyzed(agentId: string): Promise<boolean> {
    const catalogs = await this.getAgentCatalogs(agentId)
    if (catalogs.length === 0) return true
    return catalogs.every((c) => c.analysisStatus === 'COMPLETED')
  }

  // ─── Ticket Statuses ───

  async getTicketStatuses(agentId: string) {
    return this.prisma.ticketStatus.findMany({
      where: { agentId },
      orderBy: { order: 'asc' },
    })
  }

  async updateTicketStatuses(
    agentId: string,
    statuses: Array<{
      id?: string
      name: string
      color: string
      order: number
      isDefault: boolean
    }>,
  ) {
    // Delete existing and recreate
    await this.prisma.ticketStatus.deleteMany({ where: { agentId } })

    return this.prisma.ticketStatus.createMany({
      data: statuses.map((s) => ({
        agentId,
        name: s.name,
        color: s.color,
        order: s.order,
        isDefault: s.isDefault,
      })),
    })
  }

  // ─── Helpers ───

  private async getAgentCatalogs(agentId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        socialAccounts: {
          include: {
            socialAccount: {
              include: {
                catalogs: {
                  include: { catalog: true },
                },
              },
            },
          },
        },
      },
    })

    if (!agent) return []

    // Deduplicate catalogs across social accounts
    const catalogMap = new Map<
      string,
      (typeof agent.socialAccounts)[0]['socialAccount']['catalogs'][0]['catalog']
    >()
    for (const sa of agent.socialAccounts) {
      for (const c of sa.socialAccount.catalogs) {
        catalogMap.set(c.catalog.id, c.catalog)
      }
    }

    return Array.from(catalogMap.values())
  }

  private createModel() {
    const primaryModel = this.config.get<string>('AGENT_PRIMARY_MODEL') || 'gpt-4.1'
    const openaiKey = this.config.get<string>('OPENIA_API_KEY')
    const geminiKey = this.config.get<string>('GEMINI_API_KEY')
    const fallbackModel = this.config.get<string>('AGENT_FALLBACK_MODEL') || 'gemini-2.5-flash'

    // Try OpenAI first, fallback to Gemini
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

    // Default to OpenAI
    return new ChatOpenAI({
      model: primaryModel,
      apiKey: openaiKey,
      temperature: 0.3,
    })
  }

  private parseAgentResponse(text: string): {
    score?: number
    context?: string
    needs?: string[]
    question?: string
    questionType?: string
    options?: string[]
  } {
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0]
        return JSON.parse(jsonStr)
      }
    } catch {
      this.logger.warn('Failed to parse agent JSON response, using raw text')
    }

    return { question: text }
  }
}
