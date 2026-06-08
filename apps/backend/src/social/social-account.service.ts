import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ErrorExplanationService } from './error-explanation.service'
import { SocialCommonService } from './social-common.service'

@Injectable()
export class SocialAccountService {
  constructor(
    private prisma: PrismaService,
    private errorExplanation: ErrorExplanationService,
    private common: SocialCommonService,
  ) {}

  // ─── Page settings ───

  async updatePageSettings(
    userId: string,
    socialAccountId: string,
    data: {
      undesiredCommentsAction?: string
      spamAction?: string
      customInstructions?: string
      faqRules?: { question: string; answer: string }[]
      catalogId?: string | null
    },
  ) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: { organisationId: true },
    })
    if (!account) throw new NotFoundException('Social account not found')

    await this.common.assertMembership(userId, account.organisationId)

    if (data.catalogId) {
      const catalog = await this.prisma.catalog.findUnique({
        where: { id: data.catalogId },
        select: { organisationId: true },
      })
      if (!catalog || catalog.organisationId !== account.organisationId) {
        throw new NotFoundException('Catalog not found')
      }
    }

    const settings = await this.prisma.pageSettings.upsert({
      where: { socialAccountId },
      create: {
        socialAccountId,
        isConfigured: true,
        undesiredCommentsAction: data.undesiredCommentsAction || 'hide',
        spamAction: data.spamAction || 'delete',
        customInstructions: data.customInstructions,
        catalogId: data.catalogId ?? null,
      },
      update: {
        isConfigured: true,
        undesiredCommentsAction: data.undesiredCommentsAction,
        spamAction: data.spamAction,
        customInstructions: data.customInstructions,
        ...(data.catalogId !== undefined && { catalogId: data.catalogId }),
      },
    })

    // Replace FAQ rules if provided
    if (data.faqRules) {
      await this.prisma.fAQRule.deleteMany({ where: { pageSettingsId: settings.id } })

      if (data.faqRules.length > 0) {
        await this.prisma.fAQRule.createMany({
          data: data.faqRules.map((rule) => ({
            pageSettingsId: settings.id,
            question: rule.question,
            answer: rule.answer,
          })),
        })
      }
    }

    const pageSettings = await this.prisma.pageSettings.findUnique({
      where: { id: settings.id },
      include: { faqRules: true },
    })
    if (!pageSettings) throw new NotFoundException('Page settings not found')
    return pageSettings
  }

  // ─── Get social accounts for org ───

  async getAccountsForOrg(userId: string, organisationId: string) {
    await this.common.assertMembership(userId, organisationId)

    const accounts = await this.prisma.socialAccount.findMany({
      where: { organisationId },
      include: {
        settings: { include: { faqRules: true } },
        _count: { select: { posts: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    const backfillIds = accounts
      .filter((account) => this.common.needsWhatsAppProfileBackfill(account))
      .map((account) => account.id)

    if (backfillIds.length === 0) return accounts

    const results = await Promise.allSettled(
      backfillIds.map((accountId) => this.common.backfillWhatsAppProfile(accountId)),
    )
    const hasUpdates = results.some((result) => result.status === 'fulfilled' && result.value)
    if (!hasUpdates) return accounts

    return this.prisma.socialAccount.findMany({
      where: { organisationId },
      include: {
        settings: { include: { faqRules: true } },
        _count: { select: { posts: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
  }

  // ─── Account health (for the "reconnect" error state) ───

  async getAccountHealth(userId: string, accountId: string) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: accountId },
      select: {
        provider: true,
        organisationId: true,
        disabled: true,
        disabledReason: true,
        featureDisabled: true,
        errorLogs: { take: 1, orderBy: { createdAt: 'desc' } },
      },
    })
    if (!account) throw new NotFoundException('Social account not found')
    await this.common.assertMembership(userId, account.organisationId)

    const last = account.errorLogs[0]
    let message: Record<string, string> | null = null
    if (last) {
      // Serve from the bank if warmed; otherwise generate + cache on demand.
      const signature = this.errorExplanation.buildSignature(
        last.provider,
        last.errorCode,
        last.resource,
      )
      message =
        (await this.errorExplanation.lookup(signature)) ??
        (await this.errorExplanation.getOrCreate({
          provider: last.provider,
          errorCode: last.errorCode,
          errorTrace: last.errorTrace,
          resource: last.resource,
        }))
    }

    return {
      disabled: account.disabled,
      disabledReason: account.disabledReason ?? undefined,
      featureDisabled: account.featureDisabled,
      message,
      lastError: last
        ? {
            code: last.errorCode ?? undefined,
            resource: last.resource ?? undefined,
            technical: last.errorTrace,
            createdAt: last.createdAt,
          }
        : null,
    }
  }

  // ─── Unread counts per provider (comments + messaging) ───

  async getUnreadCounts(userId: string, organisationId: string) {
    await this.common.assertMembership(userId, organisationId)

    const accounts = await this.prisma.socialAccount.findMany({
      where: { organisationId },
      select: {
        provider: true,
        scopes: true,
        posts: {
          select: {
            comments: {
              where: { isRead: false, isPageReply: false },
              select: { id: true },
            },
          },
        },
        conversations: {
          select: { unreadCount: true },
        },
      },
    })

    const counts: Record<string, number> = {}
    for (const account of accounts) {
      // Comment unread counts (keyed by provider: FACEBOOK, INSTAGRAM, TIKTOK)
      const unreadComments = account.posts.reduce((sum, post) => sum + post.comments.length, 0)
      counts[account.provider] = (counts[account.provider] || 0) + unreadComments

      // Messaging unread counts (keyed by messaging type)
      const hasMessaging =
        account.scopes.includes('messages') ||
        account.scopes.includes('whatsapp_business_messaging') ||
        account.scopes.includes('whatsapp_business_management') ||
        account.scopes.includes('message.list.read') ||
        account.scopes.includes('message.list.send') ||
        account.scopes.includes('message.list.manage')
      if (hasMessaging) {
        const unreadMessages = account.conversations.reduce(
          (sum, conv) => sum + conv.unreadCount,
          0,
        )
        const msgProvider =
          account.provider === 'INSTAGRAM'
            ? 'INSTAGRAM_DM'
            : account.provider === 'WHATSAPP'
              ? 'WHATSAPP'
              : account.provider === 'TIKTOK'
                ? 'TIKTOK_DM'
                : 'MESSENGER'
        counts[msgProvider] = (counts[msgProvider] || 0) + unreadMessages
      }
    }

    return Object.entries(counts).map(([provider, count]) => ({ provider, count }))
  }
}
