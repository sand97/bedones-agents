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
          products: {
            include: {
              product: {
                select: { id: true, name: true, imageUrl: true, price: true, currency: true },
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
        products: {
          include: {
            product: {
              select: { id: true, name: true, imageUrl: true, price: true, currency: true },
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

  async create(data: {
    organisationId: string
    name: string
    description?: string
    discountType?: string
    discountValue?: number
    code?: string
    startDate?: string
    endDate?: string
    productIds?: string[]
    stackable?: boolean
  }) {
    const resolvedIds = data.productIds?.length ? await this.resolveProductIds(data.productIds) : []

    const promotion = await this.prisma.promotion.create({
      data: {
        organisationId: data.organisationId,
        name: data.name,
        description: data.description,
        discountType: (data.discountType as 'PERCENTAGE' | 'FIXED_AMOUNT') || 'PERCENTAGE',
        discountValue: data.discountValue || 0,
        code: data.code,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        stackable: data.stackable ?? false,
        products: resolvedIds.length
          ? {
              create: resolvedIds.map((productId) => ({ productId })),
            }
          : undefined,
      },
      include: {
        products: {
          include: { product: { select: { id: true, name: true } } },
        },
      },
    })

    return promotion
  }

  async update(
    id: string,
    data: {
      name?: string
      description?: string
      discountType?: string
      discountValue?: number
      code?: string
      startDate?: string
      endDate?: string
      status?: string
      productIds?: string[]
      stackable?: boolean
    },
  ) {
    // Update promotion data
    await this.prisma.promotion.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        discountType: data.discountType as 'PERCENTAGE' | 'FIXED_AMOUNT' | undefined,
        discountValue: data.discountValue,
        code: data.code,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        status: data.status as 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | undefined,
        stackable: data.stackable,
      },
    })

    // Update product links if provided
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

    return this.findById(id)
  }

  async remove(id: string) {
    return this.prisma.promotion.delete({ where: { id } })
  }
}
