import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class LoyaltyCampaignStatsService {
  constructor(private prisma: PrismaService) {}

  async refreshCampaignCounts(campaignId: string) {
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
