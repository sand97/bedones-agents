import { Injectable, Logger } from '@nestjs/common'

import { GeminiEmbeddingService } from './gemini-embedding.service'
import { QdrantService, type SearchHit } from './qdrant.service'

const TEXT_VECTOR_SCORE_THRESHOLD = 0.2
const TEXT_VECTOR_RELAXED_SCORE_THRESHOLD = 0.12
const TOP_RANKING_MIN_RATIO = 0.5

const GENERIC_COVER_EN_TOKENS = new Set([
  'jersey',
  'football',
  'shirt',
  'kit',
  'home',
  'away',
  'training',
  'match',
])

export interface ProductSearchResult {
  id: string
  name: string
  description?: string
  price?: number
  currency?: string
  availability?: string
  collectionName?: string
  similarity?: number
  rankingScore?: number
}

type CatalogSearchHit = SearchHit & {
  primaryScore?: number
  englishScore?: number
  __rankingScore?: number
}

@Injectable()
export class CatalogSearchService {
  private readonly logger = new Logger(CatalogSearchService.name)

  constructor(
    private readonly embeddings: GeminiEmbeddingService,
    private readonly qdrantService: QdrantService,
  ) {}

  async searchProducts(
    catalogIds: string[],
    query: string,
    limit = 10,
    queryEn?: string,
  ): Promise<{ success: boolean; products: ProductSearchResult[]; error?: string }> {
    try {
      if (!this.qdrantService.isConfigured()) {
        return { success: false, products: [], error: 'Qdrant is not configured' }
      }
      if (!this.embeddings.isAvailable()) {
        return { success: false, products: [], error: 'Embeddings service is not available' }
      }
      return await this.searchVector(catalogIds, query, limit, queryEn)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error(`Search failed: ${message}`)
      return { success: false, products: [], error: message }
    }
  }

  private async searchVector(
    catalogIds: string[],
    query: string,
    limit: number,
    queryEn?: string,
  ): Promise<{ success: boolean; products: ProductSearchResult[]; error?: string }> {
    const trimmedQuery = query.trim()
    const trimmedQueryEn = queryEn?.trim()
    const normalizedQuery = this.normalizeForMatch(trimmedQuery)
    const normalizedQueryEn = trimmedQueryEn ? this.normalizeForMatch(trimmedQueryEn) : ''
    const sameIntent = Boolean(trimmedQueryEn) && normalizedQueryEn === normalizedQuery
    const candidateLimit = Math.max(limit, Math.min(limit * 3, 50))

    // Search across all catalogs
    const [primarySearch, englishSearch] = await Promise.all([
      this.searchAcrossCatalogs(catalogIds, trimmedQuery, candidateLimit),
      trimmedQueryEn && !sameIntent
        ? this.searchAcrossCatalogs(catalogIds, trimmedQueryEn, candidateLimit)
        : Promise.resolve([]),
    ])

    const englishHits = trimmedQueryEn ? (sameIntent ? primarySearch : englishSearch) : []

    const mergedHits = this.mergeHits(primarySearch, englishHits)
    const rerankedResults = this.rerankResults(trimmedQuery, trimmedQueryEn, mergedHits)
    const filteredResults = this.filterByTopRankingProximity(rerankedResults, limit)

    const products: ProductSearchResult[] = filteredResults.map((hit) => ({
      id: hit.productId,
      name: (hit.metadata.product_name as string) || (hit.metadata.name as string) || '',
      description: (hit.metadata.description as string) || undefined,
      price: (hit.metadata.price as number) || undefined,
      currency: (hit.metadata.currency as string) || undefined,
      availability: (hit.metadata.availability as string) || undefined,
      collectionName: (hit.metadata.collectionName as string) || undefined,
      similarity: hit.score,
      rankingScore: hit.__rankingScore,
    }))

    const sanitized = products.filter(
      (p) => typeof p.rankingScore === 'number' && Number.isFinite(p.rankingScore),
    )

    this.logger.debug(`Found ${sanitized.length} results via vector search`)
    return { success: true, products: sanitized }
  }

  private async searchAcrossCatalogs(
    catalogIds: string[],
    queryText: string,
    limit: number,
  ): Promise<SearchHit[]> {
    const embedding = await this.embeddings.embedText(queryText)

    const allHits: SearchHit[] = []
    for (const catalogId of catalogIds) {
      let hits = await this.qdrantService.searchSimilarText(
        catalogId,
        embedding,
        limit,
        TEXT_VECTOR_SCORE_THRESHOLD,
      )

      if (hits.length === 0) {
        hits = await this.qdrantService.searchSimilarText(
          catalogId,
          embedding,
          limit,
          TEXT_VECTOR_RELAXED_SCORE_THRESHOLD,
        )
      }

      allHits.push(...hits)
    }

    return allHits
  }

  private rerankResults(
    query: string,
    queryEn: string | undefined,
    hits: CatalogSearchHit[],
  ): CatalogSearchHit[] {
    const normalizedQuery = this.normalizeForMatch(query)
    const normalizedQueryEn = queryEn ? this.normalizeForMatch(queryEn) : ''
    const queryTokens = this.tokenize(normalizedQuery)
    const queryEnTokens = this.tokenize(normalizedQueryEn)
    const queryEnPriorityTokens = queryEnTokens.filter((t) => !GENERIC_COVER_EN_TOKENS.has(t))
    const queryEnTokensForCover =
      queryEnPriorityTokens.length > 0 ? queryEnPriorityTokens : queryEnTokens

    if (queryTokens.length === 0 && queryEnTokens.length === 0) return hits

    const reranked = hits.map((hit) => {
      const productName = this.normalizeForMatch(
        ((hit.metadata.product_name as string) || (hit.metadata.name as string) || '') as string,
      )
      const description = this.normalizeForMatch(
        ((hit.metadata.description as string) || '') as string,
      )
      const coverImageDescription = this.normalizeForMatch(
        ((hit.metadata.cover_image_description as string) || '') as string,
      )

      const fullQueryInName = Boolean(normalizedQuery && productName.includes(normalizedQuery))
      const fullQueryInDescription = Boolean(
        normalizedQuery && description.includes(normalizedQuery),
      )

      const tokenMatchesInName = queryTokens.reduce(
        (c, t) => c + (productName.includes(t) ? 1 : 0),
        0,
      )
      const tokenMatchesInDescription = queryTokens.reduce(
        (c, t) => c + (description.includes(t) ? 1 : 0),
        0,
      )
      const fullQueryEnInCover = Boolean(
        normalizedQueryEn && coverImageDescription.includes(normalizedQueryEn),
      )
      const tokenMatchesEnInCover = queryEnTokensForCover.reduce(
        (c, t) => c + (coverImageDescription.includes(t) ? 1 : 0),
        0,
      )
      const tokenMatchesEnInDescription = queryEnTokensForCover.reduce(
        (c, t) => c + (description.includes(t) ? 1 : 0),
        0,
      )

      const hasLexicalMatch =
        fullQueryInName ||
        fullQueryInDescription ||
        tokenMatchesInName > 0 ||
        tokenMatchesInDescription > 0 ||
        fullQueryEnInCover ||
        tokenMatchesEnInCover > 0 ||
        tokenMatchesEnInDescription > 0

      const primaryLexicalBoost =
        (fullQueryInName ? 0.35 : 0) +
        (fullQueryInDescription ? 0.12 : 0) +
        Math.min(0.3, tokenMatchesInName * 0.14 + tokenMatchesInDescription * 0.04)

      const englishLexicalBoost =
        (fullQueryEnInCover ? 0.45 : 0) +
        Math.min(0.35, tokenMatchesEnInCover * 0.16 + tokenMatchesEnInDescription * 0.04)

      const hasEnglishLexicalSignal = fullQueryEnInCover || tokenMatchesEnInCover > 0
      const lexicalPenalty = hasLexicalMatch
        ? queryEnTokens.length > 0 && !hasEnglishLexicalSignal
          ? 0.18
          : 0
        : 0.2

      const primarySemanticScore = hit.primaryScore ?? 0
      const englishSemanticScore = hit.englishScore ?? 0
      const englishCoverage =
        queryEnTokensForCover.length > 0
          ? tokenMatchesEnInCover / Math.max(queryEnTokensForCover.length, 1)
          : 0
      const englishSemanticWeight =
        queryEnTokens.length === 0
          ? 0
          : fullQueryEnInCover
            ? 0.85
            : englishCoverage > 0
              ? 0.55
              : 0.08
      const semanticScore = primarySemanticScore + englishSemanticScore * englishSemanticWeight

      const rankingScore =
        semanticScore + primaryLexicalBoost + englishLexicalBoost - lexicalPenalty

      return { ...hit, __rankingScore: rankingScore }
    })

    reranked.sort((a, b) => (b.__rankingScore ?? 0) - (a.__rankingScore ?? 0))
    return reranked
  }

  private filterByTopRankingProximity(hits: CatalogSearchHit[], limit: number): CatalogSearchHit[] {
    if (hits.length === 0) return []

    const topScore = hits[0].__rankingScore
    if (typeof topScore !== 'number' || !Number.isFinite(topScore)) {
      return hits.slice(0, limit)
    }

    const minAllowed = topScore > 0 ? topScore * TOP_RANKING_MIN_RATIO : topScore

    return hits
      .filter(
        (hit, i) =>
          i === 0 || (typeof hit.__rankingScore === 'number' && hit.__rankingScore >= minAllowed),
      )
      .slice(0, limit)
  }

  private mergeHits(primaryHits: SearchHit[], englishHits: SearchHit[]): CatalogSearchHit[] {
    const merged = new Map<string, CatalogSearchHit>()

    for (const hit of primaryHits) {
      merged.set(hit.productId, { ...hit, primaryScore: hit.score })
    }

    for (const hit of englishHits) {
      const existing = merged.get(hit.productId)
      if (!existing) {
        merged.set(hit.productId, { ...hit, englishScore: hit.score })
        continue
      }
      existing.englishScore = Math.max(existing.englishScore ?? 0, hit.score)
      existing.score = Math.max(existing.score, hit.score)
    }

    return [...merged.values()]
  }

  private tokenize(text: string): string[] {
    return Array.from(
      new Set(
        text
          .split(/\s+/)
          .map((t) => t.trim())
          .filter((t) => t.length >= 3),
      ),
    )
  }

  private normalizeForMatch(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
  }
}
