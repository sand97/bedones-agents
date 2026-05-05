import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { OnEvent } from '@nestjs/event-emitter'
import type { Queue } from 'bullmq'
import { Prisma } from 'generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from '../auth/encryption.service'
import { LOYALTY_CAMPAIGN_QUEUE } from '../queue/queue.module'
import { FACEBOOK_GRAPH_API_VERSION } from '../common/config/facebook-scopes.config'
import {
  CampaignAudiencePreviewDto,
  CampaignTemplateSelectionDto,
  CreateLoyaltyBonusDto,
  CreateLoyaltyCampaignDto,
  CreateLoyaltyContactDto,
  CreateLoyaltyTemplateDto,
  UpdateLoyaltyTemplateDto,
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
  rejected_reason?: string
  rejection_reason?: string
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
  headerType?: string
  headerText?: string
  footerText?: string
  buttons?: Array<{ type: string; text: string; url?: string; phoneNumber?: string }>
  rejectionReason?: string
}

type LoyaltyRewardType = 'PRODUCTS' | 'CREDIT' | 'PERCENT'
type LoyaltyBonusStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED'
type LoyaltyCampaignStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'PAUSED'
  | 'CANCELLED'
  | 'FAILED'
type LoyaltyCampaignFrequency = 'ONCE' | 'DAILY' | 'WEEKLY' | 'MONTHLY'

export type LoyaltyCampaignJobName = 'send-campaign'
export interface LoyaltyCampaignJobData {
  campaignId: string
}

interface CampaignAudienceContact {
  conversationId: string
  participantId: string
  participantName: string
  languageCode: string | null
}

const MARKETING_TOPIC_ALIASES: Record<string, string> = {
  PROMOS: 'promotions',
  PROMO: 'promotions',
  PROMOTIONS: 'promotions',
  FIDELITE: 'loyalty',
  LOYALTY: 'loyalty',
  NOUVEAUTES: 'product_news',
  NEWS: 'product_news',
}

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name)

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    @InjectQueue(LOYALTY_CAMPAIGN_QUEUE) private campaignQueue: Queue,
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
    const headerComponent = (m.components ?? []).find((c) => c.type === 'HEADER')
    const footerComponent = (m.components ?? []).find((c) => c.type === 'FOOTER')
    const buttonsComponent = (m.components ?? []).find((c) => c.type === 'BUTTONS')
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
      headerType: headerComponent?.format ?? (headerComponent?.text ? 'TEXT' : 'NONE'),
      headerText: headerComponent?.text,
      footerText: footerComponent?.text,
      buttons: (buttonsComponent?.buttons ?? []).map((button) => ({
        type: String(button.type ?? 'QUICK_REPLY'),
        text: String(button.text ?? ''),
        url: typeof button.url === 'string' ? button.url : undefined,
        phoneNumber: typeof button.phone_number === 'string' ? button.phone_number : undefined,
      })),
      rejectionReason: m.rejected_reason ?? m.rejection_reason,
    }
  }

  /** Fetch the live list of WhatsApp Business message templates from Meta. */
  async listTemplates(socialAccountId: string): Promise<LoyaltyTemplate[]> {
    const { accessToken, wabaId } = await this.resolveWhatsAppAccount(socialAccountId)

    const fetched: MetaTemplate[] = []
    let nextUrl: string | null =
      `${META_API_BASE}/${wabaId}/message_templates` +
      `?fields=id,name,language,status,category,components,rejected_reason&limit=100`

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
      const buttons = data.buttons.reduce<Record<string, unknown>[]>((acc, b) => {
        const fixedText = this.getProductTemplateButtonText(b.type)
        const text = fixedText ?? b.text?.trim()
        if (!text) return acc
        if (b.type === 'URL') acc.push({ type: 'URL', text, url: b.url ?? '' })
        else if (b.type === 'PHONE_NUMBER')
          acc.push({ type: 'PHONE_NUMBER', text, phone_number: b.phoneNumber ?? '' })
        else if (b.type === 'CATALOG') acc.push({ type: 'CATALOG', text })
        else if (b.type === 'MPM') acc.push({ type: 'MPM', text })
        else acc.push({ type: 'QUICK_REPLY', text })
        return acc
      }, [])
      if (buttons.length > 0) {
        components.push({ type: 'BUTTONS', buttons } as MetaTemplateComponent)
      }
    }

    return components
  }

  private validateTemplateFooter(data: { category?: string; footerText?: string }) {
    const footer = data.footerText?.trim() ?? ''
    if (footer.length > 60) {
      throw new BadRequestException('Le footer doit contenir 60 caractères maximum')
    }
    if ((data.category ?? 'MARKETING') === 'MARKETING') {
      if (!footer.includes('STOP')) {
        throw new BadRequestException('Le footer des templates marketing doit contenir STOP')
      }
    }
  }

  private getProductTemplateButtonText(type?: string) {
    if (type === 'CATALOG') return 'View catalog'
    if (type === 'MPM') return 'View items'
    return undefined
  }

  private validateTemplateButtons(data: { category?: string; buttons?: Array<{ type?: string }> }) {
    const buttons = data.buttons ?? []
    const productButtons = buttons.filter((button) =>
      this.getProductTemplateButtonText(button.type),
    )
    if (productButtons.length === 0) return

    if ((data.category ?? 'MARKETING') !== 'MARKETING') {
      throw new BadRequestException(
        'Les boutons catalogue et multi-produits sont uniquement disponibles pour les templates marketing',
      )
    }

    if (buttons.length > 1 || productButtons.length > 1) {
      throw new BadRequestException(
        'Un template catalogue ou multi-produits ne peut contenir qu’un seul bouton',
      )
    }
  }

  /** Create a template directly on Meta (it enters Meta's review queue). */
  async createTemplate(data: CreateLoyaltyTemplateDto): Promise<LoyaltyTemplate> {
    const { accessToken, wabaId } = await this.resolveWhatsAppAccount(data.socialAccountId)
    this.validateTemplateFooter(data)
    this.validateTemplateButtons(data)

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
      footerText: data.footerText,
    }
  }

  async updateTemplate(
    socialAccountId: string,
    templateId: string,
    data: UpdateLoyaltyTemplateDto,
  ): Promise<LoyaltyTemplate> {
    const { accessToken } = await this.resolveWhatsAppAccount(socialAccountId)
    if (!data.body) throw new BadRequestException('Le corps du template est requis')
    this.validateTemplateFooter(data)
    this.validateTemplateButtons(data)

    const components = this.buildTemplateComponents({
      socialAccountId,
      name: data.name ?? '',
      language: data.language,
      category: data.category,
      body: data.body,
      variables: data.variables,
      headerType: data.headerType,
      headerText: data.headerText,
      headerMediaUrl: data.headerMediaUrl,
      footerText: data.footerText,
      buttons: data.buttons,
    })

    const res = await fetch(`${META_API_BASE}/${templateId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        category: data.category ?? 'MARKETING',
        components,
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      this.logger.error(`Meta template update failed: ${res.status} ${text}`)
      throw new BadRequestException(`Meta API error: ${text}`)
    }

    const updated = (await res.json().catch(() => ({}))) as {
      success?: boolean
      id?: string
      status?: string
    }
    return {
      id: updated.id ?? templateId,
      socialAccountId,
      name: data.name ?? '',
      language: data.language ?? 'fr',
      category: data.category ?? 'MARKETING',
      body: data.body,
      variables: data.variables ?? [],
      status: updated.status ?? 'PENDING',
      footerText: data.footerText,
    }
  }

  /** Delete a template on Meta by name (Meta deletes all language variants). */
  async removeTemplate(socialAccountId: string, name: string): Promise<void> {
    const { accessToken, wabaId } = await this.resolveWhatsAppAccount(socialAccountId)
    const usage = await this.findTemplateUsage(socialAccountId, name)
    if (usage.length > 0) {
      throw new BadRequestException({
        message: 'Ce template est utilisé et ne peut pas être supprimé',
        usage,
      })
    }

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

  private async findTemplateUsage(socialAccountId: string, templateName: string) {
    const campaigns = await this.prisma.loyaltyCampaign.findMany({
      where: { socialAccountId },
      select: {
        id: true,
        name: true,
        origin: true,
        metaTemplateName: true,
        templateAssignments: true,
        status: true,
      },
    })
    return campaigns
      .filter((campaign) => {
        if (campaign.metaTemplateName === templateName) return true
        const assignments =
          (campaign.templateAssignments as CampaignTemplateSelectionDto[] | null) ?? []
        return assignments.some((assignment) => assignment.metaTemplateName === templateName)
      })
      .map((campaign) => ({
        type: 'campaign',
        id: campaign.id,
        name: campaign.name,
        origin: campaign.origin,
        status: campaign.status,
      }))
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

  async listCampaigns(socialAccountId: string, params?: { origin?: string }) {
    return this.prisma.loyaltyCampaign.findMany({
      where: {
        socialAccountId,
        ...(params?.origin ? { origin: params.origin as 'LOYALTY' | 'GENERAL' } : {}),
      },
      include: {
        bonus: { select: { id: true, name: true, rewardType: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async createCampaign(data: CreateLoyaltyCampaignDto) {
    this.validateCampaignTemplateAssignments(data.templateAssignments)

    const campaign = await this.prisma.loyaltyCampaign.create({
      data: {
        socialAccountId: data.socialAccountId,
        bonusId: data.bonusId ?? null,
        origin: (data.origin as 'LOYALTY' | 'GENERAL' | undefined) ?? 'LOYALTY',
        metaTemplateId: data.metaTemplateId ?? null,
        metaTemplateName: data.metaTemplateName ?? null,
        metaTemplateLanguage: data.metaTemplateLanguage ?? null,
        name: data.name,
        frequency: (data.frequency as LoyaltyCampaignFrequency | undefined) ?? 'ONCE',
        marketingTopic: data.marketingTopic ?? 'general',
        segmentCriteria: (data.segmentCriteria as Prisma.InputJsonValue | undefined) ?? undefined,
        audienceType: data.audienceType as
          | 'RECENT_CONTACTS'
          | 'PRODUCT_INTEREST'
          | 'TICKET_STATUS'
          | undefined,
        audienceCriteria: (data.audienceCriteria as Prisma.InputJsonValue | undefined) ?? undefined,
        audienceLimit: data.audienceLimit ?? null,
        templateAssignments:
          (data.templateAssignments as unknown as Prisma.InputJsonValue | undefined) ?? undefined,
        variableValues: (data.variableValues as Prisma.InputJsonValue | undefined) ?? undefined,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
      },
      include: {
        bonus: { select: { id: true, name: true, rewardType: true } },
      },
    })
    await this.scheduleCampaign(campaign.id, campaign.startDate)
    return campaign
  }

  async updateCampaign(id: string, data: UpdateLoyaltyCampaignDto) {
    this.validateCampaignTemplateAssignments(data.templateAssignments)

    const campaign = await this.prisma.loyaltyCampaign.update({
      where: { id },
      data: {
        name: data.name,
        metaTemplateId: data.metaTemplateId,
        metaTemplateName: data.metaTemplateName,
        metaTemplateLanguage: data.metaTemplateLanguage,
        status: data.status as LoyaltyCampaignStatus | undefined,
        frequency: data.frequency as LoyaltyCampaignFrequency | undefined,
        marketingTopic: data.marketingTopic,
        segmentCriteria: (data.segmentCriteria as Prisma.InputJsonValue | undefined) ?? undefined,
        audienceType: data.audienceType as
          | 'RECENT_CONTACTS'
          | 'PRODUCT_INTEREST'
          | 'TICKET_STATUS'
          | undefined,
        audienceCriteria: (data.audienceCriteria as Prisma.InputJsonValue | undefined) ?? undefined,
        audienceLimit: data.audienceLimit,
        templateAssignments:
          (data.templateAssignments as unknown as Prisma.InputJsonValue | undefined) ?? undefined,
        variableValues: (data.variableValues as Prisma.InputJsonValue | undefined) ?? undefined,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
      },
      include: {
        bonus: { select: { id: true, name: true, rewardType: true } },
      },
    })
    await this.scheduleCampaign(campaign.id, campaign.startDate)
    return campaign
  }

  async removeCampaign(id: string) {
    return this.prisma.loyaltyCampaign.delete({ where: { id } })
  }

  private validateCampaignTemplateAssignments(assignments?: CampaignTemplateSelectionDto[]) {
    for (const assignment of assignments ?? []) {
      const productIds = assignment.mpmProductRetailerIds ?? []
      if (productIds.length > 30) {
        throw new BadRequestException('Un template multi-produits ne peut contenir que 30 produits')
      }
    }
  }

  async previewCampaignAudience(socialAccountId: string, dto: CampaignAudiencePreviewDto) {
    const contacts = await this.resolveAudienceContacts(socialAccountId, {
      audienceType: dto.audienceType,
      audienceCriteria: dto.audienceCriteria,
      audienceLimit: dto.audienceLimit,
      marketingTopic: dto.marketingTopic,
    })
    const languages = new Map<string, number>()
    for (const contact of contacts) {
      const code = contact.languageCode || 'unknown'
      languages.set(code, (languages.get(code) ?? 0) + 1)
    }
    return {
      count: contacts.length,
      maxEligible: contacts.length,
      limitedCount:
        typeof dto.audienceLimit === 'number'
          ? Math.min(dto.audienceLimit, contacts.length)
          : contacts.length,
      languages: Array.from(languages.entries()).map(([code, count]) => ({ code, count })),
    }
  }

  async getCampaignDetails(
    id: string,
    params?: { bucket?: string; page?: number; pageSize?: number },
  ) {
    const campaign = await this.prisma.loyaltyCampaign.findUnique({
      where: { id },
      include: { bonus: { select: { id: true, name: true, rewardType: true } } },
    })
    if (!campaign) throw new NotFoundException('Campagne introuvable')

    const start = campaign.startDate ?? campaign.createdAt
    const days = Array.from({ length: 15 }, (_, index) => {
      const date = new Date(start)
      date.setDate(date.getDate() + index)
      date.setHours(0, 0, 0, 0)
      return date
    })
    const contacts = await this.prisma.loyaltyCampaignContact.findMany({
      where: { campaignId: id },
      select: { deliveredAt: true, readAt: true, repliedAt: true },
    })
    const stats = days.map((day) => {
      const next = new Date(day)
      next.setDate(next.getDate() + 1)
      return {
        date: day.toISOString(),
        delivered: contacts.filter((c) => c.deliveredAt && c.deliveredAt < next).length,
        read: contacts.filter((c) => c.readAt && c.readAt < next).length,
        replied: contacts.filter((c) => c.repliedAt && c.repliedAt < next).length,
      }
    })

    const page = Math.max(1, params?.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, params?.pageSize ?? 20))
    const bucket = params?.bucket
    const where: Prisma.LoyaltyCampaignContactWhereInput = { campaignId: id }
    if (bucket === 'delivered') where.deliveredAt = { not: null }
    if (bucket === 'read') where.readAt = { not: null }
    if (bucket === 'replied') where.repliedAt = { not: null }
    const [total, pagedContacts] = await Promise.all([
      this.prisma.loyaltyCampaignContact.count({ where }),
      this.prisma.loyaltyCampaignContact.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return { campaign, stats, contacts: { data: pagedContacts, total, page, pageSize } }
  }

  private async scheduleCampaign(campaignId: string, startDate: Date | null) {
    if (!startDate) return
    const jobId = `campaign:${campaignId}`
    const existing = await this.campaignQueue.getJob(jobId)
    if (existing) await existing.remove().catch(() => undefined)
    await this.campaignQueue.add('send-campaign', { campaignId } satisfies LoyaltyCampaignJobData, {
      jobId,
      delay: Math.max(0, startDate.getTime() - Date.now()),
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: true,
      removeOnFail: 200,
    })
  }

  async enqueueDueCampaigns() {
    const campaigns = await this.prisma.loyaltyCampaign.findMany({
      where: {
        status: { in: ['SCHEDULED', 'DRAFT'] },
        startDate: { not: null },
      },
      select: { id: true, startDate: true },
    })
    for (const campaign of campaigns) {
      await this.scheduleCampaign(campaign.id, campaign.startDate)
    }
  }

  async sendCampaign(campaignId: string) {
    const campaign = await this.prisma.loyaltyCampaign.findUnique({
      where: { id: campaignId },
      include: { socialAccount: { omit: { accessToken: false } } },
    })
    if (!campaign) throw new NotFoundException('Campagne introuvable')
    if (!['SCHEDULED', 'DRAFT', 'RUNNING'].includes(campaign.status)) return
    if (campaign.socialAccount.provider !== 'WHATSAPP') {
      throw new BadRequestException('Les campagnes sont réservées aux comptes WhatsApp')
    }

    const existingSnapshot = await this.prisma.loyaltyCampaignContact.count({
      where: { campaignId },
    })
    if (existingSnapshot > 0) return

    await this.prisma.loyaltyCampaign.update({
      where: { id: campaignId },
      data: { status: 'RUNNING' },
    })

    const accessToken = await this.encryptionService.decrypt(campaign.socialAccount.accessToken)
    const contacts = await this.resolveCampaignContacts(campaign)
    const assignments = this.resolveCampaignAssignments(campaign)

    let failed = 0
    for (const contact of contacts) {
      const assignment = this.pickTemplateAssignment(assignments, contact.languageCode)
      if (!assignment) {
        failed++
        await this.createFailedCampaignContact(
          campaign.id,
          contact,
          'Aucun template pour la langue du contact',
        )
        continue
      }

      const variables = this.hydrateTemplateVariables(assignment.variableValues ?? {}, contact)
      const renderedBody = this.renderTemplateBody(assignment.body ?? '', variables)
      try {
        const platformMsgId = await this.sendWhatsAppTemplate(
          campaign.socialAccount.providerAccountId,
          contact.participantId,
          accessToken,
          assignment.metaTemplateName,
          assignment.metaTemplateLanguage,
          variables,
          {
            mpmProductRetailerIds: assignment.mpmProductRetailerIds,
            mpmSectionTitle: assignment.mpmSectionTitle,
            mpmThumbnailProductRetailerId: assignment.mpmThumbnailProductRetailerId,
          },
        )
        const message = await this.prisma.directMessage.create({
          data: {
            conversationId: contact.conversationId,
            platformMsgId,
            message: renderedBody || `[template:${assignment.metaTemplateName}]`,
            senderId: campaign.socialAccount.providerAccountId,
            senderName: 'Page',
            isFromPage: true,
            isRead: true,
            mediaType: 'template',
            deliveryStatus: 'sent',
            metadata: {
              kind: 'template',
              campaignId: campaign.id,
              templateId: assignment.metaTemplateId,
              templateName: assignment.metaTemplateName,
              templateLanguage: assignment.metaTemplateLanguage,
              variables,
              mpmProductRetailerIds: assignment.mpmProductRetailerIds ?? [],
            } satisfies Prisma.InputJsonValue,
            createdTime: new Date(),
          },
        })
        await this.prisma.loyaltyCampaignContact.create({
          data: {
            campaignId: campaign.id,
            conversationId: contact.conversationId,
            directMessageId: message.id,
            contactPhone: contact.participantId,
            contactName: contact.participantName,
            languageCode: contact.languageCode,
            templateId: assignment.metaTemplateId,
            templateName: assignment.metaTemplateName,
            templateLanguage: assignment.metaTemplateLanguage,
            platformMsgId,
            status: 'SENT',
            sentAt: new Date(),
          },
        })
        await this.prisma.conversation.update({
          where: { id: contact.conversationId },
          data: {
            lastMessageText: renderedBody || `[template:${assignment.metaTemplateName}]`,
            lastMessageAt: new Date(),
          },
        })
      } catch (error) {
        failed++
        await this.createFailedCampaignContact(
          campaign.id,
          contact,
          error instanceof Error ? error.message : String(error),
        )
      }
    }

    await this.refreshCampaignCounts(campaign.id)
    await this.prisma.loyaltyCampaign.update({
      where: { id: campaign.id },
      data: { status: contacts.length > 0 && failed === contacts.length ? 'FAILED' : 'COMPLETED' },
    })
  }

  private async createFailedCampaignContact(
    campaignId: string,
    contact: CampaignAudienceContact,
    error: string,
  ) {
    await this.prisma.loyaltyCampaignContact.create({
      data: {
        campaignId,
        conversationId: contact.conversationId,
        contactPhone: contact.participantId,
        contactName: contact.participantName,
        languageCode: contact.languageCode,
        status: 'FAILED',
        failedAt: new Date(),
        error,
      },
    })
  }

  private resolveCampaignAssignments(campaign: {
    metaTemplateId: string | null
    metaTemplateName: string | null
    metaTemplateLanguage: string | null
    templateAssignments: unknown
    variableValues: unknown
  }): CampaignTemplateSelectionDto[] {
    const assignments =
      (campaign.templateAssignments as CampaignTemplateSelectionDto[] | null) ?? []
    if (assignments.length > 0) return assignments
    if (!campaign.metaTemplateName || !campaign.metaTemplateLanguage) return []
    return [
      {
        allLanguages: true,
        metaTemplateId: campaign.metaTemplateId ?? '',
        metaTemplateName: campaign.metaTemplateName,
        metaTemplateLanguage: campaign.metaTemplateLanguage,
        variableValues: (campaign.variableValues as Record<string, string> | null) ?? {},
      },
    ]
  }

  private pickTemplateAssignment(
    assignments: CampaignTemplateSelectionDto[],
    languageCode: string | null,
  ) {
    const normalized = languageCode ?? 'unknown'
    return (
      assignments.find((assignment) => assignment.allLanguages) ??
      assignments.find((assignment) => assignment.languageCodes?.includes(normalized)) ??
      assignments.find((assignment) => assignment.languageCodes?.includes('unknown')) ??
      null
    )
  }

  private async resolveCampaignContacts(campaign: {
    socialAccountId: string
    audienceType: string | null
    audienceCriteria: unknown
    audienceLimit: number | null
    segmentCriteria: unknown
    marketingTopic: string
  }) {
    const contacts = await this.resolveAudienceContacts(campaign.socialAccountId, {
      audienceType: campaign.audienceType ?? undefined,
      audienceCriteria:
        (campaign.audienceCriteria as Record<string, unknown> | null) ??
        (campaign.segmentCriteria as Record<string, unknown> | null) ??
        undefined,
      audienceLimit: campaign.audienceLimit ?? undefined,
      marketingTopic: campaign.marketingTopic,
    })
    return contacts
  }

  private async resolveAudienceContacts(
    socialAccountId: string,
    input: {
      audienceType?: string
      audienceCriteria?: Record<string, unknown>
      audienceLimit?: number
      marketingTopic?: string
    },
  ): Promise<CampaignAudienceContact[]> {
    let contacts: CampaignAudienceContact[]
    if (input.audienceType === 'PRODUCT_INTEREST') {
      contacts = await this.resolveProductInterestContacts(socialAccountId, input.audienceCriteria)
    } else if (input.audienceType === 'TICKET_STATUS') {
      contacts = await this.resolveTicketStatusContacts(socialAccountId, input.audienceCriteria)
    } else if (input.audienceType === 'RECENT_CONTACTS') {
      contacts = await this.resolveRecentContacts(socialAccountId, input.audienceCriteria)
    } else {
      contacts = await this.resolveLoyaltySegmentContacts(socialAccountId, input.audienceCriteria)
    }

    contacts = await this.filterMarketingOptOuts(
      socialAccountId,
      contacts,
      input.marketingTopic ?? 'general',
    )

    const limit = input.audienceLimit
    if (typeof limit === 'number' && limit >= 0) return contacts.slice(0, limit)
    return contacts
  }

  private async resolveRecentContacts(
    socialAccountId: string,
    criteria?: Record<string, unknown>,
  ): Promise<CampaignAudienceContact[]> {
    const sinceRaw = typeof criteria?.since === 'string' ? criteria.since : undefined
    const since = sinceRaw ? new Date(sinceRaw) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const direction =
      criteria?.direction === 'OUTBOUND' || criteria?.direction === 'INBOUND'
        ? criteria.direction
        : 'ANY'

    const conversations = await this.prisma.conversation.findMany({
      where: { socialAccountId, lastMessageAt: { gte: since } },
      orderBy: { lastMessageAt: 'desc' },
      select: {
        id: true,
        participantId: true,
        participantName: true,
        languageCode: true,
        messages: {
          orderBy: { createdTime: 'desc' },
          take: 1,
          select: { isFromPage: true },
        },
      },
    })
    return conversations
      .filter((conversation) => {
        if (direction === 'ANY') return true
        const last = conversation.messages[0]
        if (!last) return false
        return direction === 'OUTBOUND' ? last.isFromPage : !last.isFromPage
      })
      .map((conversation) => ({
        conversationId: conversation.id,
        participantId: conversation.participantId,
        participantName: conversation.participantName,
        languageCode: conversation.languageCode,
      }))
  }

  private async resolveProductInterestContacts(
    socialAccountId: string,
    criteria?: Record<string, unknown>,
  ): Promise<CampaignAudienceContact[]> {
    const productIds = Array.isArray(criteria?.productIds)
      ? criteria.productIds.filter((id): id is string => typeof id === 'string')
      : []
    if (productIds.length === 0) return []

    const products = await this.prisma.product.findMany({
      where: { OR: [{ id: { in: productIds } }, { providerProductId: { in: productIds } }] },
      select: { id: true, providerProductId: true },
    })
    const matchIds = new Set<string>()
    for (const product of products) {
      matchIds.add(product.id)
      if (product.providerProductId) matchIds.add(product.providerProductId)
    }
    for (const productId of productIds) matchIds.add(productId)

    const source =
      criteria?.source === 'CUSTOMER' || criteria?.source === 'BUSINESS' ? criteria.source : 'BOTH'
    const messages = await this.prisma.directMessage.findMany({
      where: {
        conversation: { socialAccountId },
        metadata: { not: Prisma.JsonNull },
        ...(source === 'CUSTOMER'
          ? { isFromPage: false }
          : source === 'BUSINESS'
            ? { isFromPage: true }
            : {}),
      },
      select: {
        metadata: true,
        conversation: {
          select: {
            id: true,
            participantId: true,
            participantName: true,
            languageCode: true,
          },
        },
      },
    })

    const byConversation = new Map<string, CampaignAudienceContact>()
    for (const message of messages) {
      const metadata = message.metadata as {
        kind?: string
        productRetailerIds?: string[]
        items?: Array<{ productRetailerId?: string }>
      } | null
      const ids = [
        ...(metadata?.productRetailerIds ?? []),
        ...((metadata?.items ?? [])
          .map((item) => item.productRetailerId)
          .filter(Boolean) as string[]),
      ]
      if (!ids.some((id) => matchIds.has(id))) continue
      byConversation.set(message.conversation.id, {
        conversationId: message.conversation.id,
        participantId: message.conversation.participantId,
        participantName: message.conversation.participantName,
        languageCode: message.conversation.languageCode,
      })
    }
    return Array.from(byConversation.values())
  }

  private async resolveTicketStatusContacts(
    socialAccountId: string,
    criteria?: Record<string, unknown>,
  ): Promise<CampaignAudienceContact[]> {
    const statusIds = Array.isArray(criteria?.statusIds)
      ? criteria.statusIds.filter((id): id is string => typeof id === 'string')
      : []
    if (statusIds.length === 0) return []

    const tickets = await this.prisma.ticket.findMany({
      where: {
        statusId: { in: statusIds },
        conversationId: { not: null },
      },
      select: { conversationId: true },
    })
    const conversationIds = Array.from(
      new Set(tickets.map((ticket) => ticket.conversationId).filter(Boolean) as string[]),
    )
    const conversations = await this.prisma.conversation.findMany({
      where: { id: { in: conversationIds }, socialAccountId },
      select: {
        id: true,
        participantId: true,
        participantName: true,
        languageCode: true,
      },
    })
    const byConversation = new Map<string, CampaignAudienceContact>()
    for (const conversation of conversations) {
      byConversation.set(conversation.id, {
        conversationId: conversation.id,
        participantId: conversation.participantId,
        participantName: conversation.participantName,
        languageCode: conversation.languageCode,
      })
    }
    return Array.from(byConversation.values())
  }

  private async resolveLoyaltySegmentContacts(
    socialAccountId: string,
    criteria?: Record<string, unknown>,
  ): Promise<CampaignAudienceContact[]> {
    const where: Prisma.LoyaltyContactWhereInput = { socialAccountId }
    if (typeof criteria?.minSpend === 'number') where.totalSpent = { gte: criteria.minSpend }
    if (typeof criteria?.minOrders === 'number') where.orderCount = { gte: criteria.minOrders }
    const loyaltyContacts = await this.prisma.loyaltyContact.findMany({
      where,
      select: { phone: true },
    })
    const phones = loyaltyContacts.map((contact) => contact.phone.replace(/\D+/g, ''))
    if (phones.length === 0) return []
    const conversations = await this.prisma.conversation.findMany({
      where: { socialAccountId, participantId: { in: phones } },
      select: {
        id: true,
        participantId: true,
        participantName: true,
        languageCode: true,
      },
    })
    return conversations.map((conversation) => ({
      conversationId: conversation.id,
      participantId: conversation.participantId,
      participantName: conversation.participantName,
      languageCode: conversation.languageCode,
    }))
  }

  private async filterMarketingOptOuts(
    socialAccountId: string,
    contacts: CampaignAudienceContact[],
    marketingTopic: string,
  ) {
    if (contacts.length === 0) return contacts
    const preferences = await this.prisma.contactCommunicationPreference.findMany({
      where: {
        socialAccountId,
        conversationId: { in: contacts.map((contact) => contact.conversationId) },
        purpose: 'MARKETING',
        status: 'OPTED_OUT',
        topic: { in: ['all', marketingTopic] },
      },
      select: { conversationId: true },
    })
    const optedOut = new Set(preferences.map((preference) => preference.conversationId))
    return contacts.filter((contact) => !optedOut.has(contact.conversationId))
  }

  private hydrateTemplateVariables(
    values: Record<string, string>,
    contact: CampaignAudienceContact,
  ): Record<string, string> {
    const fullName = contact.participantName || ''
    const firstName = fullName.trim().split(/\s+/)[0] ?? ''
    const lastName = fullName.trim().split(/\s+/).slice(1).join(' ')
    const replacements: Record<string, string> = {
      Nom: lastName,
      Prénom: firstName,
      Prenom: firstName,
      'Nom complet': fullName,
    }
    return Object.fromEntries(
      Object.entries(values).map(([key, value]) => {
        let hydrated = value ?? ''
        for (const [token, replacement] of Object.entries(replacements)) {
          hydrated = hydrated.replaceAll(`[${token}]`, replacement).replaceAll(token, replacement)
        }
        return [key, hydrated]
      }),
    )
  }

  private renderTemplateBody(body: string, variables: Record<string, string>) {
    return body.replace(/{{\s*([^}]+?)\s*}}/g, (_, key: string) => variables[key.trim()] ?? '')
  }

  private async sendWhatsAppTemplate(
    phoneNumberId: string,
    recipientPhone: string,
    accessToken: string,
    templateName: string,
    languageCode: string,
    variables: Record<string, string>,
    options?: {
      mpmProductRetailerIds?: string[]
      mpmSectionTitle?: string
      mpmThumbnailProductRetailerId?: string
    },
  ): Promise<string | null> {
    const entries = Object.entries(variables).sort(([a], [b]) => {
      const an = Number(a)
      const bn = Number(b)
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn
      return a.localeCompare(b)
    })
    const components: Array<Record<string, unknown>> = []
    if (entries.length > 0) {
      components.push({
        type: 'body',
        parameters: entries.map(([, text]) => ({ type: 'text', text })),
      })
    }

    const mpmProductRetailerIds = (options?.mpmProductRetailerIds ?? [])
      .map((id) => id.trim())
      .filter(Boolean)
    if (mpmProductRetailerIds.length > 30) {
      throw new BadRequestException('Un template multi-produits ne peut envoyer que 30 produits')
    }
    if (mpmProductRetailerIds.length > 0) {
      components.push({
        type: 'button',
        sub_type: 'mpm',
        index: '0',
        parameters: [
          {
            type: 'action',
            action: {
              thumbnail_product_retailer_id:
                options?.mpmThumbnailProductRetailerId ?? mpmProductRetailerIds[0],
              sections: [
                {
                  title: options?.mpmSectionTitle?.trim() || 'Products',
                  product_items: mpmProductRetailerIds.map((id) => ({
                    product_retailer_id: id,
                  })),
                },
              ],
            },
          },
        ],
      })
    }

    const res = await fetch(
      `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipientPhone,
          type: 'template',
          template: {
            name: templateName,
            language: { code: languageCode },
            ...(components.length > 0 ? { components } : {}),
          },
        }),
      },
    )
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new BadRequestException(JSON.stringify(json?.error?.message || json))
    return (json as { messages?: Array<{ id: string }> }).messages?.[0]?.id ?? null
  }

  @OnEvent('campaign.whatsapp.status')
  async onWhatsAppCampaignStatus(payload: { platformMsgId: string; status: string }) {
    const contact = await this.prisma.loyaltyCampaignContact.findUnique({
      where: { platformMsgId: payload.platformMsgId },
      select: { id: true, campaignId: true, deliveredAt: true, readAt: true },
    })
    if (!contact) return
    const now = new Date()
    await this.prisma.loyaltyCampaignContact.update({
      where: { id: contact.id },
      data: {
        status:
          payload.status === 'read'
            ? 'READ'
            : payload.status === 'delivered'
              ? 'DELIVERED'
              : 'SENT',
        deliveredAt:
          payload.status === 'delivered' || payload.status === 'read'
            ? (contact.deliveredAt ?? now)
            : undefined,
        readAt: payload.status === 'read' ? (contact.readAt ?? now) : undefined,
      },
    })
    await this.refreshCampaignCounts(contact.campaignId)
  }

  @OnEvent('message.incoming')
  async onIncomingMessage(payload: {
    conversationId: string
    socialAccountId: string
    provider: string
    message: { text: string }
  }) {
    if (payload.provider !== 'WHATSAPP') return
    await this.recordCampaignReply(payload.conversationId)
    await this.recordMarketingOptOut(payload)
  }

  private async recordCampaignReply(conversationId: string) {
    const latest = await this.prisma.directMessage.findMany({
      where: { conversationId },
      orderBy: { createdTime: 'desc' },
      take: 2,
      include: { campaignContact: true },
    })
    const previous = latest[1]
    if (!previous?.campaignContact || previous.campaignContact.repliedAt) return
    const updated = await this.prisma.loyaltyCampaignContact.update({
      where: { id: previous.campaignContact.id },
      data: { repliedAt: new Date(), status: 'REPLIED' },
      select: { campaignId: true },
    })
    await this.refreshCampaignCounts(updated.campaignId)
  }

  private async recordMarketingOptOut(payload: {
    conversationId: string
    socialAccountId: string
    message: { text: string }
  }) {
    const normalized = payload.message.text.trim().toUpperCase()
    const match = normalized.match(/^STOP(?:\s+([A-Z0-9_-]+))?$/)
    if (!match) return

    const topic = match[1] ? (MARKETING_TOPIC_ALIASES[match[1]] ?? match[1].toLowerCase()) : 'all'
    await this.prisma.contactCommunicationPreference.upsert({
      where: {
        conversationId_channel_purpose_topic: {
          conversationId: payload.conversationId,
          channel: 'WHATSAPP',
          purpose: 'MARKETING',
          topic,
        },
      },
      create: {
        conversationId: payload.conversationId,
        socialAccountId: payload.socialAccountId,
        channel: 'WHATSAPP',
        purpose: 'MARKETING',
        topic,
        status: 'OPTED_OUT',
        source: 'whatsapp_keyword',
      },
      update: {
        status: 'OPTED_OUT',
        source: 'whatsapp_keyword',
      },
    })
    await this.prisma.contactConsentEvent.create({
      data: {
        conversationId: payload.conversationId,
        socialAccountId: payload.socialAccountId,
        channel: 'WHATSAPP',
        purpose: 'MARKETING',
        topic,
        action: 'OPT_OUT',
        source: 'whatsapp_keyword',
        rawText: payload.message.text,
      },
    })
  }

  private async refreshCampaignCounts(campaignId: string) {
    const [deliveredCount, readCount, repliedCount] = await Promise.all([
      this.prisma.loyaltyCampaignContact.count({
        where: { campaignId, deliveredAt: { not: null } },
      }),
      this.prisma.loyaltyCampaignContact.count({
        where: { campaignId, readAt: { not: null } },
      }),
      this.prisma.loyaltyCampaignContact.count({
        where: { campaignId, repliedAt: { not: null } },
      }),
    ])
    await this.prisma.loyaltyCampaign.update({
      where: { id: campaignId },
      data: { deliveredCount, readCount, repliedCount },
    })
  }
}
