import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { I18nContext } from 'nestjs-i18n'
import { PrismaService } from '../prisma/prisma.service'
import { WhatsappOptinService } from '../whatsapp-optin/whatsapp-optin.service'
import {
  BulkUpdateNotificationPreferenceDto,
  BulkUpdateTicketStatusNotificationDto,
  NotificationTypeValue,
} from './dto/notification-preference.dto'

const COMMENT_PROVIDERS = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK'] as const
const MESSAGING_PROVIDERS = ['FACEBOOK', 'INSTAGRAM', 'WHATSAPP', 'TIKTOK'] as const

const COMMENT_TYPES: NotificationTypeValue[] = [
  'COMMENT_TO_READ',
  'COMMENT_AI_SUGGESTION',
  'COMMENT_DAILY_SUMMARY',
]
const MESSAGE_TYPES: NotificationTypeValue[] = [
  'MESSAGE_TO_READ',
  'MESSAGE_AI_SUGGESTION',
  'MESSAGE_TICKET_CREATED',
  'MESSAGE_DAILY_SUMMARY',
]

@Injectable()
export class NotificationPreferenceService {
  private readonly logger = new Logger(NotificationPreferenceService.name)

  constructor(
    private prisma: PrismaService,
    private readonly optin: WhatsappOptinService,
  ) {}

  /**
   * Enabling a notification from the dashboard makes the member eligible, so we
   * kick off the WhatsApp opt-in template right away — they can open their 24h
   * window without waiting for the daily cron. Fire-and-forget: a queue/Redis
   * hiccup must never make saving the preference fail (the cron is the
   * fallback).
   */
  private requestOptInForEnabled(userIds: string[], organisationId: string): void {
    void Promise.all(
      userIds.map((userId) =>
        this.optin
          .requestOptIn(userId, organisationId, 'dashboard')
          .catch((err) =>
            this.logger.warn(
              `[NotifPref] opt-in request failed for user ${userId} / org ${organisationId}: ${
                err instanceof Error ? err.message : err
              }`,
            ),
          ),
      ),
    )
  }

  async getForOrg(currentUserId: string, organisationId: string, rawUserIds?: string) {
    await this.assertMembership(currentUserId, organisationId)

    const userIds = this.parseUserIds(rawUserIds, currentUserId)
    await this.assertUsersAreMembers(userIds, organisationId)

    const [socialAccounts, members, preferences, ticketStatuses, ticketStatusNotifications] =
      await Promise.all([
        this.prisma.socialAccount.findMany({
          where: {
            organisationId,
            provider: { in: ['FACEBOOK', 'INSTAGRAM', 'WHATSAPP', 'TIKTOK'] },
          },
          select: {
            id: true,
            provider: true,
            providerAccountId: true,
            pageName: true,
            username: true,
            profilePictureUrl: true,
            catalogs: { select: { catalog: { select: { id: true } } }, take: 1 },
          },
        }),
        this.prisma.organisationMember.findMany({
          where: { organisationId, userId: { in: userIds } },
          select: {
            userId: true,
            user: { select: { id: true, name: true, avatar: true, email: true } },
          },
        }),
        this.prisma.notificationPreference.findMany({
          where: {
            userId: { in: userIds },
            socialAccount: { organisationId },
          },
          select: {
            userId: true,
            socialAccountId: true,
            type: true,
            enabled: true,
            collectionIds: true,
          },
        }),
        this.prisma.ticketStatus.findMany({
          where: { organisationId },
          orderBy: { order: 'asc' },
          select: { id: true, name: true, color: true, order: true },
        }),
        this.prisma.ticketStatusNotification.findMany({
          where: {
            userId: { in: userIds },
            socialAccount: { organisationId },
          },
          select: {
            userId: true,
            socialAccountId: true,
            ticketStatusId: true,
            enabled: true,
            collectionIds: true,
          },
        }),
      ])

    // Flatten the (first) linked catalog id so the UI can list its collections
    // for the per-member ticket-notification collection filter.
    const flat = socialAccounts.map((sa) => ({
      id: sa.id,
      provider: sa.provider,
      providerAccountId: sa.providerAccountId,
      pageName: sa.pageName,
      username: sa.username,
      profilePictureUrl: sa.profilePictureUrl,
      catalogId: sa.catalogs[0]?.catalog?.id ?? null,
    }))
    const commentSocialAccounts = flat.filter((sa) =>
      (COMMENT_PROVIDERS as readonly string[]).includes(sa.provider),
    )
    const messagingSocialAccounts = flat.filter((sa) =>
      (MESSAGING_PROVIDERS as readonly string[]).includes(sa.provider),
    )

    return {
      members: members.map((m) => m.user),
      commentSocialAccounts,
      messagingSocialAccounts,
      commentTypes: COMMENT_TYPES,
      messageTypes: MESSAGE_TYPES,
      preferences,
      // Per-status ticket notifications (opt-in): the org's statuses + each
      // member's enabled rows. The UI lists one toggle per status.
      ticketStatuses,
      ticketStatusNotifications,
    }
  }

  async bulkUpdate(
    currentUserId: string,
    organisationId: string,
    dto: BulkUpdateNotificationPreferenceDto,
  ) {
    await this.assertMembership(currentUserId, organisationId)
    await this.assertUsersAreMembers(dto.userIds, organisationId)
    const socialAccount = await this.assertSocialAccountInOrg(dto.socialAccountId, organisationId)
    this.assertTypeMatchesProvider(dto.type, socialAccount.provider)

    await this.prisma.$transaction(
      dto.userIds.map((userId) =>
        this.prisma.notificationPreference.upsert({
          where: {
            userId_socialAccountId_type: {
              userId,
              socialAccountId: dto.socialAccountId,
              type: dto.type,
            },
          },
          create: {
            userId,
            socialAccountId: dto.socialAccountId,
            type: dto.type,
            enabled: dto.enabled,
            collectionIds: dto.collectionIds ?? [],
          },
          update: {
            enabled: dto.enabled,
            ...(dto.collectionIds !== undefined ? { collectionIds: dto.collectionIds } : {}),
          },
        }),
      ),
    )

    if (dto.enabled) this.requestOptInForEnabled(dto.userIds, organisationId)

    return this.prisma.notificationPreference.findMany({
      where: {
        userId: { in: dto.userIds },
        socialAccountId: dto.socialAccountId,
        type: dto.type,
      },
      select: {
        userId: true,
        socialAccountId: true,
        type: true,
        enabled: true,
        collectionIds: true,
      },
    })
  }

  /** Upsert the per-status ticket notification for the given members/account. */
  async bulkUpdateTicketStatus(
    currentUserId: string,
    organisationId: string,
    dto: BulkUpdateTicketStatusNotificationDto,
  ) {
    await this.assertMembership(currentUserId, organisationId)
    await this.assertUsersAreMembers(dto.userIds, organisationId)
    await this.assertSocialAccountInOrg(dto.socialAccountId, organisationId)
    await this.assertTicketStatusInOrg(dto.ticketStatusId, organisationId)

    await this.prisma.$transaction(
      dto.userIds.map((userId) =>
        this.prisma.ticketStatusNotification.upsert({
          where: {
            userId_socialAccountId_ticketStatusId: {
              userId,
              socialAccountId: dto.socialAccountId,
              ticketStatusId: dto.ticketStatusId,
            },
          },
          create: {
            userId,
            socialAccountId: dto.socialAccountId,
            ticketStatusId: dto.ticketStatusId,
            enabled: dto.enabled,
            collectionIds: dto.collectionIds ?? [],
          },
          update: {
            enabled: dto.enabled,
            ...(dto.collectionIds !== undefined ? { collectionIds: dto.collectionIds } : {}),
          },
        }),
      ),
    )

    if (dto.enabled) this.requestOptInForEnabled(dto.userIds, organisationId)

    return this.prisma.ticketStatusNotification.findMany({
      where: {
        userId: { in: dto.userIds },
        socialAccountId: dto.socialAccountId,
        ticketStatusId: dto.ticketStatusId,
      },
      select: {
        userId: true,
        socialAccountId: true,
        ticketStatusId: true,
        enabled: true,
        collectionIds: true,
      },
    })
  }

  private parseUserIds(raw: string | undefined, fallback: string): string[] {
    if (!raw) return [fallback]
    const ids = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    return ids.length > 0 ? ids : [fallback]
  }

  private async assertMembership(userId: string, organisationId: string) {
    const membership = await this.prisma.organisationMember.findUnique({
      where: { userId_organisationId: { userId, organisationId } },
    })
    if (!membership) {
      throw new ForbiddenException(
        I18nContext.current()?.t('errors.member.not_member') ??
          "Vous n'êtes pas membre de cette organisation",
      )
    }
  }

  private async assertUsersAreMembers(userIds: string[], organisationId: string) {
    if (userIds.length === 0) return
    const count = await this.prisma.organisationMember.count({
      where: { organisationId, userId: { in: userIds } },
    })
    if (count !== userIds.length) {
      throw new ForbiddenException(
        'Certains utilisateurs ne sont pas membres de cette organisation',
      )
    }
  }

  private async assertSocialAccountInOrg(socialAccountId: string, organisationId: string) {
    const sa = await this.prisma.socialAccount.findFirst({
      where: { id: socialAccountId, organisationId },
      select: { id: true, provider: true },
    })
    if (!sa) throw new NotFoundException('Compte social introuvable')
    return sa
  }

  private async assertTicketStatusInOrg(ticketStatusId: string, organisationId: string) {
    const status = await this.prisma.ticketStatus.findFirst({
      where: { id: ticketStatusId, organisationId },
      select: { id: true },
    })
    if (!status) throw new NotFoundException('Statut de ticket introuvable')
  }

  private assertTypeMatchesProvider(type: NotificationTypeValue, provider: string) {
    const isComment = type.startsWith('COMMENT_')
    const isMessage = type.startsWith('MESSAGE_')
    const supportsComments = (COMMENT_PROVIDERS as readonly string[]).includes(provider)
    const supportsMessaging = (MESSAGING_PROVIDERS as readonly string[]).includes(provider)

    if (isComment && !supportsComments) {
      throw new BadRequestException(`${provider} ne supporte pas les notifications de commentaires`)
    }
    if (isMessage && !supportsMessaging) {
      throw new BadRequestException(`${provider} ne supporte pas les notifications de messagerie`)
    }
  }
}
