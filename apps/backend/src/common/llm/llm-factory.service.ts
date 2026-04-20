import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatOpenAI } from '@langchain/openai'
import type { Runnable } from '@langchain/core/runnables'
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base'
import type { AIMessageChunk } from '@langchain/core/messages'
import type { ZodV4Like } from '@langchain/core/utils/types'

export type LlmTier = 'thinking' | 'flash'

export interface LlmFactoryOptions {
  temperature?: number
  maxOutputTokens?: number
}

export type ChatModel = Runnable<BaseLanguageModelInput, AIMessageChunk>
export type StructuredChatModel<T> = Runnable<BaseLanguageModelInput, T>

/**
 * Builds a chat model with Gemini as primary and OpenAI as fallback.
 *
 * Two tiers are supported:
 * - `thinking`: most capable reasoning models with extended thinking enabled.
 *   Use this for agent context processing (onboarding, catalog analysis,
 *   knowledge ingestion) where correctness matters more than cost.
 * - `flash`: lightweight/fast models for live response generation (DM replies,
 *   comment auto-replies, moderation).
 *
 * Env vars (with stable defaults):
 *   GEMINI_API_KEY, OPENAI_API_KEY (legacy: OPENIA_API_KEY)
 *   GEMINI_MODEL_THINKING   (default: gemini-3.1-pro-preview)
 *   GEMINI_MODEL_FLASH      (default: gemini-3-flash-preview)
 *   OPENAI_MODEL_THINKING   (default: gpt-5)
 *   OPENAI_MODEL_FLASH      (default: gpt-5-mini)
 *   GEMINI_THINKING_BUDGET  (default: -1 = dynamic for thinking, 0 = off for flash)
 *   OPENAI_REASONING_EFFORT (default: medium)
 */
@Injectable()
export class LlmFactoryService {
  private readonly logger = new Logger(LlmFactoryService.name)

  constructor(private readonly config: ConfigService) {}

  createChatModel(tier: LlmTier, options: LlmFactoryOptions = {}): ChatModel {
    const gemini = this.buildGemini(tier, options)
    const openai = this.buildOpenAI(tier, options)

    if (gemini && openai) {
      return gemini.withFallbacks([openai])
    }
    if (gemini) return gemini
    if (openai) return openai

    throw new Error(
      'No LLM API key configured. Set GEMINI_API_KEY and/or OPENAI_API_KEY in your env.',
    )
  }

  /**
   * Build a model that emits a structured object matching the given Zod schema.
   * Applies structured-output to each provider individually, then chains them
   * with fallback so Gemini remains primary and OpenAI kicks in on failure.
   */
  createStructuredChatModel<T extends Record<string, unknown>>(
    tier: LlmTier,
    schema: ZodV4Like<T>,
    options: LlmFactoryOptions = {},
  ): StructuredChatModel<T> {
    const gemini = this.buildGemini(tier, options)
    const openai = this.buildOpenAI(tier, options)

    const geminiStructured = gemini
      ? (gemini.withStructuredOutput(schema) as StructuredChatModel<T>)
      : null
    const openaiStructured = openai
      ? (openai.withStructuredOutput(schema) as StructuredChatModel<T>)
      : null

    if (geminiStructured && openaiStructured) {
      return geminiStructured.withFallbacks([openaiStructured]) as StructuredChatModel<T>
    }
    if (geminiStructured) return geminiStructured
    if (openaiStructured) return openaiStructured

    throw new Error(
      'No LLM API key configured. Set GEMINI_API_KEY and/or OPENAI_API_KEY in your env.',
    )
  }

  private buildGemini(tier: LlmTier, options: LlmFactoryOptions): ChatGoogleGenerativeAI | null {
    const apiKey = this.config.get<string>('GEMINI_API_KEY')
    if (!apiKey) return null

    const model =
      tier === 'thinking'
        ? this.config.get<string>('GEMINI_MODEL_THINKING') || 'gemini-3.1-pro-preview'
        : this.config.get<string>('GEMINI_MODEL_FLASH') || 'gemini-3-flash-preview'

    const thinkingBudgetRaw = this.config.get<string>('GEMINI_THINKING_BUDGET')
    const thinkingBudget =
      thinkingBudgetRaw !== undefined && thinkingBudgetRaw !== ''
        ? Number(thinkingBudgetRaw)
        : tier === 'thinking'
          ? -1
          : 0

    return new ChatGoogleGenerativeAI({
      apiKey,
      model,
      temperature: options.temperature ?? 0.3,
      maxOutputTokens: options.maxOutputTokens,
      thinkingConfig: Number.isFinite(thinkingBudget) ? { thinkingBudget } : undefined,
    })
  }

  private buildOpenAI(tier: LlmTier, options: LlmFactoryOptions): ChatOpenAI | null {
    const apiKey =
      this.config.get<string>('OPENAI_API_KEY') || this.config.get<string>('OPENIA_API_KEY')
    if (!apiKey) return null

    const model =
      tier === 'thinking'
        ? this.config.get<string>('OPENAI_MODEL_THINKING') || 'gpt-5'
        : this.config.get<string>('OPENAI_MODEL_FLASH') || 'gpt-5-mini'

    const reasoningEffort =
      (this.config.get<string>('OPENAI_REASONING_EFFORT') as
        | 'minimal'
        | 'low'
        | 'medium'
        | 'high'
        | undefined) || 'medium'

    return new ChatOpenAI({
      apiKey,
      model,
      temperature: options.temperature ?? 0.3,
      maxTokens: options.maxOutputTokens,
      reasoning: tier === 'thinking' ? { effort: reasoningEffort } : undefined,
    })
  }
}
