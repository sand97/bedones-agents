import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class LabelService {
  constructor(private prisma: PrismaService) {}

  private async assertAccountAccess(userId: string, socialAccountId: string) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: { organisationId: true },
    })
    if (!account) throw new NotFoundException('Compte social introuvable')
    const membership = await this.prisma.organisationMember.findUnique({
      where: { userId_organisationId: { userId, organisationId: account.organisationId } },
    })
    if (!membership) throw new ForbiddenException("Vous n'êtes pas membre de cette organisation")
  }

  async findAll(userId: string, socialAccountId: string) {
    await this.assertAccountAccess(userId, socialAccountId)
    return this.prisma.label.findMany({
      where: { socialAccountId },
      orderBy: { order: 'asc' },
    })
  }

  async create(userId: string, data: { socialAccountId: string; name: string; color?: string }) {
    await this.assertAccountAccess(userId, data.socialAccountId)
    const maxOrder = await this.prisma.label.aggregate({
      where: { socialAccountId: data.socialAccountId },
      _max: { order: true },
    })
    return this.prisma.label.create({
      data: {
        socialAccountId: data.socialAccountId,
        name: data.name,
        color: data.color || '#1677ff',
        order: (maxOrder._max.order ?? -1) + 1,
      },
    })
  }

  async update(
    userId: string,
    id: string,
    data: { name?: string; color?: string; order?: number },
  ) {
    const label = await this.prisma.label.findUnique({
      where: { id },
      select: { socialAccountId: true },
    })
    if (!label) throw new NotFoundException('Label introuvable')
    await this.assertAccountAccess(userId, label.socialAccountId)
    return this.prisma.label.update({ where: { id }, data })
  }

  async remove(userId: string, id: string) {
    const label = await this.prisma.label.findUnique({
      where: { id },
      select: { socialAccountId: true },
    })
    if (!label) throw new NotFoundException('Label introuvable')
    await this.assertAccountAccess(userId, label.socialAccountId)
    return this.prisma.label.delete({ where: { id } })
  }
}
