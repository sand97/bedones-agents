import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { EventsGateway } from '../../gateway/events.gateway'
import { CatalogAccessService } from './catalog-access.service'

@Injectable()
export class CatalogManagementService {
  private readonly logger = new Logger('CatalogService')

  constructor(
    private prisma: PrismaService,
    private gateway: EventsGateway,
    private accessService: CatalogAccessService,
  ) {}

  // ─── CRUD ───

  async findAllByOrg(userId: string, organisationId: string) {
    await this.accessService.assertMembership(userId, organisationId)
    return this.prisma.catalog.findMany({
      where: { organisationId },
      include: {
        socialAccounts: {
          include: { socialAccount: true },
        },
        _count: { select: { products: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findById(userId: string, id: string) {
    const catalog = await this.prisma.catalog.findUnique({
      where: { id },
      include: {
        socialAccounts: {
          include: { socialAccount: true },
        },
      },
    })
    if (!catalog) throw new NotFoundException('Catalogue introuvable')
    await this.accessService.assertMembership(userId, catalog.organisationId)
    return catalog
  }

  async create(
    userId: string,
    data: { organisationId: string; name: string; providerId?: string },
  ) {
    await this.accessService.assertMembership(userId, data.organisationId)
    return this.prisma.catalog.create({
      data: {
        organisationId: data.organisationId,
        name: data.name,
        providerId: data.providerId,
      },
    })
  }

  async update(userId: string, id: string, data: { name?: string }) {
    await this.accessService.assertCatalogAccess(userId, id)
    return this.prisma.catalog.update({
      where: { id },
      data,
    })
  }

  async remove(userId: string, id: string) {
    await this.accessService.assertCatalogAccess(userId, id)
    return this.prisma.catalog.delete({ where: { id } })
  }

  // ─── Social Account Links ───

  async linkSocialAccounts(userId: string, catalogId: string, socialAccountIds: string[]) {
    await this.accessService.assertCatalogAccess(userId, catalogId)
    // Remove existing links not in the new list
    await this.prisma.catalogSocialAccount.deleteMany({
      where: {
        catalogId,
        socialAccountId: { notIn: socialAccountIds },
      },
    })

    // Create new links
    for (const socialAccountId of socialAccountIds) {
      await this.prisma.catalogSocialAccount.upsert({
        where: {
          catalogId_socialAccountId: { catalogId, socialAccountId },
        },
        update: {},
        create: { catalogId, socialAccountId },
      })
    }

    return this.findById(userId, catalogId)
  }

  // ─── Webhook: external catalog changes ───

  async handleWebhookUpdate(providerId: string, _changes: Record<string, unknown>) {
    const catalog = await this.prisma.catalog.findFirst({
      where: { providerId },
      select: { id: true, organisationId: true },
    })

    if (!catalog) {
      this.logger.warn(`Webhook: no catalog found for providerId ${providerId}`)
      return
    }

    // Emit event to frontend so it can refetch
    this.gateway.emitToOrg(catalog.organisationId, 'catalog:updated', {
      catalogId: catalog.id,
    })
    this.logger.log(`Webhook: emitted catalog:updated for ${catalog.id}`)
  }

  // ─── Analysis status helpers ───

  async getAnalysisProgress(catalogId: string) {
    const catalog = await this.prisma.catalog.findUnique({
      where: { id: catalogId },
      select: {
        analysisStatus: true,
        description: true,
        productCount: true,
        indexedCount: true,
      },
    })
    if (!catalog) throw new NotFoundException('Catalogue introuvable')
    return catalog
  }
}
