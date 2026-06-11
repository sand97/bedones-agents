import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import type { Queue } from 'bullmq'
import { Prisma } from 'generated/prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { LOYALTY_CAMPAIGN_QUEUE } from '../../queue/queue.module'
import {
  CampaignAudiencePreviewDto,
  CampaignTemplateSelectionDto,
  CreateLoyaltyCampaignDto,
  UpdateLoyaltyCampaignDto,
} from '../dto/loyalty.dto'
import { LoyaltyAudienceService } from './loyalty-audience.service'

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

@Injectable()
export class LoyaltyCampaignService {
  constructor(
    private prisma: PrismaService,
    private audienceService: LoyaltyAudienceService,
    @InjectQueue(LOYALTY_CAMPAIGN_QUEUE) private campaignQueue: Queue,
  ) {}

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
    const contacts = await this.audienceService.resolveAudienceContacts(socialAccountId, {
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
    const jobId = `campaign-${campaignId}`
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
}
