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
} from './dto/loyalty.dto'

const META_API_BASE = 'https://graph.facebook.com/v22.0'

interface MetaTemplateComponent {
  type: string
  text?: string
  format?: string
  example?: Record<string, unknown>
  buttons?: Array<Record<string, unknown>>
}

interface MetaTemplate {
  id: string
  name: string
  language: string
  status: string
  category: string
  components?: MetaTemplateComponent[]
}

/**
 * Public template shape returned to the frontend. Templates are NOT persisted
 * in our DB; they live on Meta and are fetched live on each list call.
 */
export interface LoyaltyTemplate {
  id: string // Meta template id
  socialAccountId: string
  name: string
  language: string
  category: string
  body: string
  variables: string[]
  status: string
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

  // ─── Templates (live from Meta — never persisted) ───

  /** Resolve a WhatsApp account or fail loudly. */
  private async resolveWhatsAppAccount(socialAccountId: string) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      omit: { accessToken: false },
    })
    if (!account) throw new NotFoundException('Compte social introuvable')
    if (account.provider !== 'WHATSAPP') {
      throw new BadRequestException('Cette opération est réservée aux comptes WhatsApp')
    }
    if (!account.wabaId) {
      throw new BadRequestException('WABA ID manquant pour ce numéro WhatsApp')
    }
    const accessToken = await this.encryptionService.decrypt(account.accessToken)
    return { account, accessToken, wabaId: account.wabaId }
  }

  private toLoyaltyTemplate(socialAccountId: string, m: MetaTemplate): LoyaltyTemplate {
    const bodyComponent = (m.components ?? []).find((c) => c.type === 'BODY')
    const body = bodyComponent?.text ?? ''
    const variables = Array.from(body.matchAll(/{{\s*([^}]+?)\s*}}/g), (x) => x[1].trim())
    return {
      id: m.id,
      socialAccountId,
      name: m.name,
      language: m.language,
      category: m.category,
      body,
      variables,
      status: m.status,
    }
  }

  /** Fetch the live list of WhatsApp Business message templates from Meta. */
  async listTemplates(socialAccountId: string): Promise<LoyaltyTemplate[]> {
    const { accessToken, wabaId } = await this.resolveWhatsAppAccount(socialAccountId)

    const fetched: MetaTemplate[] = []
    let nextUrl: string | null =
      `${META_API_BASE}/${wabaId}/message_templates` +
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

    return fetched.map((m) => this.toLoyaltyTemplate(socialAccountId, m))
  }

  /** Build Meta's `components` array from our flat DTO. */
  private buildTemplateComponents(data: CreateLoyaltyTemplateDto): MetaTemplateComponent[] {
    const components: MetaTemplateComponent[] = []

    // ─── HEADER ───
    if (data.headerType === 'TEXT' && data.headerText?.trim()) {
      components.push({ type: 'HEADER', text: data.headerText.trim() })
    } else if (
      (data.headerType === 'IMAGE' || data.headerType === 'VIDEO') &&
      data.headerMediaUrl
    ) {
      // NOTE: in production Meta requires a `header_handle` obtained via the
      // resumable upload API. For now we pass the public URL through `example`
      // so submission still goes through; switching to header_handle is a
      // future hardening step.
      components.push({
        type: 'HEADER',
        format: data.headerType,
        example: { header_url: [data.headerMediaUrl] },
      } as MetaTemplateComponent)
    }

    // ─── BODY (always required) ───
    components.push({ type: 'BODY', text: data.body })

    // ─── FOOTER ───
    if (data.footerText?.trim()) {
      components.push({ type: 'FOOTER', text: data.footerText.trim() })
    }

    // ─── BUTTONS ───
    if (data.buttons && data.buttons.length > 0) {
      const buttons = data.buttons
        .filter((b) => b.text?.trim())
        .map((b) => {
          if (b.type === 'URL') return { type: 'URL', text: b.text.trim(), url: b.url ?? '' }
          if (b.type === 'PHONE_NUMBER')
            return { type: 'PHONE_NUMBER', text: b.text.trim(), phone_number: b.phoneNumber ?? '' }
          return { type: 'QUICK_REPLY', text: b.text.trim() }
        })
      if (buttons.length > 0) {
        components.push({ type: 'BUTTONS', buttons } as MetaTemplateComponent)
      }
    }

    return components
  }

  /** Create a template directly on Meta (it enters Meta's review queue). */
  async createTemplate(data: CreateLoyaltyTemplateDto): Promise<LoyaltyTemplate> {
    const { accessToken, wabaId } = await this.resolveWhatsAppAccount(data.socialAccountId)

    const components = this.buildTemplateComponents(data)

    const res = await fetch(`${META_API_BASE}/${wabaId}/message_templates`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: data.name,
        language: data.language ?? 'fr',
        category: data.category ?? 'MARKETING',
        components,
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      this.logger.error(`Meta template create failed: ${res.status} ${text}`)
      throw new BadRequestException(`Meta API error: ${text}`)
    }

    const created = (await res.json()) as { id: string; status: string; category: string }
    return {
      id: created.id,
      socialAccountId: data.socialAccountId,
      name: data.name,
      language: data.language ?? 'fr',
      category: created.category ?? data.category ?? 'MARKETING',
      body: data.body,
      variables: data.variables ?? [],
      status: created.status ?? 'PENDING',
    }
  }

  /** Delete a template on Meta by name (Meta deletes all language variants). */
  async removeTemplate(socialAccountId: string, name: string): Promise<void> {
    const { accessToken, wabaId } = await this.resolveWhatsAppAccount(socialAccountId)

    const url = `${META_API_BASE}/${wabaId}/message_templates?name=${encodeURIComponent(name)}`
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      const text = await res.text()
      this.logger.error(`Meta template delete failed: ${res.status} ${text}`)
      throw new BadRequestException(`Meta API error: ${text}`)
    }
  }

  // ─── Campaigns ───

  /**
   * Estimate how many contacts match the given segment criteria — used by the
   * campaign creation modal to give the admin live feedback as they tune the
   * thresholds.
   */
  async previewCampaignCount(
    socialAccountId: string,
    criteria: { minSpend?: number; minOrders?: number },
  ): Promise<{ count: number }> {
    const where: Record<string, unknown> = { socialAccountId }
    if (typeof criteria.minSpend === 'number') {
      where.totalSpent = { gte: criteria.minSpend }
    }
    if (typeof criteria.minOrders === 'number') {
      where.orderCount = { gte: criteria.minOrders }
    }
    const count = await this.prisma.loyaltyContact.count({ where })
    return { count }
  }

  async listCampaigns(socialAccountId: string) {
    return this.prisma.loyaltyCampaign.findMany({
      where: { socialAccountId },
      include: {
        bonus: { select: { id: true, name: true, rewardType: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async createCampaign(data: CreateLoyaltyCampaignDto) {
    return this.prisma.loyaltyCampaign.create({
      data: {
        socialAccountId: data.socialAccountId,
        bonusId: data.bonusId,
        metaTemplateId: data.metaTemplateId ?? null,
        metaTemplateName: data.metaTemplateName ?? null,
        metaTemplateLanguage: data.metaTemplateLanguage ?? null,
        name: data.name,
        frequency: (data.frequency as LoyaltyCampaignFrequency | undefined) ?? 'ONCE',
        segmentCriteria: (data.segmentCriteria as object | undefined) ?? undefined,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
      },
      include: {
        bonus: { select: { id: true, name: true, rewardType: true } },
      },
    })
  }

  async updateCampaign(id: string, data: UpdateLoyaltyCampaignDto) {
    return this.prisma.loyaltyCampaign.update({
      where: { id },
      data: {
        name: data.name,
        metaTemplateId: data.metaTemplateId,
        metaTemplateName: data.metaTemplateName,
        metaTemplateLanguage: data.metaTemplateLanguage,
        status: data.status as LoyaltyCampaignStatus | undefined,
        frequency: data.frequency as LoyaltyCampaignFrequency | undefined,
        segmentCriteria: (data.segmentCriteria as object | undefined) ?? undefined,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
      },
      include: {
        bonus: { select: { id: true, name: true, rewardType: true } },
      },
    })
  }

  async removeCampaign(id: string) {
    return this.prisma.loyaltyCampaign.delete({ where: { id } })
  }
}
