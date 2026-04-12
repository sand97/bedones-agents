import { HumanMessage } from '@langchain/core/messages'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

const DEFAULT_PRODUCT_DESCRIPTION_PROMPT = `You are analyzing a product image for an e-commerce catalog.
Describe the product in the image in English. Include:
- Product type (clothing, electronics, food, etc.)
- Key visual features (color, pattern, material, size)
- Brand or logo if visible
- Any text visible on the product

Keep the description concise (2-3 sentences). Focus on attributes that would help identify this specific product.`

@Injectable()
export class GeminiVisionService {
  private readonly logger = new Logger(GeminiVisionService.name)
  private readonly visionModel: ChatGoogleGenerativeAI

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY')
    if (!apiKey) {
      throw new Error('Missing GEMINI_API_KEY for GeminiVisionService')
    }

    this.visionModel = new ChatGoogleGenerativeAI({
      apiKey,
      model: this.configService.get<string>('GEMINI_VISION_MODEL') || 'gemini-2.5-flash',
      temperature: 0.1,
      maxRetries: 2,
    })
  }

  async describeProductImage(imageBuffer: Buffer, customPrompt?: string): Promise<string> {
    const prompt = customPrompt || DEFAULT_PRODUCT_DESCRIPTION_PROMPT
    const base64 = imageBuffer.toString('base64')

    const result = await this.visionModel.invoke([
      new HumanMessage({
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: `data:image/jpeg;base64,${base64}` },
        ],
      }),
    ])

    const description = this.extractText(result.content).trim()

    if (!description) {
      throw new Error('Gemini vision returned an empty description')
    }

    this.logger.debug(`Gemini vision description: ${description}`)
    return description
  }

  private extractText(content: unknown): string {
    if (typeof content === 'string') return content
    if (!Array.isArray(content)) return ''

    return content
      .map((chunk) => {
        if (typeof chunk === 'string') return chunk
        if (
          typeof chunk === 'object' &&
          chunk !== null &&
          'text' in chunk &&
          typeof (chunk as { text?: unknown }).text === 'string'
        ) {
          return (chunk as { text: string }).text
        }
        return ''
      })
      .join(' ')
      .trim()
  }
}
