import { Injectable } from '@nestjs/common'
import { Tool } from '@rekog/mcp-nest'
import { z } from 'zod'

import { PrismaService } from '../../prisma/prisma.service'
import { QdrantService } from '../../image-processing/qdrant.service'
import { debugOrgId } from '../debug-context'
import { READ_ONLY, withTitle } from '../annotations'
import { qdrantGetPointSchema, qdrantListSchema } from './debug-tool-schemas'

@Injectable()
export class DebugQdrantTools {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qdrant: QdrantService,
  ) {}

  @Tool({
    name: 'qdrant_list_indexed',
    annotations: withTitle('Inspecter Qdrant (catalogue indexé)', READ_ONLY),
    description:
      "Inspect what is indexed in Qdrant for this organisation's catalog(s): the stored payload of each point (product_name, price, category, …). Reveals indexing gaps — e.g. a missing `currency` field that makes the agent hallucinate prices.",
    parameters: qdrantListSchema,
  })
  async listIndexed(args: z.infer<typeof qdrantListSchema>) {
    const org = debugOrgId()
    if (!this.qdrant.isConfigured()) {
      return { error: 'Qdrant is not configured (QDRANT_URL unset).' }
    }

    const catalogs = await this.prisma.catalog.findMany({
      where: { organisationId: org, ...(args.catalogId ? { id: args.catalogId } : {}) },
      select: { id: true, name: true, providerId: true },
    })
    if (catalogs.length === 0) {
      return { error: 'No catalog found for this organisation.' }
    }

    const out = []
    for (const cat of catalogs) {
      const points = await this.qdrant.scrollProducts(cat.id, args.limit ?? 50)
      out.push({
        catalogId: cat.id,
        catalogName: cat.name,
        indexedCount: points.length,
        // Surfacing the payload keys makes missing fields (e.g. `currency`) obvious.
        payloadKeysSample: points[0] ? Object.keys(points[0].payload) : [],
        points: points.map((p) => ({ id: p.id, payload: p.payload })),
      })
    }
    return out
  }

  @Tool({
    name: 'qdrant_get_point',
    annotations: withTitle('Inspecter un point Qdrant', READ_ONLY),
    description:
      "Retrieve the full Qdrant payload of a single product point in this org's catalog.",
    parameters: qdrantGetPointSchema,
  })
  async getPoint(args: z.infer<typeof qdrantGetPointSchema>) {
    const org = debugOrgId()
    if (!this.qdrant.isConfigured()) {
      return { error: 'Qdrant is not configured (QDRANT_URL unset).' }
    }
    const cat = await this.prisma.catalog.findFirst({
      where: { id: args.catalogId, organisationId: org },
      select: { id: true },
    })
    if (!cat) {
      return { error: 'Catalog not found in this organisation.' }
    }
    const point = await this.qdrant.getProductPoint(cat.id, args.productId)
    return point ?? { error: 'Point not found in Qdrant for this product.' }
  }
}
