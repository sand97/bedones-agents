import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { PrismaService } from '../prisma/prisma.service'
import { EventsGateway } from '../gateway/events.gateway'
import { AgentPromptsService } from './prompts/agent-prompts.service'
import { AgentDbToolsService } from './tools/agent-db-tools.service'
import { AgentCrudService } from './agent-crud.service'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { LlmFactoryService } from '../common/llm/llm-factory.service'
import { ProductImageIndexingService } from '../image-processing/product-image-indexing.service'
import { CATALOG_INDEXING_QUEUE } from '../queue/queue.module'
import type { CatalogIndexingJobData } from '../image-processing/catalog-indexing.processor'

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name)

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private gateway: EventsGateway,
    private prompts: AgentPromptsService,
    private dbTools: AgentDbToolsService,
    private crud: AgentCrudService,
    private llmFactory: LlmFactoryService,
    private productIndexing: ProductImageIndexingService,
    @InjectQueue(CATALOG_INDEXING_QUEUE) private catalogIndexingQueue: Queue,
  ) {}

  // ─── CRUD (delegated to AgentCrudService) ───

  async findAllByOrg(organisationId: string) {
    return this.crud.findAllByOrg(organisationId)
  }

  async findById(id: string) {
    return this.crud.findById(id)
  }

  async create(data: { organisationId: string; socialAccountIds: string[]; name?: string }) {
    return this.crud.create(data)
  }

  async remove(id: string) {
    return this.crud.remove(id)
  }

  async updateSocialAccounts(agentId: string, socialAccountIds: string[]) {
    return this.crud.updateSocialAccounts(agentId, socialAccountIds)
  }

  // ─── Messages ───

  async getMessages(agentId: string, limit = 50, before?: string) {
    return this.crud.getMessages(agentId, limit, before)
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
          metadata: sa.metadata,
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

  // ─── Setup (single async entry point) ───

  async startSetup(agentId: string, organisationId: string) {
    try {
      // Phase 1: Catalog analysis
      this.gateway.emitToOrg(organisationId, 'agent:setup-progress', {
        agentId,
        phase: 'analyzing-catalogs',
      })

      await this.analyzeCatalogs(agentId, organisationId)

      // Phase 2: Initial evaluation
      this.gateway.emitToOrg(organisationId, 'agent:setup-progress', {
        agentId,
        phase: 'initializing',
      })

      await this.performInitialEvaluation(agentId, organisationId)

      // Done — agent:message is emitted by performInitialEvaluation
    } catch (error) {
      this.logger.error(`Agent setup failed for ${agentId}: ${error}`)
      this.gateway.emitToOrg(organisationId, 'agent:setup-error', {
        agentId,
        message: 'Une erreur est survenue lors de la configuration. Réessayez.',
      })
    }
  }

  // ─── Initial Evaluation (called after catalog analysis) ───

  async performInitialEvaluation(agentId: string, organisationId: string) {
    const agent = await this.findById(agentId)

    const catalogsData = await this.getAgentCatalogs(agentId)
    const socialAccountsData = agent.socialAccounts.map((sa) => sa.socialAccount)

    // Fetch product samples for each catalog (max 20 per catalog) from Meta API
    const catalogsWithProducts = await Promise.all(
      catalogsData.map(async (c) => {
        try {
          const metaProducts = await this.productIndexing.fetchAllProducts(c.id)
          return {
            name: c.name,
            description: c.description,
            productCount: c.productCount || metaProducts.length,
            products: metaProducts.slice(0, 20).map((p) => ({
              name: p.name || 'Sans nom',
              description: p.description,
            })),
          }
        } catch (error) {
          this.logger.warn(`Failed to fetch products for catalog ${c.id}: ${error}`)
          return {
            name: c.name,
            description: c.description,
            productCount: c.productCount,
            products: [],
          }
        }
      }),
    )

    // Build initial prompt
    const prompt = this.prompts.buildInitialEvaluationPrompt({
      catalogs: catalogsWithProducts,
      socialAccounts: socialAccountsData.map((sa) => ({
        provider: sa.provider,
        pageName: sa.pageName,
        pageAbout: sa.pageAbout,
        username: sa.username,
        metadata: sa.metadata,
      })),
      existingContext: agent.context,
      score: agent.score,
    })

    const model = this.createModel()
    const result = await model.invoke([
      new SystemMessage(prompt),
      new HumanMessage("Effectue l'évaluation initiale de cet agent avec les données fournies."),
    ])

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
        let products: Array<{ name: string; description?: string | null }>
        try {
          const metaProducts = await this.productIndexing.fetchAllProducts(catalog.id)
          products = metaProducts.map((p) => ({
            name: p.name || 'Sans nom',
            description: p.description,
          }))
        } catch {
          products = []
        }

        if (products.length === 0) {
          await this.prisma.catalog.update({
            where: { id: catalog.id },
            data: { analysisStatus: 'COMPLETED', description: 'Catalogue vide' },
          })
          continue
        }

        const prompt = this.prompts.buildCatalogAnalysisPrompt(products.slice(0, 50))
        const model = this.createModel()
        const result = await model.invoke([new HumanMessage(prompt)])
        const description = typeof result.content === 'string' ? result.content : ''

        await this.prisma.catalog.update({
          where: { id: catalog.id },
          data: { analysisStatus: 'INDEXING', description },
        })

        this.gateway.emitToOrg(organisationId, 'catalog:analyzed', {
          catalogId: catalog.id,
          agentId,
          description,
        })

        // Trigger background Qdrant indexing for this catalog
        await this.catalogIndexingQueue.add('index-catalog', {
          catalogId: catalog.id,
          organisationId,
        } satisfies CatalogIndexingJobData)
        this.logger.log(`Queued Qdrant indexing for catalog ${catalog.id}`)
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

  // ─── Activation (delegated to AgentCrudService) ───

  async activate(
    agentId: string,
    dto: {
      activateAll?: boolean
      activateAds?: boolean
      activateNewConversations?: boolean
      contacts?: Record<string, string[]>
    },
  ) {
    return this.crud.activate(agentId, dto)
  }

  async deactivate(agentId: string) {
    return this.crud.deactivate(agentId)
  }

  async getLabelsForAgent(agentId: string) {
    return this.crud.getLabelsForAgent(agentId)
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

  /**
   * Returns the LLM used for agent context processing (onboarding, catalog analysis,
   * initial evaluation). Uses the "thinking" tier: most capable reasoning model with
   * extended thinking enabled. Gemini primary, OpenAI fallback.
   */
  private createModel() {
    return this.llmFactory.createChatModel('thinking', {
      trace: { properties: { feature: 'agent-context' } },
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
