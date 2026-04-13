import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common'
import { I18nContext } from 'nestjs-i18n'
import { PrismaService } from '../prisma/prisma.service'

const DEFAULT_TICKET_STATUSES = [
  { name: 'Nouveau', color: '#1677ff', order: 0, isDefault: true },
  { name: 'En cours', color: '#fa8c16', order: 1, isDefault: false },
  { name: 'En attente', color: '#faad14', order: 2, isDefault: false },
  { name: 'Résolu', color: '#52c41a', order: 3, isDefault: false },
  { name: 'Annulé', color: '#ff4d4f', order: 4, isDefault: false },
]

@Injectable()
export class OrganisationService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, name: string) {
    return this.prisma.organisation.create({
      data: {
        name,
        members: {
          create: {
            userId,
            role: 'OWNER',
          },
        },
        ticketStatuses: {
          create: DEFAULT_TICKET_STATUSES,
        },
      },
      include: {
        members: true,
      },
    })
  }

  async update(userId: string, orgId: string, data: { name?: string; logoUrl?: string }) {
    // Verify user is a member
    await this.assertMembership(userId, orgId)

    return this.prisma.organisation.update({
      where: { id: orgId },
      data,
    })
  }

  async findById(userId: string, orgId: string) {
    await this.assertMembership(userId, orgId)

    const organisation = await this.prisma.organisation.findUnique({
      where: { id: orgId },
      include: {
        socialAccounts: {
          select: {
            id: true,
            provider: true,
            providerAccountId: true,
            pageName: true,
            scopes: true,
            createdAt: true,
          },
        },
        members: {
          select: {
            id: true,
            role: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
          },
        },
      },
    })
    if (!organisation) throw new NotFoundException('Organisation not found')
    return organisation
  }

  private async assertMembership(userId: string, orgId: string) {
    const membership = await this.prisma.organisationMember.findUnique({
      where: {
        userId_organisationId: {
          userId,
          organisationId: orgId,
        },
      },
    })

    if (!membership) {
      throw new ForbiddenException(
        I18nContext.current()?.t('errors.member.not_member') ??
          "Vous n'êtes pas membre de cette organisation",
      )
    }

    return membership
  }
}
