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
  /**
   * Above this top-match score, the image match is reliable enough to skip the
   * explicit "is this the right product?" question — re-asking only stalls a sure
   * match. The agent confirms IMPLICITLY and advances the sale; below it, it asks
   * the customer to confirm. Env-overridable via IMAGE_IMPLICIT_CONFIRM_CONFIDENCE.
   */
  private static readonly DEFAULT_IMPLICIT_CONFIRM_CONFIDENCE = 0.85

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

      // Step 1b: Exact product-code match. Product images very often print the
      // merchant SKU / retailer_id (e.g. "#S180KAKI"). When OCR catches it, an
      // exact lookup identifies the product with CERTAINTY — far better than the
      // fuzzy image/text similarity below, which returns look-alikes and nudges
      // the agent into "proposing alternatives". Special characters (the leading
      // "#", dots…) are stripped first so they can't break the lookup.
      const codeCandidates = this.extractRetailerCodeCandidates(ocrText)
      if (codeCandidates.length > 0 && this.qdrantService.isConfigured()) {
        try {
          for (const catalogId of input.catalogIds) {
            const hit = await this.qdrantService.findByRetailerIds(catalogId, codeCandidates)
            if (hit) {
              matchedProducts = [this.toMatchedProduct(hit.productId, hit.metadata)]
              searchMethod = 'ocr_keywords'
              confidence = 1
              similarity = 1
              break
            }
          }
        } catch (error: unknown) {
          // Never let the code lookup break the pipeline — fall through to the
          // similarity search below.
          this.logger.warn(
            `Retailer-code lookup failed, falling back to similarity: ${error instanceof Error ? error.message : error}`,
          )
        }
      }

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

  /**
   * Pull plausible product-code candidates out of OCR text. Retailer SKUs printed
   * on product images look like "S180KAKI" (often prefixed with "#"). We:
   *  - split on whitespace/newlines,
   *  - strip every non-alphanumeric character (this removes the "#", dots, …),
   *  - keep tokens that mix letters AND digits (the SKU shape) — which drops
   *    prices ("60000"), currencies ("XAF") and plain words ("DISCUTABLE").
   * A token explicitly prefixed with "#" is always kept (strong code signal).
   * Each candidate is returned in its original, upper- and lower-case forms so the
   * exact Qdrant match works regardless of how the SKU was stored / OCR-cased.
   * False positives are harmless: they simply match no retailer_id.
   */
  private extractRetailerCodeCandidates(ocrText: string): string[] {
    if (!ocrText) return []
    const candidates = new Set<string>()

    for (const raw of ocrText.split(/\s+/)) {
      const hashPrefixed = raw.trim().startsWith('#')
      const cleaned = raw.replace(/[^a-zA-Z0-9]/g, '')
      if (cleaned.length < 4 || cleaned.length > 30) continue

      const hasLetter = /[a-zA-Z]/.test(cleaned)
      const hasDigit = /[0-9]/.test(cleaned)
      // A SKU mixes letters and digits; a leading "#" marks it as a code anyway.
      if (!hashPrefixed && !(hasLetter && hasDigit)) continue

      candidates.add(cleaned)
      candidates.add(cleaned.toUpperCase())
      candidates.add(cleaned.toLowerCase())
    }

    return [...candidates]
  }

  /**
   * Top-match score above which the agent confirms the image match implicitly
   * instead of asking the customer. Defaults to 0.85, overridable via env
   * IMAGE_IMPLICIT_CONFIRM_CONFIDENCE (a value in [0,1]); invalid values fall back.
   */
  private implicitConfirmConfidence(): number {
    const raw = Number(process.env.IMAGE_IMPLICIT_CONFIRM_CONFIDENCE)
    return Number.isFinite(raw) && raw > 0 && raw <= 1
      ? raw
      : ImageProductMatchingService.DEFAULT_IMPLICIT_CONFIRM_CONFIDENCE
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
    // The id handed to send_products MUST be the merchant retailer_id — WhatsApp
    // rejects the internal Qdrant product_id ("product not found for
    // product_retailer_id …"). Fall back to the product_id only when no
    // retailer_id is indexed (mirrors catalog.tools send-id resolution).
    const sendId = (p: MatchedProduct) => p.retailer_id || p.id

    // Exact code match: the customer literally sent the product (its SKU). The
    // choice is made — confirm availability and advance the sale; do NOT resend
    // the card or propose look-alikes/other colors (those come later, at the end).
    if (data.searchMethod === 'ocr_keywords' && data.matchedProducts.length > 0) {
      const primary = data.matchedProducts[0]
      return [
        '[IMAGE_CONTEXT]',
        'search_method=ocr_keywords',
        'match=exact_product_code',
        `primary_retailer_id=${sendId(primary)}`,
        `primary_product_name=${primary.name}`,
        'confidence=100%',
        "instruction=Produit identifie avec CERTITUDE par son code. Ne renvoie PAS la fiche produit et ne propose AUCUNE alternative ni autre coloris maintenant. Confirme simplement au client que ce produit est disponible, puis fais avancer la vente (demande la taille, la quantite, la livraison...). Tu pourras proposer d'autres coloris uniquement a la fin, une fois la commande en cours.",
      ].join('\n')
    }

    if (data.matchedProducts.length > 0) {
      const primary = data.matchedProducts[0]
      const productsLine = data.matchedProducts.map((p) => `${p.name} (${sendId(p)})`).join(' | ')

      // Above the confidence gate, the match is reliable enough to skip the
      // explicit "is this the right product?" question (it only stalls the sale):
      // confirm IMPLICITLY and advance. Below it, ask the customer to confirm.
      const highConfidence =
        typeof data.confidence === 'number' && data.confidence >= this.implicitConfirmConfidence()

      // To fetch/send the card, the agent MUST call get_product first: it is the
      // exact retailer-id lookup that resolves the catalog (so send_products can
      // actually send) and refreshes price from Meta. Calling send_products with a
      // bare retailer id that no get_product/search_products resolved first fails
      // to resolve the catalog — that is why a direct send "could not find" the
      // product. send_products is OPTIONAL here (the customer already sent the
      // photo, so they know the product): only show the card if it helps.
      const instruction = highConfidence
        ? "instruction=Produit identifie avec une FORTE confiance. NE redemande PAS au client de confirmer : pars du principe que c'est bien ce produit, confirme-le IMPLICITEMENT (ex: « Oui, il s'agit bien de notre Costume ceremonial bleu ») puis fais AVANCER la vente (demande la taille, la quantite, la livraison...). Le produit est deja identifie : PAS besoin de search_products. Pour (re)envoyer la fiche, appelle d'abord get_product avec le retailer_id puis send_products — jamais send_products seul avec un id non resolu, ni le product_id interne."
        : "instruction=Confiance moderee : demande au client de confirmer en UNE phrase courte que c'est bien ce produit. Pour recuperer ou envoyer la fiche, appelle d'abord get_product avec le retailer_id (lookup exact qui resout le catalogue) PUIS send_products — jamais send_products seul avec un id non resolu, ni le product_id interne."

      return [
        '[IMAGE_CONTEXT]',
        `search_method=${data.searchMethod}`,
        `products_found=${data.matchedProducts.length}`,
        `products=${productsLine}`,
        `primary_retailer_id=${sendId(primary)}`,
        `primary_product_name=${primary.name}`,
        `confidence=${confidencePercent}`,
        instruction,
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
