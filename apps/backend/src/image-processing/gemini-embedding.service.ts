import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

export interface EmbeddingResult {
  values: number[]
}

/**
 * Unified embedding service using Gemini's multimodal embedding model.
 *
 * `gemini-embedding-2-preview` supports both text and image inputs,
 * producing embeddings in the same vector space — so image-to-text
 * and text-to-image similarity searches work natively.
 *
 * @see https://ai.google.dev/gemini-api/docs/embeddings
 */
@Injectable()
export class GeminiEmbeddingService {
  private readonly logger = new Logger(GeminiEmbeddingService.name)
  private readonly apiKey: string | null
  private readonly model: string
  private readonly outputDimensionality: number

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GEMINI_API_KEY') || null
    this.model =
      this.configService.get<string>('GEMINI_EMBEDDING_MODEL')?.trim() ||
      'gemini-embedding-2-preview'
    this.outputDimensionality = Number.parseInt(
      this.configService.get<string>('GEMINI_EMBEDDING_DIMENSIONS', '768'),
      10,
    )

    if (!this.apiKey) {
      this.logger.warn('GEMINI_API_KEY not configured — embedding features are disabled')
    } else {
      this.logger.log(
        `Gemini embedding service ready (model=${this.model}, dimensions=${this.outputDimensionality})`,
      )
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey
  }

  /** Embed a text string */
  async embedText(text: string): Promise<number[]> {
    if (!this.apiKey) throw new Error('Gemini embedding unavailable (missing API key)')

    const body = {
      model: `models/${this.model}`,
      content: {
        parts: [{ text }],
      },
      outputDimensionality: this.outputDimensionality,
    }

    const result = await this.callEmbedApi(body)
    this.logger.debug(`Generated text embedding (${result.values.length}d)`)
    return result.values
  }

  /** Embed an image buffer (PNG/JPEG) */
  async embedImage(imageBuffer: Buffer): Promise<number[]> {
    if (!this.apiKey) throw new Error('Gemini embedding unavailable (missing API key)')

    const mimeType = this.detectMimeType(imageBuffer)
    const base64 = imageBuffer.toString('base64')

    const body = {
      model: `models/${this.model}`,
      content: {
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: base64,
            },
          },
        ],
      },
      outputDimensionality: this.outputDimensionality,
    }

    const result = await this.callEmbedApi(body)
    this.logger.debug(`Generated image embedding (${result.values.length}d)`)
    return result.values
  }

  /** Embed multiple texts in batch */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []

    const results: number[][] = []
    // Process sequentially to avoid rate limits
    for (const text of texts) {
      results.push(await this.embedText(text))
    }
    return results
  }

  // ─── Private ───

  private async callEmbedApi(body: Record<string, unknown>): Promise<EmbeddingResult> {
    const url = `${GEMINI_API_BASE}/models/${this.model}:embedContent?key=${this.apiKey}`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      this.logger.error(
        `Gemini embedding API error (${response.status}): ${errorText.slice(0, 500)}`,
      )
      throw new Error(`Gemini embedding API error (${response.status}): ${errorText.slice(0, 200)}`)
    }

    const data = (await response.json()) as {
      embedding?: { values?: number[] }
    }

    const values = data.embedding?.values
    if (!values || values.length === 0) {
      throw new Error('Gemini embedding API returned empty embedding')
    }

    return { values }
  }

  private detectMimeType(buffer: Buffer): string {
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)
      return 'image/png'
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46)
      return 'image/webp'
    // Default to JPEG
    return 'image/jpeg'
  }
}
