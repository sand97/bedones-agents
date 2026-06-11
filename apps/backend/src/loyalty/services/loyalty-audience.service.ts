import { Injectable } from '@nestjs/common'
import { Prisma } from 'generated/prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

export interface CampaignAudienceContact {
  conversationId: string
  participantId: string
  participantName: string
  languageCode: string | null
}

@Injectable()
export class LoyaltyAudienceService {
  constructor(private prisma: PrismaService) {}

  async resolveAudienceContacts(
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
}
