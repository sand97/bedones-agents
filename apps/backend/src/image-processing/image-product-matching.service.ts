import { Injectable, Logger } from '@nestjs/common'

import { GeminiEmbeddingService } from './gemini-embedding.service'
import { GeminiVisionService } from './gemini-vision.service'
import { OcrService } from './ocr.service'
import { QdrantService, type SearchHit } from './qdrant.service'
import { SmartCropService } from './smart-crop.service'

export type ImageSearchMethod = 'ocr_keywords' | 'qdrant_image' | 'qdrant_text' | 'none' | 'error'

export interface MatchedProduct {
  id: string
  name: string
  description?: string | null
  retailer_id?: string | null
  category?: string | null
  price?: number | null
  coverImageDescription?: string | null
}

interface ImageProductMatchingInput {
  imageBuffer: Buffer
  catalogIds: string[]
  messageBody?: string
  thresholds?: { image?: number; text?: number }
}

export interface ImageAgentPayload {
  body: string
  imageProducts: MatchedProduct[]
  imageSearchMethod: ImageSearchMethod
  imageOcrText: string
  imageGeminiDescription: string
  imageContextBlock: string
}

export interface ImageProductMatchingResult {
  searchMethod: ImageSearchMethod
  confidence: number | null
  similarity: number | null
  ocrText: string
  keywords: string[]
  matchedProducts: MatchedProduct[]
  geminiDescription: string
  croppedSuccessfully: boolean
  productsFound: number
  error?: string
  agentPayload: ImageAgentPayload
}

@Injectable()
export class ImageProductMatchingService {
  private readonly logger = new Logger(ImageProductMatchingService.name)
  private static readonly MAX_PRODUCTS_IN_CONTEXT = 5

  constructor(
    private readonly ocrService: OcrService,
    private readonly qdrantService: QdrantService,
    private readonly geminiEmbeddingService: GeminiEmbeddingService,
    private readonly smartCropService: SmartCropService,
    private readonly geminiVisionService: GeminiVisionService,
  ) {}

  async matchIncomingImage(input: ImageProductMatchingInput): Promise<ImageProductMatchingResult> {
    const imageThreshold = this.resolveThreshold(input.thresholds?.image, 0.8)
    const textThreshold = this.resolveThreshold(input.thresholds?.text, 0.8)

    let searchMethod: ImageSearchMethod = 'none'
    let confidence: number | null = null
    let similarity: number | null = null
    let ocrText = ''
    let keywords: string[] = []
    let matchedProducts: MatchedProduct[] = []
    let geminiDescription = ''
    let croppedSuccessfully = false
    let imageForSimilarity = input.imageBuffer
    let errorMessage: string | undefined

    try {
      // Step 1: OCR extraction
      ocrText = await this.ocrService.extractText(input.imageBuffer)
      keywords = this.extractWords(ocrText)

      // Step 2: Smart crop for image similarity
      if (!matchedProducts.length) {
        imageForSimilarity = await this.smartCropService.cropOpenCV(input.imageBuffer)
        croppedSuccessfully = imageForSimilarity !== input.imageBuffer
      }

      // Step 3: Gemini image embedding similarity search across all catalogs
      if (
        !matchedProducts.length &&
        this.qdrantService.isConfigured() &&
        this.geminiEmbeddingService.isAvailable()
      ) {
        const imageEmbedding = await this.geminiEmbeddingService.embedImage(imageForSimilarity)

        const allHits: SearchHit[] = []
        for (const catalogId of input.catalogIds) {
          const hits = await this.qdrantService.searchSimilarImages(
            catalogId,
            imageEmbedding,
            ImageProductMatchingService.MAX_PRODUCTS_IN_CONTEXT,
            imageThreshold,
          )
          allHits.push(...hits)
        }

        // Sort by score descending, deduplicate by productId
        const deduped = this.deduplicateHits(allHits)

        if (deduped.length > 0) {
          matchedProducts = deduped
            .slice(0, ImageProductMatchingService.MAX_PRODUCTS_IN_CONTEXT)
            .map((hit) => this.toMatchedProduct(hit.productId, hit.metadata))
          searchMethod = 'qdrant_image'
          confidence = deduped[0].score
          similarity = deduped[0].score
        }
      }

      // Step 4: Gemini vision description + text embedding search
      if (
        !matchedProducts.length &&
        this.qdrantService.isConfigured() &&
        this.geminiEmbeddingService.isAvailable()
      ) {
        geminiDescription = await this.geminiVisionService.describeProductImage(imageForSimilarity)
        const textEmbedding = await this.geminiEmbeddingService.embedText(geminiDescription)

        const allHits: SearchHit[] = []
        for (const catalogId of input.catalogIds) {
          const hits = await this.qdrantService.searchSimilarText(
            catalogId,
            textEmbedding,
            ImageProductMatchingService.MAX_PRODUCTS_IN_CONTEXT,
            textThreshold,
          )
          allHits.push(...hits)
        }

        const deduped = this.deduplicateHits(allHits)

        if (deduped.length > 0) {
          matchedProducts = deduped
            .slice(0, ImageProductMatchingService.MAX_PRODUCTS_IN_CONTEXT)
            .map((hit) => this.toMatchedProduct(hit.productId, hit.metadata))
          searchMethod = 'qdrant_text'
          confidence = deduped[0].score
          similarity = deduped[0].score
        }
      }
    } catch (error: unknown) {
      searchMethod = 'error'
      errorMessage = error instanceof Error ? error.message : String(error || 'unknown error')
      this.logger.error(`Image pipeline failed: ${errorMessage}`)
    }

    const imageContextBlock = this.buildImageContextBlock({
      searchMethod,
      matchedProducts,
      confidence,
      ocrText,
      geminiDescription,
    })

    return {
      searchMethod,
      confidence,
      similarity,
      ocrText,
      keywords,
      matchedProducts,
      geminiDescription,
      croppedSuccessfully,
      productsFound: matchedProducts.length,
      error: errorMessage,
      agentPayload: {
        body: this.mergeImageContextIntoMessage(input.messageBody, imageContextBlock),
        imageProducts: matchedProducts,
        imageSearchMethod: searchMethod,
        imageOcrText: ocrText,
        imageGeminiDescription: geminiDescription,
        imageContextBlock,
      },
    }
  }

  private deduplicateHits(hits: SearchHit[]): SearchHit[] {
    const seen = new Map<string, SearchHit>()
    for (const hit of hits) {
      const existing = seen.get(hit.productId)
      if (!existing || hit.score > existing.score) {
        seen.set(hit.productId, hit)
      }
    }
    return Array.from(seen.values()).sort((a, b) => b.score - a.score)
  }

  private extractWords(text: string): string[] {
    if (!text) return []
    return Array.from(
      new Set(
        text
          .split('\n')
          .map((token) => token.trim().toLowerCase())
          .filter((token) => token.length > 0),
      ),
    )
  }

  private buildImageContextBlock(data: {
    searchMethod: ImageSearchMethod
    matchedProducts: MatchedProduct[]
    confidence: number | null
    ocrText: string
    geminiDescription: string
  }): string {
    const confidencePercent =
      typeof data.confidence === 'number' ? `${(data.confidence * 100).toFixed(1)}%` : 'N/A'

    if (data.matchedProducts.length > 0) {
      const primary = data.matchedProducts[0]
      const productsLine = data.matchedProducts.map((p) => `${p.name} (${p.id})`).join(' | ')

      return [
        '[IMAGE_CONTEXT]',
        `search_method=${data.searchMethod}`,
        `products_found=${data.matchedProducts.length}`,
        `products=${productsLine}`,
        `primary_product_id=${primary.id}`,
        `primary_product_name=${primary.name}`,
        `retailer_id=${primary.retailer_id || 'N/A'}`,
        `confidence=${confidencePercent}`,
        'instruction=Confirme avec le contact si ce produit correspond bien a son image.',
      ].join('\n')
    }

    return [
      '[IMAGE_CONTEXT]',
      `search_method=${data.searchMethod}`,
      'products_found=0',
      `ocr_excerpt=${data.ocrText.slice(0, 160) || 'N/A'}`,
      `gemini_description=${data.geminiDescription || 'N/A'}`,
      'instruction=Aucun produit identifie avec confiance suffisante. Continue la conversation normalement.',
    ].join('\n')
  }

  private mergeImageContextIntoMessage(
    messageBody: string | undefined,
    imageContextBlock: string,
  ): string {
    const baseText = messageBody?.trim() || '[Image envoyee par le contact]'
    return `${baseText}\n\n${imageContextBlock}`
  }

  private toMatchedProduct(productId: string, metadata: Record<string, unknown>): MatchedProduct {
    return {
      id: productId,
      name: this.toOptionalString(metadata.product_name) || 'Produit identifie',
      description: this.toOptionalString(metadata.description),
      retailer_id: this.toOptionalString(metadata.retailer_id),
      coverImageDescription:
        this.toOptionalString(metadata.cover_image_description) ||
        this.toOptionalString(metadata.image_description),
      category: this.toOptionalString(metadata.category),
      price:
        typeof metadata.price === 'number'
          ? metadata.price
          : Number.isFinite(Number(metadata.price))
            ? Number(metadata.price)
            : null,
    }
  }

  private toOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
  }

  private resolveThreshold(explicit: number | undefined, fallback: number): number {
    if (typeof explicit === 'number' && explicit > 0 && explicit <= 1) return explicit
    return fallback
  }
}
