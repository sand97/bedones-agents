import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateLoyaltyContactDto, UpdateLoyaltyContactDto } from '../dto/loyalty.dto'

@Injectable()
export class LoyaltyContactService {
  constructor(private prisma: PrismaService) {}

  // ─── Contacts ───

  async listContacts(socialAccountId: string, params?: { search?: string }) {
    const where: Record<string, unknown> = { socialAccountId }
    if (params?.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { phone: { contains: params.search, mode: 'insensitive' } },
      ]
    }
    return this.prisma.loyaltyContact.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })
  }

  async createContact(data: CreateLoyaltyContactDto) {
    return this.prisma.loyaltyContact.create({
      data: {
        socialAccountId: data.socialAccountId,
        name: data.name,
        phone: data.phone,
        totalSpent: data.totalSpent ?? 0,
        orderCount: data.orderCount ?? 0,
      },
    })
  }

  async updateContact(id: string, data: UpdateLoyaltyContactDto) {
    return this.prisma.loyaltyContact.update({ where: { id }, data })
  }

  async removeContact(id: string) {
    return this.prisma.loyaltyContact.delete({ where: { id } })
  }
}
