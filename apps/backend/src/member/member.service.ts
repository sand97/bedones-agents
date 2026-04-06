import { Injectable, ForbiddenException, ConflictException } from '@nestjs/common'
import { I18nContext } from 'nestjs-i18n'
import { PrismaService } from '../prisma/prisma.service'
import type { InviteMemberDto } from './dto/member.dto'

@Injectable()
export class MemberService {
  constructor(private prisma: PrismaService) {}

  async listMembers(userId: string, orgId: string) {
    await this.assertMembership(userId, orgId)

    return this.prisma.organisationMember.findMany({
      where: { organisationId: orgId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatar: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async inviteMember(userId: string, orgId: string, dto: InviteMemberDto) {
    await this.assertAdmin(userId, orgId)

    // Find or create user by phone
    let user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    })

    if (!user) {
      // Create user in PENDING status
      user = await this.prisma.user.create({
        data: {
          phone: dto.phone,
          name: `${dto.firstName} ${dto.lastName}`,
          authType: 'PASSWORD', // placeholder, will set proper auth on verification
          status: 'PENDING',
        },
      })
    }

    // Check if already a member
    const existing = await this.prisma.organisationMember.findUnique({
      where: {
        userId_organisationId: {
          userId: user.id,
          organisationId: orgId,
        },
      },
    })

    if (existing) {
      throw new ConflictException(
        I18nContext.current()?.t('errors.member.phone_already_exists') ??
          'Ce numéro est déjà associé à un membre de cette organisation',
      )
    }

    return this.prisma.organisationMember.create({
      data: {
        userId: user.id,
        organisationId: orgId,
        role: dto.role,
        status: 'INVITED',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatar: true,
            status: true,
          },
        },
      },
    })
  }

  async removeMember(userId: string, orgId: string, memberId: string) {
    await this.assertAdmin(userId, orgId)

    const member = await this.prisma.organisationMember.findUniqueOrThrow({
      where: { id: memberId },
    })

    if (member.role === 'OWNER') {
      throw new ForbiddenException(
        I18nContext.current()?.t('errors.member.cannot_delete_owner') ??
          "Impossible de supprimer le propriétaire de l'organisation",
      )
    }

    return this.prisma.organisationMember.delete({
      where: { id: memberId },
    })
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

  private async assertAdmin(userId: string, orgId: string) {
    const membership = await this.assertMembership(userId, orgId)

    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
      throw new ForbiddenException(
        I18nContext.current()?.t('errors.member.insufficient_permissions') ??
          "Vous n'avez pas les droits pour cette action",
      )
    }

    return membership
  }
}
