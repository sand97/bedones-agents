import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class PromotionService {
  constructor(private prisma: PrismaService) {}

  async findAllByOrg(
    organisationId: string,
    params?: { status?: string; search?: string; page?: number; pageSize?: number },
  ) {
    const { status, search, page = 1, pageSize = 20 } = params || {}

    const where: Record<string, unknown> = { organisationId }
    if (status) where.status = status
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [promotions, total] = await Promise.all([
      this.prisma.promotion.findMany({
        where,
        include: {
          catalog: { select: { id: true, name: true } },
          products: {
            include: {
              product: {
                select: {
                  id: true,
                  providerProductId: true,
                  name: true,
                  imageUrl: true,
                  price: true,
                  currency: true,
                },
              },
            },
          },
          rewardProducts: {
            include: {
              product: {
                select: {
                  id: true,
                  providerProductId: true,
                  name: true,
                  imageUrl: true,
                  price: true,
                  currency: true,
                },
              },
            },
          },
          _count: { select: { products: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.promotion.count({ where }),
    ])

    return { promotions, total, page, pageSize }
  }

  async findById(id: string) {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id },
      include: {
        catalog: { select: { id: true, name: true } },
        products: {
          include: {
            product: {
              select: {
                id: true,
                providerProductId: true,
                name: true,
                imageUrl: true,
                price: true,
                currency: true,
              },
            },
          },
        },
        rewardProducts: {
          include: {
            product: {
              select: {
                id: true,
                providerProductId: true,
                name: true,
                imageUrl: true,
                price: true,
                currency: true,
              },
            },
          },
        },
      },
    })
    if (!promotion) throw new NotFoundException('Promotion introuvable')
    return promotion
  }

  /**
   * Resolve product IDs that may be either internal UUIDs or external provider IDs (Meta/WhatsApp).
   * Returns the internal UUIDs for use with PromotionProduct FK.
   */
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

  /**
   * Keep the legacy discountType/discountValue pair in sync with the richer
   * reward model so existing consumers (agent tools, list/table rendering)
   * keep working. Returns null when no rewardType is provided (legacy path).
   */
  private discountFromReward(data: {
    rewardType?: string
    rewardCredit?: number
    rewardPercent?: number
  }): { discountType: 'PERCENTAGE' | 'FIXED_AMOUNT'; discountValue: number } | null {
    switch (data.rewardType) {
      case 'PERCENT':
        return { discountType: 'PERCENTAGE', discountValue: data.rewardPercent ?? 0 }
      case 'CREDIT':
        return { discountType: 'FIXED_AMOUNT', discountValue: data.rewardCredit ?? 0 }
      case 'PRODUCTS':
        return { discountType: 'FIXED_AMOUNT', discountValue: 0 }
      default:
        return null
    }
  }

  async create(data: {
    organisationId: string
    catalogId?: string
    name: string
    description?: string
    status?: string
    discountType?: string
    discountValue?: number
    code?: string
    startDate?: string
    endDate?: string
    minOrderAmount?: number
    minItemCount?: number
    rewardType?: string
    rewardCredit?: number
    rewardPercent?: number
    rewardProductIds?: string[]
    productIds?: string[]
    stackable?: boolean
  }) {
    const resolvedIds = data.productIds?.length ? await this.resolveProductIds(data.productIds) : []
    const rewardIds = data.rewardProductIds?.length
      ? await this.resolveProductIds(data.rewardProductIds)
      : []

    const derived = this.discountFromReward(data)

    const promotion = await this.prisma.promotion.create({
      data: {
        organisationId: data.organisationId,
        catalogId: data.catalogId ?? null,
        name: data.name,
        description: data.description,
        status: (data.status as 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | undefined) ?? 'ACTIVE',
        discountType:
          derived?.discountType ??
          (data.discountType as 'PERCENTAGE' | 'FIXED_AMOUNT') ??
          'PERCENTAGE',
        discountValue: derived?.discountValue ?? data.discountValue ?? 0,
        code: data.code,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        minOrderAmount: data.minOrderAmount ?? null,
        minItemCount: data.minItemCount ?? null,
        rewardType: (data.rewardType as 'PRODUCTS' | 'CREDIT' | 'PERCENT' | undefined) ?? null,
        rewardCredit: data.rewardCredit ?? null,
        rewardPercent: data.rewardPercent ?? null,
        stackable: data.stackable ?? false,
        products: resolvedIds.length
          ? { create: resolvedIds.map((productId) => ({ productId })) }
          : undefined,
        rewardProducts: rewardIds.length
          ? { create: rewardIds.map((productId) => ({ productId })) }
          : undefined,
      },
    })

    return this.findById(promotion.id)
  }

  async update(
    id: string,
    data: {
      catalogId?: string | null
      name?: string
      description?: string
      discountType?: string
      discountValue?: number
      code?: string
      startDate?: string
      endDate?: string
      status?: string
      minOrderAmount?: number | null
      minItemCount?: number | null
      rewardType?: string
      rewardCredit?: number | null
      rewardPercent?: number | null
      rewardProductIds?: string[]
      productIds?: string[]
      stackable?: boolean
    },
  ) {
    const derived = this.discountFromReward(data as { rewardType?: string })

    // Update promotion data
    await this.prisma.promotion.update({
      where: { id },
      data: {
        catalogId: data.catalogId,
        name: data.name,
        description: data.description,
        discountType:
          derived?.discountType ?? (data.discountType as 'PERCENTAGE' | 'FIXED_AMOUNT' | undefined),
        discountValue: derived?.discountValue ?? data.discountValue,
        code: data.code,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        status: data.status as 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | undefined,
        minOrderAmount: data.minOrderAmount,
        minItemCount: data.minItemCount,
        rewardType: data.rewardType as 'PRODUCTS' | 'CREDIT' | 'PERCENT' | undefined,
        rewardCredit: data.rewardCredit,
        rewardPercent: data.rewardPercent,
        stackable: data.stackable,
      },
    })

    // Update eligible product links if provided
    if (data.productIds !== undefined) {
      await this.prisma.promotionProduct.deleteMany({ where: { promotionId: id } })
      if (data.productIds.length > 0) {
        const resolvedIds = await this.resolveProductIds(data.productIds)
        if (resolvedIds.length > 0) {
          await this.prisma.promotionProduct.createMany({
            data: resolvedIds.map((productId) => ({ promotionId: id, productId })),
          })
        }
      }
    }

    // Update reward product links if provided
    if (data.rewardProductIds !== undefined) {
      await this.prisma.promotionRewardProduct.deleteMany({ where: { promotionId: id } })
      if (data.rewardProductIds.length > 0) {
        const rewardIds = await this.resolveProductIds(data.rewardProductIds)
        if (rewardIds.length > 0) {
          await this.prisma.promotionRewardProduct.createMany({
            data: rewardIds.map((productId) => ({ promotionId: id, productId })),
          })
        }
      }
    }

    return this.findById(id)
  }

  async remove(id: string) {
    return this.prisma.promotion.delete({ where: { id } })
  }
}
