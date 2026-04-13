import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { PrismaService } from '../../../prisma/prisma.service'

export function createPromotionTools(deps: { prisma: PrismaService; organisationId: string }) {
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
            _count: { select: { products: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })

        if (promotions.length === 0) return 'Aucune promotion trouvee.'

        const lines = promotions.map((p) => {
          const discount =
            p.discountType === 'PERCENTAGE' ? `-${p.discountValue}%` : `-${p.discountValue} FCFA`
          const period =
            p.startDate && p.endDate
              ? `Du ${p.startDate.toISOString().split('T')[0]} au ${p.endDate.toISOString().split('T')[0]}`
              : 'Sans periode'
          const products =
            p._count.products > 0 ? `${p._count.products} produit(s)` : 'Tous les produits'
          return `ID: ${p.id} | ${p.name} | Code: ${p.code || 'N/A'} | ${discount} | ${period} | ${products} | Statut: ${p.status} | Cumulable: ${p.stackable ? 'Oui' : 'Non'}`
        })
        return lines.join('\n')
      } catch (error: any) {
        return `Erreur: ${error.message}`
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
          },
        })

        if (!promo) return 'Promotion introuvable.'

        const discount =
          promo.discountType === 'PERCENTAGE'
            ? `-${promo.discountValue}%`
            : `-${promo.discountValue} FCFA`

        let result = `Nom: ${promo.name}\nCode: ${promo.code || 'N/A'}\nReduction: ${discount}\nStatut: ${promo.status}\nCumulable: ${promo.stackable ? 'Oui' : 'Non'}`

        if (promo.startDate && promo.endDate) {
          result += `\nPeriode: ${promo.startDate.toISOString().split('T')[0]} — ${promo.endDate.toISOString().split('T')[0]}`
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
      } catch (error: any) {
        return `Erreur: ${error.message}`
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
