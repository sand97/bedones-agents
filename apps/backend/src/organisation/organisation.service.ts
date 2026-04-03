import { Injectable, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

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

    return this.prisma.organisation.findUniqueOrThrow({
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
      throw new ForbiddenException("Vous n'êtes pas membre de cette organisation")
    }

    return membership
  }
}
