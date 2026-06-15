import { Injectable } from '@nestjs/common'
import { Tool } from '@rekog/mcp-nest'
import { z } from 'zod'

import { PrismaService } from '../../prisma/prisma.service'
import { QdrantService } from '../../image-processing/qdrant.service'
import { GeminiEmbeddingService } from '../../image-processing/gemini-embedding.service'
import { ProductImageIndexingService } from '../../image-processing/product-image-indexing.service'
import { debugOrgId } from '../debug-context'
import { WRITE, WRITE_EXTERNAL, withTitle } from '../annotations'
import { addProductsSchema, indexProductsSchema, reindexCatalogSchema } from './debug-tool-schemas'

const SYNTHETIC_CATEGORIES = [
  'Vestes',
  'Chemises',
  'Pantalons',
  'Robes',
  'Chaussures',
  'Sacs',
  'Accessoires',
]

@Injectable()
export class DebugCatalogTools {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qdrant: QdrantService,
    private readonly embeddings: GeminiEmbeddingService,
    private readonly indexing: ProductImageIndexingService,
  ) {}

  private resolveCatalog(org: string, catalogId?: string) {
    return this.prisma.catalog.findFirst({
      where: { organisationId: org, ...(catalogId ? { id: catalogId } : {}) },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    })
  }

  @Tool({
    name: 'add_products',
    annotations: withTitle('Ajouter des articles au catalogue', WRITE),
    description:
      'Create products in a catalog of this organisation — explicit products and/or N synthetic ones for load testing. Returns how many were created. Run index_products afterwards to make them searchable in Qdrant.',
    parameters: addProductsSchema,
  })
  async addProducts(args: z.infer<typeof addProductsSchema>) {
    const org = debugOrgId()
    const cat = await this.resolveCatalog(org, args.catalogId)
    if (!cat) return { error: 'No catalog found for this organisation.' }

    const stamp = Date.now()
    const prefix = args.namePrefix ?? 'Article'

    const data = [
      ...(args.products ?? []).map((p, idx) => ({
        catalogId: cat.id,
        providerProductId: `dbg-${stamp}-${idx}`,
        name: p.name,
        price: p.price ?? null,
        currency: p.currency ?? 'XAF',
        description: p.description ?? null,
        category: p.category ?? null,
        imageUrl: p.imageUrl ?? null,
        additionalImageUrls: p.additionalImageUrls ?? [],
      })),
      ...Array.from({ length: args.count ?? 0 }, (_, k) => {
        const category = SYNTHETIC_CATEGORIES[k % SYNTHETIC_CATEGORIES.length]
        return {
          catalogId: cat.id,
          providerProductId: `dbg-${stamp}-syn-${k}`,
          name: `${prefix} ${k + 1} ${category}`,
          price: 1000 + ((k * 137) % 99000),
          currency: 'XAF',
          description: `${category} de test #${k + 1} pour la montée en charge.`,
          category,
        }
      }),
    ]

    if (data.length === 0) return { error: 'Provide `products` and/or `count`.' }

    await this.prisma.product.createMany({ data })
    return {
      catalogId: cat.id,
      catalogName: cat.name,
      created: data.length,
      hint: 'Run index_products to make these searchable in Qdrant.',
    }
  }

  @Tool({
    name: 'index_products',
    annotations: withTitle('Indexer le catalogue dans Qdrant', WRITE_EXTERNAL),
    description:
      "Text-embed this catalog's products and upsert them into Qdrant so search_products (and the agent) can find them. The stored payload INCLUDES `currency` — the field the production indexing pipeline omits. Costs one embedding call per product.",
    parameters: indexProductsSchema,
  })
  async indexProducts(args: z.infer<typeof indexProductsSchema>) {
    const org = debugOrgId()
    if (!this.embeddings.isAvailable()) {
      return { error: 'Embeddings unavailable (GEMINI_API_KEY unset).' }
    }
    if (!this.qdrant.isConfigured()) {
      return { error: 'Qdrant not configured (QDRANT_URL unset).' }
    }

    const cat = await this.resolveCatalog(org, args.catalogId)
    if (!cat) return { error: 'No catalog found for this organisation.' }

    const products = await this.prisma.product.findMany({
      where: { catalogId: cat.id },
      take: args.limit ?? 200,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        currency: true,
        category: true,
        imageUrl: true,
        providerProductId: true,
      },
    })
    if (products.length === 0) return { error: 'Catalog has no products to index.' }

    await this.qdrant.ensureCollection(cat.id)

    let indexed = 0
    let failed = 0
    for (const p of products) {
      const text = [p.name, p.description, p.category].filter(Boolean).join(' | ')
      if (!text.trim()) {
        failed++
        continue
      }
      try {
        const vector = await this.embeddings.embedText(text)
        await this.qdrant.upsertProduct(
          cat.id,
          p.id,
          { text: vector },
          {
            product_id: p.id,
            product_name: p.name,
            description: p.description ?? null,
            // Index the merchant retailer_id like production does, so search_products
            // returns a sendable id (not the internal UUID) for seeded products.
            retailer_id: p.providerProductId ?? null,
            category: p.category ?? null,
            price: p.price ?? null,
            currency: p.currency ?? null,
            image_url: p.imageUrl ?? null,
          },
        )
        indexed++
      } catch {
        failed++
      }
    }

    return {
      catalogId: cat.id,
      catalogName: cat.name,
      indexed,
      failed,
      note: 'Payload includes `currency` (omitted by the production indexing pipeline).',
    }
  }

  @Tool({
    name: 'reindex_catalog',
    annotations: withTitle('Réindexer le catalogue depuis Meta (purge Qdrant)', WRITE_EXTERNAL),
    description:
      'Re-sync this catalog from the live Meta (Facebook) catalog: re-fetch its products, (re)index them into Qdrant, and DELETE every Qdrant point that is no longer in Meta. Use this to purge stale or test points (e.g. debug load-test products, or leftovers from a previous catalog) so search_products and the agent only ever see real catalog products. Meta is the source of truth: if Meta returns no product, nothing is deleted.',
    parameters: reindexCatalogSchema,
  })
  async reindexCatalog(args: z.infer<typeof reindexCatalogSchema>) {
    const org = debugOrgId()
    if (!this.qdrant.isConfigured()) {
      return { error: 'Qdrant not configured (QDRANT_URL unset).' }
    }

    const cat = await this.resolveCatalog(org, args.catalogId)
    if (!cat) return { error: 'No catalog found for this organisation.' }

    const countPoints = async (): Promise<number | null> => {
      try {
        return (await this.qdrant.getIndexedProducts(cat.id)).size
      } catch {
        return null
      }
    }

    const qdrantPointsBefore = await countPoints()
    const result = await this.indexing.syncCatalog(cat.id, org)
    const qdrantPointsAfter = await countPoints()

    return {
      catalogId: cat.id,
      catalogName: cat.name,
      qdrantPointsBefore,
      qdrantPointsAfter,
      removedFromQdrant:
        qdrantPointsBefore !== null && qdrantPointsAfter !== null
          ? Math.max(0, qdrantPointsBefore - qdrantPointsAfter)
          : null,
      ...result,
    }
  }
}
