import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { PrismaService } from '../../../prisma/prisma.service'

export function createPromotionTools(deps: { prisma: PrismaService; organisationId: string }) {
  type PromoLike = {
    discountType: string
    discountValue: number
    rewardType: string | null
    rewardCredit: number | null
    rewardPercent: number | null
    rewardProducts: Array<{ product: { name: string } }>
    minOrderAmount: number | null
    minItemCount: number | null
  }

  const formatReward = (p: PromoLike): string => {
    if (p.rewardType === 'PRODUCTS') {
      const names = p.rewardProducts.map((rp) => rp.product.name).filter(Boolean)
      return names.length ? `Produits offerts: ${names.join(', ')}` : 'Produits offerts'
    }
    if (p.rewardType === 'CREDIT') return `Credit: ${p.rewardCredit ?? p.discountValue} FCFA`
    if (p.rewardType === 'PERCENT') return `-${p.rewardPercent ?? p.discountValue}%`
    // Legacy promos without a rewardType still rely on discountType/discountValue.
    return p.discountType === 'PERCENTAGE' ? `-${p.discountValue}%` : `-${p.discountValue} FCFA`
  }

  const formatConditions = (p: PromoLike): string => {
    const parts: string[] = []
    if (p.minOrderAmount != null) parts.push(`Min commande: ${p.minOrderAmount} FCFA`)
    if (p.minItemCount != null) parts.push(`Min articles: ${p.minItemCount}`)
    return parts.join(', ')
  }

  const listPromotions = tool(
    async ({ activeOnly }) => {
      try {
        const where: Record<string, unknown> = {
          organisationId: deps.organisationId,
        }
        if (activeOnly) {
          where.status = 'ACTIVE'
        }

        const promotions = await deps.prisma.promotion.findMany({
          where,
          include: {
            products: {
              include: {
                product: { select: { id: true, name: true, price: true, currency: true } },
              },
            },
            rewardProducts: {
              include: { product: { select: { id: true, name: true } } },
            },
            _count: { select: { products: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })

        if (promotions.length === 0) return 'Aucune promotion trouvee.'

        const lines = promotions.map((p) => {
          const reward = formatReward(p)
          const period =
            p.startDate && p.endDate
              ? `Du ${p.startDate.toISOString().split('T')[0]} au ${p.endDate.toISOString().split('T')[0]}`
              : p.startDate
                ? `A partir du ${p.startDate.toISOString().split('T')[0]}`
                : 'Sans periode'
          const products =
            p._count.products > 0 ? `${p._count.products} produit(s)` : 'Tous les produits'
          const conditions = formatConditions(p)
          return `ID: ${p.id} | ${p.name} | Code: ${p.code || 'N/A'} | ${reward} | ${period} | ${products} | Statut: ${p.status} | Cumulable: ${p.stackable ? 'Oui' : 'Non'}${conditions ? ` | ${conditions}` : ''}`
        })
        return lines.join('\n')
      } catch (error: unknown) {
        return `Erreur: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    },
    {
      name: 'list_promotions',
      description:
        'List available promotions. Use activeOnly=true to show only currently active promotions to customers.',
      schema: z.object({
        activeOnly: z.boolean().optional().describe('If true, only return ACTIVE promotions'),
      }),
    },
  )

  const getPromotionDetails = tool(
    async ({ promotionId }) => {
      try {
        const promo = await deps.prisma.promotion.findUnique({
          where: { id: promotionId },
          include: {
            products: {
              include: {
                product: {
                  select: { id: true, name: true, price: true, currency: true, imageUrl: true },
                },
              },
            },
            rewardProducts: {
              include: { product: { select: { id: true, name: true } } },
            },
          },
        })

        if (!promo) return 'Promotion introuvable.'

        const reward = formatReward(promo)

        let result = `Nom: ${promo.name}\nCode: ${promo.code || 'N/A'}\nRecompense: ${reward}\nStatut: ${promo.status}\nCumulable: ${promo.stackable ? 'Oui' : 'Non'}`

        const conditions = formatConditions(promo)
        if (conditions) {
          result += `\nConditions d'eligibilite: ${conditions}`
        }

        if (promo.startDate && promo.endDate) {
          result += `\nPeriode: ${promo.startDate.toISOString().split('T')[0]} — ${promo.endDate.toISOString().split('T')[0]}`
        } else if (promo.startDate) {
          result += `\nPeriode: a partir du ${promo.startDate.toISOString().split('T')[0]}`
        }

        if (promo.description) {
          result += `\nDescription: ${promo.description}`
        }

        if (promo.products.length > 0) {
          result += `\nProduits eligibles:`
          for (const pp of promo.products) {
            result += `\n  - ${pp.product.name} (${pp.product.price || 'N/A'} ${pp.product.currency || ''})`
          }
        } else {
          result += '\nEligibilite: Tous les produits'
        }

        return result
      } catch (error: unknown) {
        return `Erreur: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    },
    {
      name: 'get_promotion_details',
      description: 'Get full details of a specific promotion including eligible products.',
      schema: z.object({
        promotionId: z.string().describe('The ID of the promotion'),
      }),
    },
  )

  return [listPromotions, getPromotionDetails]
}
