import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatOpenAI } from '@langchain/openai'
import type { Runnable } from '@langchain/core/runnables'
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base'
import type { AIMessageChunk } from '@langchain/core/messages'
import type { ZodV4Like } from '@langchain/core/utils/types'
import { LangChainCallbackHandler } from '@posthog/ai/langchain'
import { PostHogService } from '../../posthog/posthog.service'

export type LlmTier = 'thinking' | 'flash'

/**
 * Optional PostHog LLM-observability context. When provided, the LLM call is
 * traced in PostHog (tokens, cost, latency, prompts/responses, errors) and
 * attributed to the given person/organisation.
 */
export interface LlmTraceContext {
  /** Person the call belongs to (org id, contact id, member id…). */
  distinctId?: string
  /** Groups several LLM calls under one trace (e.g. a whole agent turn). */
  traceId?: string
  properties?: Record<string, unknown>
  groups?: Record<string, string>
}

export interface LlmFactoryOptions {
  temperature?: number
  maxOutputTokens?: number
  /** Force a specific provider. Default: LLM_DEFAULT_PROVIDER (Gemini unless set to "openai"). */
  provider?: 'gemini' | 'openai'
  /** Override the model id. Default: the tier's env default. */
  model?: string
  /** Enable PostHog LLM observability for calls made with the returned model. */
  trace?: LlmTraceContext
}

export type ChatModel = Runnable<BaseLanguageModelInput, AIMessageChunk>
export type StructuredChatModel<T> = Runnable<BaseLanguageModelInput, T>

/**
 * Builds a chat model with one provider as primary and the other as fallback.
 * Gemini is primary by default; set LLM_DEFAULT_PROVIDER=openai to make ChatGPT
 * primary instead.
 *
 * Two tiers are supported:
 * - `thinking`: most capable reasoning models with extended thinking enabled.
 *   Use this for agent context processing (onboarding, catalog analysis,
 *   knowledge ingestion) where correctness matters more than cost.
 * - `flash`: lightweight/fast models for live response generation (DM replies,
 *   comment auto-replies, moderation).
 *
 * Env vars (with stable defaults):
 *   LLM_DEFAULT_PROVIDER    (default: gemini; set to "openai" to make ChatGPT primary)
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

  constructor(
    private readonly config: ConfigService,
    private readonly posthog: PostHogService,
  ) {}

  createChatModel(tier: LlmTier, options: LlmFactoryOptions = {}): ChatModel {
    const gemini = this.buildGemini(tier, options)
    const openai = this.buildOpenAI(tier, options)

    const openaiFirst = this.defaultProvider() === 'openai'
    const primary = openaiFirst ? openai : gemini
    const fallback = openaiFirst ? gemini : openai

    let model: ChatModel | null = null
    if (primary && fallback) model = primary.withFallbacks([fallback])
    else model = primary ?? fallback

    if (!model) {
      throw new Error(
        'No LLM API key configured. Set GEMINI_API_KEY and/or OPENAI_API_KEY in your env.',
      )
    }

    return this.withPosthogTracing(model, options.trace)
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

    const openaiFirst = this.defaultProvider() === 'openai'
    const primary = openaiFirst ? openaiStructured : geminiStructured
    const fallback = openaiFirst ? geminiStructured : openaiStructured

    let model: StructuredChatModel<T> | null = null
    if (primary && fallback) {
      model = primary.withFallbacks([fallback]) as StructuredChatModel<T>
    } else model = primary ?? fallback

    if (!model) {
      throw new Error(
        'No LLM API key configured. Set GEMINI_API_KEY and/or OPENAI_API_KEY in your env.',
      )
    }

    return this.withPosthogTracing(model, options.trace)
  }

  /**
   * Returns a single tool-callable chat model (one that exposes `bindTools`) for
   * use with LangGraph's `createReactAgent`, which cannot bind tools to a
   * fallback/traced Runnable. Gemini is preferred; OpenAI is used only when no
   * Gemini key is configured. PostHog tracing is NOT wrapped here (it would hide
   * `bindTools`); attach it at invoke time via `buildTraceCallbacks()`.
   */
  createToolCallingModel(
    tier: LlmTier,
    options: LlmFactoryOptions = {},
  ): ChatGoogleGenerativeAI | ChatOpenAI {
    let model: ChatGoogleGenerativeAI | ChatOpenAI | null
    if (options.provider === 'openai') model = this.buildOpenAI(tier, options)
    else if (options.provider === 'gemini') model = this.buildGemini(tier, options)
    else if (this.defaultProvider() === 'openai')
      model = this.buildOpenAI(tier, options) ?? this.buildGemini(tier, options)
    else model = this.buildGemini(tier, options) ?? this.buildOpenAI(tier, options)

    if (!model) {
      throw new Error(
        'No LLM API key configured for the requested provider. Set GEMINI_API_KEY and/or OPENAI_API_KEY in your env.',
      )
    }
    return model
  }

  /**
   * Builds the PostHog LangChain callback handler(s) for invoke-time tracing.
   * Returns an empty array when PostHog is disabled. Use this with models that
   * must keep `bindTools` available (e.g. createReactAgent): pass the result as
   * `{ callbacks }` on `.invoke()` instead of wrapping the model.
   */
  buildTraceCallbacks(trace?: LlmTraceContext): BaseCallbackHandler[] {
    const client = this.posthog.getClient()
    if (!client) return []
    return [
      new LangChainCallbackHandler({
        client,
        distinctId: trace?.distinctId ?? 'backend-agent',
        traceId: trace?.traceId,
        properties: { service: 'backend', ...trace?.properties },
        groups: trace?.groups,
        privacyMode: false,
      }) as BaseCallbackHandler,
    ]
  }

  /**
   * Attaches the PostHog LangChain callback handler so the call shows up in
   * PostHog's LLM analytics. No-op when PostHog is disabled — the model is
   * returned unchanged.
   */
  private withPosthogTracing<I, O>(model: Runnable<I, O>, trace?: LlmTraceContext): Runnable<I, O> {
    const client = this.posthog.getClient()
    if (!client) return model

    const handler = new LangChainCallbackHandler({
      client,
      distinctId: trace?.distinctId ?? 'backend-agent',
      traceId: trace?.traceId,
      properties: { service: 'backend', ...trace?.properties },
      groups: trace?.groups,
      privacyMode: false,
    })

    return model.withConfig({ callbacks: [handler as BaseCallbackHandler] }) as Runnable<I, O>
  }

  /**
   * Default provider used when the caller doesn't force one. Switchable via env
   * `LLM_DEFAULT_PROVIDER` (`gemini` | `openai`); defaults to Gemini. Lets ops
   * flip the whole platform (the live agent included) from Gemini to ChatGPT
   * without a code change.
   */
  private defaultProvider(): 'gemini' | 'openai' {
    return this.config.get<string>('LLM_DEFAULT_PROVIDER')?.trim().toLowerCase() === 'openai'
      ? 'openai'
      : 'gemini'
  }

  private buildGemini(tier: LlmTier, options: LlmFactoryOptions): ChatGoogleGenerativeAI | null {
    const apiKey = this.config.get<string>('GEMINI_API_KEY')
    if (!apiKey) return null

    const model =
      options.model ??
      (tier === 'thinking'
        ? this.config.get<string>('GEMINI_MODEL_THINKING') || 'gemini-3.1-pro-preview'
        : this.config.get<string>('GEMINI_MODEL_FLASH') || 'gemini-3-flash-preview')

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
      options.model ??
      (tier === 'thinking'
        ? this.config.get<string>('OPENAI_MODEL_THINKING') || 'gpt-5'
        : this.config.get<string>('OPENAI_MODEL_FLASH') || 'gpt-5-mini')

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
