import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class AgentCrudService {
  constructor(private prisma: PrismaService) {}

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
                metadata: true,
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
                metadata: true,
              },
            },
          },
        },
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

    // Check if any linked social account has a catalog still being indexed
    const catalogsInProgress = await this.prisma.catalogSocialAccount.findMany({
      where: {
        socialAccountId: { in: data.socialAccountIds },
        catalog: { analysisStatus: { in: ['PENDING', 'ANALYZING', 'INDEXING'] } },
      },
      include: { catalog: { select: { name: true, analysisStatus: true } } },
    })

    if (catalogsInProgress.length > 0) {
      const catalogNames = catalogsInProgress.map((c) => c.catalog.name).join(', ')
      throw new BadRequestException(
        `Veuillez patienter, l'indexation de vos catalogues est en cours (${catalogNames}). ` +
          `Nos IA apprennent à connaître vos produits et services afin de mieux répondre à vos clients. ` +
          `Vous pourrez créer votre agent une fois l'indexation terminée.`,
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
      },
      include: {
        socialAccounts: {
          include: { socialAccount: true },
        },
      },
    })

    return agent
  }

  async remove(id: string) {
    return this.prisma.agent.delete({ where: { id } })
  }

  async updateSocialAccounts(agentId: string, socialAccountIds: string[]) {
    const agent = await this.findById(agentId)
    if (!agent) throw new NotFoundException('Agent introuvable')

    await this.prisma.$transaction([
      this.prisma.agentSocialAccount.deleteMany({ where: { agentId } }),
      this.prisma.agentSocialAccount.createMany({
        data: socialAccountIds.map((socialAccountId) => ({ agentId, socialAccountId })),
      }),
    ])

    return this.findById(agentId)
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

  // ─── Activation ───

  async activate(
    agentId: string,
    dto: {
      activateAll?: boolean
      activateAds?: boolean
      activateNewConversations?: boolean
      contacts?: Record<string, string[]>
    },
  ) {
    const agent = await this.findById(agentId)
    const activatedAt = new Date()

    // "All conversations" is exclusive — it overrides the more specific scopes.
    const activateAll = !!dto.activateAll
    const activateAds = activateAll ? false : !!dto.activateAds
    const activateNewConversations = activateAll ? false : !!dto.activateNewConversations

    // Update all social accounts of the agent
    for (const sa of agent.socialAccounts) {
      const contacts = activateAll ? [] : dto.contacts?.[sa.socialAccount.id] || []

      await this.prisma.agentSocialAccount.update({
        where: { id: sa.id },
        data: {
          aiActivateAll: activateAll,
          aiActivateAds: activateAds,
          aiActivateNewConversations: activateNewConversations,
          aiActivationContacts: contacts,
          aiActivatedAt: activatedAt,
          // Keep the legacy enum column roughly in sync for any legacy reads.
          aiActivationMode: activateAll ? 'ALL' : contacts.length > 0 ? 'CONTACTS' : 'OFF',
          aiActivationLabels: [],
        },
      })
    }

    // Set agent status to ACTIVE
    return this.prisma.agent.update({
      where: { id: agentId },
      data: { status: 'ACTIVE' },
      include: {
        socialAccounts: { include: { socialAccount: true } },
      },
    })
  }

  async deactivate(agentId: string) {
    // Clear every activation scope on all social accounts
    await this.prisma.agentSocialAccount.updateMany({
      where: { agentId },
      data: {
        aiActivationMode: 'OFF',
        aiActivateAll: false,
        aiActivateAds: false,
        aiActivateNewConversations: false,
      },
    })

    return this.prisma.agent.update({
      where: { id: agentId },
      data: { status: 'PAUSED' },
      include: {
        socialAccounts: { include: { socialAccount: true } },
      },
    })
  }

  async getLabelsForAgent(agentId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      include: { socialAccounts: { select: { socialAccountId: true } } },
    })

    if (!agent) throw new NotFoundException('Agent introuvable')

    const socialAccountIds = agent.socialAccounts.map((sa) => sa.socialAccountId)

    return this.prisma.label.findMany({
      where: { socialAccountId: { in: socialAccountIds } },
      orderBy: [{ socialAccountId: 'asc' }, { order: 'asc' }],
    })
  }
}
