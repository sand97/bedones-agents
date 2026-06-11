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

/**
 * Capability tiers. `thinking` is internal (agent onboarding / context analysis).
 * `flash` | `pro` | `ultra` are the user-facing live-agent tiers an admin can
 * pick per agent — flash is fast/cheap, ultra is the most capable. Every tier
 * maps to a model on BOTH providers, so the provider+fallback choice
 * (LLM_DEFAULT_PROVIDER) is orthogonal to the tier.
 */
export type LlmTier = 'thinking' | 'flash' | 'pro' | 'ultra'

/** User-facing live-agent model tiers (what an admin picks in the UI). */
export const LIVE_MODEL_TIERS = ['flash', 'pro', 'ultra'] as const
export type LiveModelTier = (typeof LIVE_MODEL_TIERS)[number]

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
 * Tiers:
 * - `thinking`: most capable reasoning model with extended thinking — internal,
 *   for agent context processing (onboarding, catalog analysis).
 * - `flash`: fast/cheap, the default for live response generation.
 * - `pro`: flash-class model with reasoning enabled — a "smarter flash".
 * - `ultra`: the most capable model (≈ thinking) for live responses.
 *
 * Env vars (with stable defaults):
 *   LLM_DEFAULT_PROVIDER    (default: gemini; set to "openai" to make ChatGPT primary)
 *   GEMINI_API_KEY, OPENAI_API_KEY (legacy: OPENIA_API_KEY)
 *   GEMINI_MODEL_THINKING   (default: gemini-3.1-pro-preview)
 *   GEMINI_MODEL_FLASH      (default: gemini-3-flash-preview)
 *   GEMINI_MODEL_PRO        (default: gemini-3-flash-preview, reasoning on)
 *   GEMINI_MODEL_ULTRA      (default: gemini-3.1-pro-preview)
 *   OPENAI_MODEL_THINKING   (default: gpt-5)
 *   OPENAI_MODEL_FLASH      (default: gpt-5-mini)
 *   OPENAI_MODEL_PRO        (default: gpt-5-mini, reasoning on)
 *   OPENAI_MODEL_ULTRA      (default: gpt-5)
 *   GEMINI_THINKING_BUDGET  (default: 0 = off for flash, -1 = dynamic otherwise)
 *   OPENAI_REASONING_EFFORT (default: medium; applied to every tier except flash)
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

    const model: ChatModel | null =
      primary && fallback ? primary.withFallbacks([fallback]) : (primary ?? fallback)

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

    const model: StructuredChatModel<T> | null =
      primary && fallback
        ? (primary.withFallbacks([fallback]) as StructuredChatModel<T>)
        : (primary ?? fallback)

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

  /** Concrete Gemini model id for a tier (env-overridable). */
  private geminiModelFor(tier: LlmTier): string {
    const c = (key: string, def: string) => this.config.get<string>(key) || def
    switch (tier) {
      case 'thinking':
        return c('GEMINI_MODEL_THINKING', 'gemini-3.1-pro-preview')
      case 'ultra':
        return c('GEMINI_MODEL_ULTRA', 'gemini-3.1-pro-preview')
      case 'pro':
        return c('GEMINI_MODEL_PRO', 'gemini-3-flash-preview')
      default:
        return c('GEMINI_MODEL_FLASH', 'gemini-3-flash-preview')
    }
  }

  /** Concrete OpenAI model id for a tier (env-overridable). */
  private openaiModelFor(tier: LlmTier): string {
    const c = (key: string, def: string) => this.config.get<string>(key) || def
    switch (tier) {
      case 'thinking':
        return c('OPENAI_MODEL_THINKING', 'gpt-5')
      case 'ultra':
        return c('OPENAI_MODEL_ULTRA', 'gpt-5')
      case 'pro':
        return c('OPENAI_MODEL_PRO', 'gpt-5-mini')
      default:
        return c('OPENAI_MODEL_FLASH', 'gpt-5-mini')
    }
  }

  private buildGemini(tier: LlmTier, options: LlmFactoryOptions): ChatGoogleGenerativeAI | null {
    const apiKey = this.config.get<string>('GEMINI_API_KEY')
    if (!apiKey) return null

    const model = options.model ?? this.geminiModelFor(tier)

    const thinkingBudgetRaw = this.config.get<string>('GEMINI_THINKING_BUDGET')
    const thinkingBudget =
      thinkingBudgetRaw !== undefined && thinkingBudgetRaw !== ''
        ? Number(thinkingBudgetRaw)
        : tier === 'flash'
          ? 0
          : -1

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

    const model = options.model ?? this.openaiModelFor(tier)

    const reasoningEffort =
      (this.config.get<string>('OPENAI_REASONING_EFFORT') as
        | 'minimal'
        | 'low'
        | 'medium'
        | 'high'
        | undefined) || 'medium'

    // GPT-5 and o-series reasoning models reject any non-default temperature
    // (only the default of 1 is allowed) and 400 otherwise. Omit it for them —
    // without this, making OpenAI the default provider would break the live
    // agent, which has no fallback in the tool-calling path.
    const supportsTemperature = !/^(gpt-5|o\d)/i.test(model)

    return new ChatOpenAI({
      apiKey,
      model,
      temperature: supportsTemperature ? (options.temperature ?? 0.3) : undefined,
      maxTokens: options.maxOutputTokens,
      reasoning: tier !== 'flash' ? { effort: reasoningEffort } : undefined,
    })
  }
}
