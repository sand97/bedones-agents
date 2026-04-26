import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from '../auth/encryption.service'
import {
  CreateLoyaltyBonusDto,
  CreateLoyaltyCampaignDto,
  CreateLoyaltyContactDto,
  CreateLoyaltyTemplateDto,
  UpdateLoyaltyBonusDto,
  UpdateLoyaltyCampaignDto,
  UpdateLoyaltyContactDto,
  UpdateLoyaltyTemplateDto,
} from './dto/loyalty.dto'

const META_API_BASE = 'https://graph.facebook.com/v22.0'

interface MetaTemplateComponent {
  type: string
  text?: string
}

interface MetaTemplate {
  id: string
  name: string
  language: string
  status: string
  category: string
  components?: MetaTemplateComponent[]
}

type LoyaltyRewardType = 'PRODUCTS' | 'CREDIT' | 'PERCENT'
type LoyaltyBonusStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED'
type LoyaltyCampaignStatus = 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'COMPLETED' | 'PAUSED'
type LoyaltyCampaignFrequency = 'ONCE' | 'DAILY' | 'WEEKLY' | 'MONTHLY'

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name)

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
  ) {}

  // ─── Contacts ───

  async listContacts(socialAccountId: string, params?: { search?: string }) {
    const where: Record<string, unknown> = { socialAccountId }
    if (params?.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { phone: { contains: params.search, mode: 'insensitive' } },
      ]
    }
    return this.prisma.loyaltyContact.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })
  }

  async createContact(data: CreateLoyaltyContactDto) {
    return this.prisma.loyaltyContact.create({
      data: {
        socialAccountId: data.socialAccountId,
        name: data.name,
        phone: data.phone,
        totalSpent: data.totalSpent ?? 0,
        orderCount: data.orderCount ?? 0,
      },
    })
  }

  async updateContact(id: string, data: UpdateLoyaltyContactDto) {
    return this.prisma.loyaltyContact.update({ where: { id }, data })
  }

  async removeContact(id: string) {
    return this.prisma.loyaltyContact.delete({ where: { id } })
  }

  // ─── Bonus ───

  async listBonuses(socialAccountId: string, params?: { search?: string; status?: string }) {
    const where: Record<string, unknown> = { socialAccountId }
    if (params?.status) where.status = params.status
    if (params?.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
      ]
    }
    return this.prisma.loyaltyBonus.findMany({
      where,
      include: {
        triggerProducts: {
          include: {
            product: {
              select: { id: true, name: true, imageUrl: true, price: true, currency: true },
            },
          },
        },
        rewardProducts: {
          include: {
            product: {
              select: { id: true, name: true, imageUrl: true, price: true, currency: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async getBonus(id: string) {
    const bonus = await this.prisma.loyaltyBonus.findUnique({
      where: { id },
      include: {
        triggerProducts: { include: { product: true } },
        rewardProducts: { include: { product: true } },
      },
    })
    if (!bonus) throw new NotFoundException('Bonus introuvable')
    return bonus
  }

  private async resolveProductIds(productIds: string[]): Promise<string[]> {
    if (productIds.length === 0) return []
    const products = await this.prisma.product.findMany({
      where: {
        OR: [{ id: { in: productIds } }, { providerProductId: { in: productIds } }],
      },
      select: { id: true },
    })
    return products.map((p) => p.id)
  }

  async createBonus(data: CreateLoyaltyBonusDto) {
    const triggerIds = data.triggerProductIds?.length
      ? await this.resolveProductIds(data.triggerProductIds)
      : []
    const rewardIds = data.rewardProductIds?.length
      ? await this.resolveProductIds(data.rewardProductIds)
      : []

    return this.prisma.loyaltyBonus.create({
      data: {
        socialAccountId: data.socialAccountId,
        name: data.name,
        description: data.description,
        stackable: data.stackable ?? false,
        targetSpend: data.targetSpend ?? null,
        targetOrderCount: data.targetOrderCount ?? null,
        targetProductsCount: data.targetProductsCount ?? null,
        rewardType: data.rewardType as LoyaltyRewardType,
        rewardCredit: data.rewardCredit ?? null,
        rewardPercent: data.rewardPercent ?? null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        triggerProducts: triggerIds.length
          ? { create: triggerIds.map((productId) => ({ productId })) }
          : undefined,
        rewardProducts: rewardIds.length
          ? { create: rewardIds.map((productId) => ({ productId })) }
          : undefined,
      },
      include: {
        triggerProducts: { include: { product: true } },
        rewardProducts: { include: { product: true } },
      },
    })
  }

  async updateBonus(id: string, data: UpdateLoyaltyBonusDto) {
    await this.prisma.loyaltyBonus.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        status: data.status as LoyaltyBonusStatus | undefined,
        stackable: data.stackable,
        targetSpend: data.targetSpend,
        targetOrderCount: data.targetOrderCount,
        targetProductsCount: data.targetProductsCount,
        rewardType: data.rewardType as LoyaltyRewardType | undefined,
        rewardCredit: data.rewardCredit,
        rewardPercent: data.rewardPercent,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
      },
    })

    if (data.triggerProductIds !== undefined) {
      await this.prisma.loyaltyBonusTriggerProduct.deleteMany({ where: { bonusId: id } })
      if (data.triggerProductIds.length > 0) {
        const ids = await this.resolveProductIds(data.triggerProductIds)
        if (ids.length > 0) {
          await this.prisma.loyaltyBonusTriggerProduct.createMany({
            data: ids.map((productId) => ({ bonusId: id, productId })),
          })
        }
      }
    }

    if (data.rewardProductIds !== undefined) {
      await this.prisma.loyaltyBonusRewardProduct.deleteMany({ where: { bonusId: id } })
      if (data.rewardProductIds.length > 0) {
        const ids = await this.resolveProductIds(data.rewardProductIds)
        if (ids.length > 0) {
          await this.prisma.loyaltyBonusRewardProduct.createMany({
            data: ids.map((productId) => ({ bonusId: id, productId })),
          })
        }
      }
    }

    return this.getBonus(id)
  }

  async removeBonus(id: string) {
    return this.prisma.loyaltyBonus.delete({ where: { id } })
  }

  // ─── Templates (sync from Meta in production; here we expose CRUD) ───

  async listTemplates(socialAccountId: string) {
    return this.prisma.loyaltyTemplate.findMany({
      where: { socialAccountId },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * Fetch the WhatsApp Business message templates from Meta for the given
   * social account, then upsert them locally so campaigns can reference
   * them by id. Returns the up-to-date list.
   */
  async syncTemplates(socialAccountId: string) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      omit: { accessToken: false },
    })
    if (!account) throw new NotFoundException('Compte social introuvable')
    if (account.provider !== 'WHATSAPP') {
      throw new BadRequestException('La synchronisation est réservée aux comptes WhatsApp')
    }
    if (!account.wabaId) {
      throw new BadRequestException('WABA ID manquant pour ce numéro WhatsApp')
    }

    const accessToken = await this.encryptionService.decrypt(account.accessToken)

    const fetched: MetaTemplate[] = []
    let nextUrl: string | null =
      `${META_API_BASE}/${account.wabaId}/message_templates` +
      `?fields=id,name,language,status,category,components&limit=100`

    while (nextUrl) {
      const res: Response = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) {
        const text = await res.text()
        this.logger.error(`Meta message_templates fetch failed: ${res.status} ${text}`)
        throw new BadRequestException(`Meta API error: ${text}`)
      }
      const json = (await res.json()) as {
        data?: MetaTemplate[]
        paging?: { next?: string }
      }
      if (json.data) fetched.push(...json.data)
      nextUrl = json.paging?.next ?? null
    }

    // Normalize each Meta template into our LoyaltyTemplate shape.
    for (const tmpl of fetched) {
      const bodyComponent = (tmpl.components ?? []).find((c) => c.type === 'BODY')
      const body = bodyComponent?.text ?? ''
      const variables = Array.from(body.matchAll(/{{\s*([^}]+?)\s*}}/g), (m) => m[1].trim())

      await this.prisma.loyaltyTemplate.upsert({
        where: {
          socialAccountId_name_language: {
            socialAccountId,
            name: tmpl.name,
            language: tmpl.language,
          },
        },
        create: {
          socialAccountId,
          metaTemplateId: tmpl.id,
          name: tmpl.name,
          language: tmpl.language,
          category: tmpl.category,
          body,
          variables,
          status: tmpl.status,
        },
        update: {
          metaTemplateId: tmpl.id,
          category: tmpl.category,
          body,
          variables,
          status: tmpl.status,
        },
      })
    }

    this.logger.log(
      `[Loyalty] Synced ${fetched.length} WhatsApp templates for account ${socialAccountId}`,
    )

    return this.listTemplates(socialAccountId)
  }

  async createTemplate(data: CreateLoyaltyTemplateDto) {
    return this.prisma.loyaltyTemplate.create({
      data: {
        socialAccountId: data.socialAccountId,
        name: data.name,
        language: data.language ?? 'fr',
        category: data.category ?? 'MARKETING',
        body: data.body,
        variables: data.variables ?? [],
      },
    })
  }

  async updateTemplate(id: string, data: UpdateLoyaltyTemplateDto) {
    return this.prisma.loyaltyTemplate.update({ where: { id }, data })
  }

  async removeTemplate(id: string) {
    return this.prisma.loyaltyTemplate.delete({ where: { id } })
  }

  // ─── Campaigns ───

  async listCampaigns(socialAccountId: string) {
    return this.prisma.loyaltyCampaign.findMany({
      where: { socialAccountId },
      include: {
        bonus: { select: { id: true, name: true, rewardType: true } },
        template: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async createCampaign(data: CreateLoyaltyCampaignDto) {
    return this.prisma.loyaltyCampaign.create({
      data: {
        socialAccountId: data.socialAccountId,
        bonusId: data.bonusId,
        templateId: data.templateId,
        name: data.name,
        frequency: (data.frequency as LoyaltyCampaignFrequency | undefined) ?? 'ONCE',
        segmentCriteria: (data.segmentCriteria as object | undefined) ?? undefined,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
      },
      include: {
        bonus: { select: { id: true, name: true, rewardType: true } },
        template: { select: { id: true, name: true } },
      },
    })
  }

  async updateCampaign(id: string, data: UpdateLoyaltyCampaignDto) {
    return this.prisma.loyaltyCampaign.update({
      where: { id },
      data: {
        name: data.name,
        templateId: data.templateId,
        status: data.status as LoyaltyCampaignStatus | undefined,
        frequency: data.frequency as LoyaltyCampaignFrequency | undefined,
        segmentCriteria: (data.segmentCriteria as object | undefined) ?? undefined,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
      },
      include: {
        bonus: { select: { id: true, name: true, rewardType: true } },
        template: { select: { id: true, name: true } },
      },
    })
  }

  async removeCampaign(id: string) {
    return this.prisma.loyaltyCampaign.delete({ where: { id } })
  }
}
