import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateLoyaltyBonusDto, UpdateLoyaltyBonusDto } from '../dto/loyalty.dto'

type LoyaltyRewardType = 'PRODUCTS' | 'CREDIT' | 'PERCENT'
type LoyaltyBonusStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED'

@Injectable()
export class LoyaltyBonusService {
  constructor(private prisma: PrismaService) {}

  // ─── Bonus ───

  async listBonuses(socialAccountId: string, params?: { search?: string; status?: string }) {
    const where: Record<string, unknown> = { socialAccountId }
    if (params?.status) where.status = params.status
    if (params?.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
      ]
    }
    return this.prisma.loyaltyBonus.findMany({
      where,
      include: {
        triggerProducts: {
          include: {
            product: {
              select: { id: true, name: true, imageUrl: true, price: true, currency: true },
            },
          },
        },
        rewardProducts: {
          include: {
            product: {
              select: { id: true, name: true, imageUrl: true, price: true, currency: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async getBonus(id: string) {
    const bonus = await this.prisma.loyaltyBonus.findUnique({
      where: { id },
      include: {
        triggerProducts: { include: { product: true } },
        rewardProducts: { include: { product: true } },
      },
    })
    if (!bonus) throw new NotFoundException('Bonus introuvable')
    return bonus
  }

  private async resolveProductIds(productIds: string[]): Promise<string[]> {
    if (productIds.length === 0) return []
    const products = await this.prisma.product.findMany({
      where: {
        OR: [{ id: { in: productIds } }, { providerProductId: { in: productIds } }],
      },
      select: { id: true },
    })
    return products.map((p) => p.id)
  }

  async createBonus(data: CreateLoyaltyBonusDto) {
    const triggerIds = data.triggerProductIds?.length
      ? await this.resolveProductIds(data.triggerProductIds)
      : []
    const rewardIds = data.rewardProductIds?.length
      ? await this.resolveProductIds(data.rewardProductIds)
      : []

    return this.prisma.loyaltyBonus.create({
      data: {
        socialAccountId: data.socialAccountId,
        name: data.name,
        description: data.description,
        stackable: data.stackable ?? false,
        targetSpend: data.targetSpend ?? null,
        targetOrderCount: data.targetOrderCount ?? null,
        targetProductsCount: data.targetProductsCount ?? null,
        rewardType: data.rewardType as LoyaltyRewardType,
        rewardCredit: data.rewardCredit ?? null,
        rewardPercent: data.rewardPercent ?? null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        triggerProducts: triggerIds.length
          ? { create: triggerIds.map((productId) => ({ productId })) }
          : undefined,
        rewardProducts: rewardIds.length
          ? { create: rewardIds.map((productId) => ({ productId })) }
          : undefined,
      },
      include: {
        triggerProducts: { include: { product: true } },
        rewardProducts: { include: { product: true } },
      },
    })
  }

  async updateBonus(id: string, data: UpdateLoyaltyBonusDto) {
    await this.prisma.loyaltyBonus.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        status: data.status as LoyaltyBonusStatus | undefined,
        stackable: data.stackable,
        targetSpend: data.targetSpend,
        targetOrderCount: data.targetOrderCount,
        targetProductsCount: data.targetProductsCount,
        rewardType: data.rewardType as LoyaltyRewardType | undefined,
        rewardCredit: data.rewardCredit,
        rewardPercent: data.rewardPercent,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
      },
    })

    if (data.triggerProductIds !== undefined) {
      await this.prisma.loyaltyBonusTriggerProduct.deleteMany({ where: { bonusId: id } })
      if (data.triggerProductIds.length > 0) {
        const ids = await this.resolveProductIds(data.triggerProductIds)
        if (ids.length > 0) {
          await this.prisma.loyaltyBonusTriggerProduct.createMany({
            data: ids.map((productId) => ({ bonusId: id, productId })),
          })
        }
      }
    }

    if (data.rewardProductIds !== undefined) {
      await this.prisma.loyaltyBonusRewardProduct.deleteMany({ where: { bonusId: id } })
      if (data.rewardProductIds.length > 0) {
        const ids = await this.resolveProductIds(data.rewardProductIds)
        if (ids.length > 0) {
          await this.prisma.loyaltyBonusRewardProduct.createMany({
            data: ids.map((productId) => ({ bonusId: id, productId })),
          })
        }
      }
    }

    return this.getBonus(id)
  }

  async removeBonus(id: string) {
    return this.prisma.loyaltyBonus.delete({ where: { id } })
  }
}
