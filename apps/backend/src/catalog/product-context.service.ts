import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { PrismaService } from '../prisma/prisma.service'
import { LlmFactoryService } from '../common/llm/llm-factory.service'
import { buildLlmTrace } from '../common/llm/llm-trace'
import { CatalogService } from './catalog.service'

export interface AnalyzeContextResult {
  /** Whether the AI detected a meaningful conflict with the existing data. */
  hasConflict: boolean
  /** Plain-language explanation when `hasConflict` is true. Empty otherwise. */
  conflictReason: string
  /** Markdown-formatted context proposal to insert. */
  suggestedContent: string
}

interface AiTargetSnapshot {
  type: 'product' | 'collection'
  providerId: string
  name?: string
  currentContext?: string
  /** Free-form additional data the AI can use (price, category…). */
  details?: Record<string, unknown>
}

/**
 * Handles AI-assisted contextual notes attached to Meta products / collections,
 * plus the simple linking of those entities to social posts.
 */
@Injectable()
export class ProductContextService {
  private readonly logger = new Logger(ProductContextService.name)

  constructor(
    private prisma: PrismaService,
    private catalog: CatalogService,
    private llm: LlmFactoryService,
  ) {}

  // ─── Context: list / fetch ───

  async listProductContexts(
    catalogId: string,
    providerProductIds?: string[],
  ): Promise<Array<{ providerProductId: string; content: string }>> {
    const rows = await this.prisma.productContext.findMany({
      where: {
        catalogId,
        ...(providerProductIds?.length ? { providerProductId: { in: providerProductIds } } : {}),
      },
      select: { providerProductId: true, content: true },
    })
    return rows
  }

  async listCollectionContexts(
    catalogId: string,
    providerCollectionIds?: string[],
  ): Promise<Array<{ providerCollectionId: string; content: string }>> {
    return this.prisma.collectionContext.findMany({
      where: {
        catalogId,
        ...(providerCollectionIds?.length
          ? { providerCollectionId: { in: providerCollectionIds } }
          : {}),
      },
      select: { providerCollectionId: true, content: true },
    })
  }

  /** Detail view of a single product context — used by the "Voir le contexte" modal. */
  async getProductContextDetail(catalogId: string, providerProductId: string) {
    const existing = await this.prisma.productContext.findUnique({
      where: { catalogId_providerProductId: { catalogId, providerProductId } },
    })

    const content = existing?.content ?? ''
    if (!content) {
      return { content: '', sameContentCount: 0, sameContentProductIds: [] as string[] }
    }

    const siblings = await this.prisma.productContext.findMany({
      where: { catalogId, content },
      select: { providerProductId: true },
    })

    return {
      content,
      sameContentCount: siblings.length,
      sameContentProductIds: siblings.map((s) => s.providerProductId),
    }
  }

  // ─── Context: AI analyse & save ───

  async analyzeContext(
    catalogId: string,
    params: { prompt: string; productIds?: string[]; collectionIds?: string[] },
  ): Promise<AnalyzeContextResult> {
    if (!params.prompt?.trim()) {
      throw new BadRequestException('Prompt requis')
    }
    if (!params.productIds?.length && !params.collectionIds?.length) {
      throw new BadRequestException('Sélection vide')
    }

    const snapshots = await this.buildSnapshots(catalogId, params)
    const agentContext = await this.resolveAgentContext(catalogId)
    const organisationId = (
      await this.prisma.catalog.findUnique({
        where: { id: catalogId },
        select: { organisationId: true },
      })
    )?.organisationId

    try {
      const model = this.llm.createChatModel('flash', {
        temperature: 0.4,
        maxOutputTokens: 1024,
        trace: buildLlmTrace({ feature: 'product-context-analyze', organisationId, catalogId }),
      })
      const systemPrompt = `Tu aides un commerçant à rédiger du **contexte additionnel** sur ses produits/collections. Ce contexte alimente un assistant IA qui répond à ses clients.

Réponds STRICTEMENT en JSON sous la forme :
{
  "hasConflict": boolean,
  "conflictReason": string, // FR, court, vide si pas de conflit
  "suggestedContent": string // markdown FR clair, prêt à enregistrer
}

Règles :
- Reformule la demande de l'utilisateur en un contexte court (max 6 lignes), factuel, sans verbiage.
- Si la demande contredit fortement le contexte global de la boutique ou les informations existantes, mets hasConflict=true et explique brièvement.
- N'invente pas de prix, délais, garanties non mentionnés.
- Pas de salutations, pas de "Voici" : uniquement le contenu utile.`

      const userPayload = JSON.stringify({
        agentContext: agentContext || null,
        userPrompt: params.prompt,
        targets: snapshots,
      })

      const response = await model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPayload),
      ])

      const raw =
        typeof response === 'object' && response !== null && 'content' in response
          ? String((response as { content: unknown }).content ?? '')
          : ''

      return this.parseAnalyzeResponse(raw, params.prompt)
    } catch (error) {
      this.logger.warn(
        `analyzeContext fallback: ${error instanceof Error ? error.message : String(error)}`,
      )
      // Graceful fallback — store the raw prompt without conflict flag.
      return {
        hasConflict: false,
        conflictReason: '',
        suggestedContent: params.prompt.trim(),
      }
    }
  }

  async saveContext(
    catalogId: string,
    params: { content: string; productIds?: string[]; collectionIds?: string[] },
  ) {
    const content = params.content?.trim()
    if (!content) throw new BadRequestException('Contenu vide')
    if (!params.productIds?.length && !params.collectionIds?.length) {
      throw new BadRequestException('Sélection vide')
    }

    const ops: Array<Promise<unknown>> = []
    for (const providerProductId of params.productIds ?? []) {
      ops.push(
        this.prisma.productContext.upsert({
          where: { catalogId_providerProductId: { catalogId, providerProductId } },
          update: { content },
          create: { catalogId, providerProductId, content },
        }),
      )
    }
    for (const providerCollectionId of params.collectionIds ?? []) {
      ops.push(
        this.prisma.collectionContext.upsert({
          where: { catalogId_providerCollectionId: { catalogId, providerCollectionId } },
          update: { content },
          create: { catalogId, providerCollectionId, content },
        }),
      )
    }
    await Promise.all(ops)

    return {
      savedProductIds: params.productIds ?? [],
      savedCollectionIds: params.collectionIds ?? [],
    }
  }

  async updateSingleProductContext(
    catalogId: string,
    providerProductId: string,
    params: { content: string; applyToSiblings?: boolean },
  ) {
    const content = params.content.trim()

    if (params.applyToSiblings) {
      const existing = await this.prisma.productContext.findUnique({
        where: { catalogId_providerProductId: { catalogId, providerProductId } },
      })
      if (existing?.content) {
        await this.prisma.productContext.updateMany({
          where: { catalogId, content: existing.content },
          data: { content },
        })
      }
    }

    if (!content) {
      // Empty content = remove
      await this.prisma.productContext.deleteMany({
        where: { catalogId, providerProductId },
      })
      return { success: true }
    }

    await this.prisma.productContext.upsert({
      where: { catalogId_providerProductId: { catalogId, providerProductId } },
      update: { content },
      create: { catalogId, providerProductId, content },
    })

    return { success: true }
  }

  // ─── Post linking ───

  async linkPosts(
    catalogId: string,
    params: { postIds: string[]; productIds?: string[]; collectionIds?: string[] },
  ) {
    if (!params.postIds?.length) throw new BadRequestException('Aucun post sélectionné')
    if (!params.productIds?.length && !params.collectionIds?.length) {
      throw new BadRequestException('Sélection vide')
    }

    // Validate posts exist & belong to the same organisation as the catalog.
    const catalog = await this.prisma.catalog.findUnique({
      where: { id: catalogId },
      select: { organisationId: true },
    })
    if (!catalog) throw new NotFoundException('Catalogue introuvable')

    const posts = await this.prisma.post.findMany({
      where: {
        id: { in: params.postIds },
        socialAccount: { organisationId: catalog.organisationId },
      },
      select: { id: true },
    })
    const validPostIds = new Set(posts.map((p) => p.id))
    const filteredPostIds = params.postIds.filter((id) => validPostIds.has(id))
    if (filteredPostIds.length === 0) throw new BadRequestException('Posts introuvables')

    const productRows = (params.productIds ?? []).flatMap((providerProductId) =>
      filteredPostIds.map((postId) => ({ catalogId, providerProductId, postId })),
    )
    const collectionRows = (params.collectionIds ?? []).flatMap((providerCollectionId) =>
      filteredPostIds.map((postId) => ({ catalogId, providerCollectionId, postId })),
    )

    await Promise.all([
      productRows.length
        ? this.prisma.productPostLink.createMany({ data: productRows, skipDuplicates: true })
        : Promise.resolve(),
      collectionRows.length
        ? this.prisma.collectionPostLink.createMany({ data: collectionRows, skipDuplicates: true })
        : Promise.resolve(),
    ])

    return { linkedPostIds: filteredPostIds }
  }

  async listProductPostLinks(
    catalogId: string,
    providerProductId: string,
    params?: { limit?: number; offset?: number },
  ) {
    const limit = params?.limit ?? 10
    const offset = params?.offset ?? 0

    const [rows, total] = await Promise.all([
      this.prisma.productPostLink.findMany({
        where: { catalogId, providerProductId },
        orderBy: { createdAt: 'desc' },
        include: {
          post: {
            include: {
              socialAccount: {
                select: { id: true, provider: true, pageName: true, username: true },
              },
            },
          },
        },
        take: limit,
        skip: offset,
      }),
      this.prisma.productPostLink.count({ where: { catalogId, providerProductId } }),
    ])

    return {
      total,
      links: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        post: {
          id: r.post.id,
          message: r.post.message,
          imageUrl: r.post.imageUrl,
          permalinkUrl: r.post.permalinkUrl,
          createdAt: r.post.createdAt,
        },
        socialAccount: r.post.socialAccount,
      })),
    }
  }

  async listCollectionPostLinks(
    catalogId: string,
    providerCollectionId: string,
    params?: { limit?: number; offset?: number },
  ) {
    const limit = params?.limit ?? 10
    const offset = params?.offset ?? 0

    const [rows, total] = await Promise.all([
      this.prisma.collectionPostLink.findMany({
        where: { catalogId, providerCollectionId },
        orderBy: { createdAt: 'desc' },
        include: {
          post: {
            include: {
              socialAccount: {
                select: { id: true, provider: true, pageName: true, username: true },
              },
            },
          },
        },
        take: limit,
        skip: offset,
      }),
      this.prisma.collectionPostLink.count({ where: { catalogId, providerCollectionId } }),
    ])

    return {
      total,
      links: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        post: {
          id: r.post.id,
          message: r.post.message,
          imageUrl: r.post.imageUrl,
          permalinkUrl: r.post.permalinkUrl,
          createdAt: r.post.createdAt,
        },
        socialAccount: r.post.socialAccount,
      })),
    }
  }

  async deleteProductPostLink(catalogId: string, linkId: string) {
    await this.prisma.productPostLink.deleteMany({ where: { id: linkId, catalogId } })
    return { success: true }
  }

  async deleteCollectionPostLink(catalogId: string, linkId: string) {
    await this.prisma.collectionPostLink.deleteMany({ where: { id: linkId, catalogId } })
    return { success: true }
  }

  // ─── Internals ───

  private async buildSnapshots(
    catalogId: string,
    params: { productIds?: string[]; collectionIds?: string[] },
  ): Promise<AiTargetSnapshot[]> {
    const snapshots: AiTargetSnapshot[] = []

    if (params.productIds?.length) {
      const existingContexts = await this.listProductContexts(catalogId, params.productIds)
      const ctxMap = new Map(existingContexts.map((c) => [c.providerProductId, c.content]))
      for (const id of params.productIds) {
        snapshots.push({
          type: 'product',
          providerId: id,
          currentContext: ctxMap.get(id),
        })
      }
    }

    if (params.collectionIds?.length) {
      const existing = await this.listCollectionContexts(catalogId, params.collectionIds)
      const ctxMap = new Map(existing.map((c) => [c.providerCollectionId, c.content]))
      for (const id of params.collectionIds) {
        snapshots.push({
          type: 'collection',
          providerId: id,
          currentContext: ctxMap.get(id),
        })
      }
    }

    return snapshots
  }

  private async resolveAgentContext(catalogId: string): Promise<string | null> {
    const catalog = await this.prisma.catalog.findUnique({
      where: { id: catalogId },
      select: {
        description: true,
        organisation: {
          select: {
            agents: { select: { context: true }, take: 1, orderBy: { updatedAt: 'desc' } },
          },
        },
      },
    })
    if (!catalog) return null
    const agentContext = catalog.organisation.agents[0]?.context
    return agentContext || catalog.description || null
  }

  private parseAnalyzeResponse(raw: string, fallbackPrompt: string): AnalyzeContextResult {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { hasConflict: false, conflictReason: '', suggestedContent: fallbackPrompt.trim() }
    }
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Partial<AnalyzeContextResult>
      return {
        hasConflict: Boolean(parsed.hasConflict),
        conflictReason: typeof parsed.conflictReason === 'string' ? parsed.conflictReason : '',
        suggestedContent:
          typeof parsed.suggestedContent === 'string' && parsed.suggestedContent.trim()
            ? parsed.suggestedContent.trim()
            : fallbackPrompt.trim(),
      }
    } catch {
      return { hasConflict: false, conflictReason: '', suggestedContent: fallbackPrompt.trim() }
    }
  }
}
