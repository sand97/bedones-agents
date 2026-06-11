import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { LoyaltyCampaignStatsService } from './loyalty-campaign-stats.service'

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
export class LoyaltyEngagementService {
  constructor(
    private prisma: PrismaService,
    private campaignStatsService: LoyaltyCampaignStatsService,
  ) {}

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
    await this.campaignStatsService.refreshCampaignCounts(contact.campaignId)
  }

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
    await this.campaignStatsService.refreshCampaignCounts(updated.campaignId)
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
}
