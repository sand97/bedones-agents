import { Injectable } from '@nestjs/common'
import { Tool } from '@rekog/mcp-nest'
import { z } from 'zod'
import { PrismaService } from '../../prisma/prisma.service'
import { mcpContext } from '../mcp-context'
import { READ_ONLY, withTitle } from './annotations'
import { listProductsSchema } from './tool-schemas'

@Injectable()
export class McpCatalogTools {
  constructor(private readonly prisma: PrismaService) {}

  @Tool({
    name: 'list_catalog_products',
    annotations: withTitle('Lister les produits', READ_ONLY),
    description:
      "Lister/rechercher les produits des catalogues de l'organisation (nom, prix, devise, catégorie).",
    parameters: listProductsSchema,
  })
  async listProducts(args: z.infer<typeof listProductsSchema>, _c: unknown, request: unknown) {
    const ctx = mcpContext(request)
    const products = await this.prisma.product.findMany({
      where: {
        catalog: { organisationId: ctx.organisationId },
        ...(args.search
          ? {
              OR: [
                { name: { contains: args.search, mode: 'insensitive' } },
                { description: { contains: args.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      take: args.limit || 20,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        providerProductId: true,
        name: true,
        description: true,
        price: true,
        currency: true,
        category: true,
        imageUrl: true,
        catalog: { select: { id: true, name: true } },
      },
    })
    return products
  }
}
