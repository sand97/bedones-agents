import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { I18nContext } from 'nestjs-i18n'
import { PrismaService } from '../prisma/prisma.service'
import {
  BulkUpdateNotificationPreferenceDto,
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
  'MESSAGE_TICKET_CLOSED',
  'MESSAGE_DAILY_SUMMARY',
]

@Injectable()
export class NotificationPreferenceService {
  constructor(private prisma: PrismaService) {}

  async getForOrg(currentUserId: string, organisationId: string, rawUserIds?: string) {
    await this.assertMembership(currentUserId, organisationId)

    const userIds = this.parseUserIds(rawUserIds, currentUserId)
    await this.assertUsersAreMembers(userIds, organisationId)

    const [socialAccounts, members, preferences] = await Promise.all([
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
    ])

    const commentSocialAccounts = socialAccounts.filter((sa) =>
      (COMMENT_PROVIDERS as readonly string[]).includes(sa.provider),
    )
    const messagingSocialAccounts = socialAccounts.filter((sa) =>
      (MESSAGING_PROVIDERS as readonly string[]).includes(sa.provider),
    )

    return {
      members: members.map((m) => m.user),
      commentSocialAccounts,
      messagingSocialAccounts,
      commentTypes: COMMENT_TYPES,
      messageTypes: MESSAGE_TYPES,
      preferences,
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
