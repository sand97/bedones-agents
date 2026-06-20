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
 * LLM providers the platform can talk to. `xiaomi` is Xiaomi's MiMo API, which
 * is OpenAI-compatible (we reach it through ChatOpenAI + a custom baseURL).
 * The chosen primary provider runs first and the others act as automatic
 * fallbacks, so any one can be the default without a code change.
 */
export type LlmProvider = 'gemini' | 'openai' | 'xiaomi'
export const LLM_PROVIDERS: readonly LlmProvider[] = ['gemini', 'openai', 'xiaomi'] as const

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
  /** Force a specific provider. Default: LLM_DEFAULT_PROVIDER (Gemini unless overridden). */
  provider?: LlmProvider
  /** Override the model id. Default: the tier's env default. */
  model?: string
  /** Enable PostHog LLM observability for calls made with the returned model. */
  trace?: LlmTraceContext
}

export type ChatModel = Runnable<BaseLanguageModelInput, AIMessageChunk>
export type StructuredChatModel<T> = Runnable<BaseLanguageModelInput, T>

/**
 * Builds a chat model with one provider as primary and the others as automatic
 * fallbacks. Gemini is primary by default; set LLM_DEFAULT_PROVIDER to `openai`
 * (ChatGPT) or `xiaomi` (Xiaomi MiMo) to switch the whole platform — the live
 * agent included — without a code change.
 *
 * Tiers:
 * - `thinking`: most capable reasoning model with extended thinking — internal,
 *   for agent context processing (onboarding, catalog analysis).
 * - `flash`: fast/cheap, the default for live response generation.
 * - `pro`: flash-class model with reasoning enabled — a "smarter flash".
 * - `ultra`: the most capable model (≈ thinking) for live responses.
 *
 * Env vars (with stable defaults):
 *   LLM_DEFAULT_PROVIDER    (default: gemini; "openai" or "xiaomi" to switch primary)
 *   GEMINI_API_KEY, OPENAI_API_KEY (legacy: OPENIA_API_KEY), XIAOMI_API_KEY
 *   XIAOMI_BASE_URL         (OpenAI-compatible MiMo endpoint, default below)
 *   GEMINI_MODEL_THINKING   (default: gemini-3.1-pro-preview)
 *   GEMINI_MODEL_FLASH      (default: gemini-3-flash-preview)
 *   GEMINI_MODEL_PRO        (default: gemini-3-flash-preview, reasoning on)
 *   GEMINI_MODEL_ULTRA      (default: gemini-3.1-pro-preview)
 *   OPENAI_MODEL_THINKING   (default: gpt-5)
 *   OPENAI_MODEL_FLASH      (default: gpt-5-mini)
 *   OPENAI_MODEL_PRO        (default: gpt-5-mini, reasoning on)
 *   OPENAI_MODEL_ULTRA      (default: gpt-5)
 *   XIAOMI_MODEL_THINKING   (default: mimo-v2.5-pro)
 *   XIAOMI_MODEL_FLASH      (default: mimo-v2.5)
 *   XIAOMI_MODEL_PRO        (default: mimo-v2.5-pro)
 *   XIAOMI_MODEL_ULTRA      (default: mimo-v2.5-pro)
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
    const built = this.orderedProviders(options.provider)
      .map((p) => this.buildProvider(p, tier, options))
      .filter((m): m is ChatGoogleGenerativeAI | ChatOpenAI => m !== null)

    const [primary, ...fallbacks] = built
    const model: ChatModel | null = primary
      ? fallbacks.length
        ? primary.withFallbacks(fallbacks)
        : primary
      : null

    if (!model) throw this.noProviderError()

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
    const structured = this.orderedProviders(options.provider)
      .map((p) => this.buildProvider(p, tier, options))
      .filter((m): m is ChatGoogleGenerativeAI | ChatOpenAI => m !== null)
      .map((m) => m.withStructuredOutput(schema) as StructuredChatModel<T>)

    const [primary, ...fallbacks] = structured
    const model: StructuredChatModel<T> | null = primary
      ? fallbacks.length
        ? (primary.withFallbacks(fallbacks) as StructuredChatModel<T>)
        : primary
      : null

    if (!model) throw this.noProviderError()

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
    // Cap the output window for the live agent. Without a cap the provider falls
    // back to its model maximum (~65k tokens for gemini-3-flash), so a single
    // degenerate/looping generation can bill tens of thousands of tokens in one
    // turn (observed in PostHog: 65k completion tokens ≈ $0.20 on a turn that
    // should cost ~$0.003). A caller-supplied limit still wins.
    const capped: LlmFactoryOptions = {
      ...options,
      maxOutputTokens: options.maxOutputTokens ?? this.liveAgentMaxOutputTokens(tier),
    }

    // First provider with a configured key wins, preferring the forced/default
    // one. The live agent has no fallback chain here, so a single concrete model
    // is returned (bindTools must stay reachable).
    let model: ChatGoogleGenerativeAI | ChatOpenAI | null = null
    for (const provider of this.orderedProviders(capped.provider)) {
      model = this.buildProvider(provider, tier, capped)
      if (model) break
    }

    if (!model) throw this.noProviderError()
    return model
  }

  /**
   * Output-token ceiling for the live agent's tool-calling model, per tier.
   *
   * Without a cap the provider falls back to its model maximum (~65k tokens for
   * gemini-3-flash), so one degenerate/looping generation can bill tens of
   * thousands of tokens for a single turn (observed: 65k completion tokens ≈
   * $0.20 on a turn that otherwise costs ~$0.003). A customer reply is short, so
   * flash needs little; the thinking-enabled tiers (pro/ultra) get more headroom
   * because their reasoning tokens count against this same budget.
   *
   * Env-overridable, mirroring AGENT_HISTORY_LIMIT:
   *   AGENT_MAX_OUTPUT_TOKENS                   (global default for every tier)
   *   AGENT_MAX_OUTPUT_TOKENS_FLASH|PRO|ULTRA   (per-tier override)
   * A non-numeric / non-positive value is ignored and the default applies.
   */
  private liveAgentMaxOutputTokens(tier: LlmTier): number {
    const TIER_DEFAULTS: Record<LlmTier, number> = {
      flash: 2048,
      pro: 8192,
      ultra: 16384,
      thinking: 16384,
    }
    const parse = (raw: unknown): number | null => {
      const n = Number(raw)
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : null
    }
    const perTier = parse(this.config.get(`AGENT_MAX_OUTPUT_TOKENS_${tier.toUpperCase()}`))
    const globalCap = parse(this.config.get('AGENT_MAX_OUTPUT_TOKENS'))
    return perTier ?? globalCap ?? TIER_DEFAULTS[tier]
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
   * `LLM_DEFAULT_PROVIDER` (`gemini` | `openai` | `xiaomi`); defaults to Gemini.
   * Lets ops flip the whole platform (the live agent included) between providers
   * without a code change.
   */
  private defaultProvider(): LlmProvider {
    const raw = this.config.get<string>('LLM_DEFAULT_PROVIDER')?.trim().toLowerCase()
    return (LLM_PROVIDERS as readonly string[]).includes(raw ?? '')
      ? (raw as LlmProvider)
      : 'gemini'
  }

  /**
   * Providers ordered primary-first: the forced one (or the env default) leads,
   * the rest follow as fallbacks in their declared order. Drives both the
   * fallback chains and the single-model tool-calling path.
   */
  private orderedProviders(forced?: LlmProvider): LlmProvider[] {
    const primary = forced ?? this.defaultProvider()
    return [primary, ...LLM_PROVIDERS.filter((p) => p !== primary)]
  }

  /** Builds the concrete chat model for a provider, or null if no key is set. */
  private buildProvider(
    provider: LlmProvider,
    tier: LlmTier,
    options: LlmFactoryOptions,
  ): ChatGoogleGenerativeAI | ChatOpenAI | null {
    switch (provider) {
      case 'openai':
        return this.buildOpenAI(tier, options)
      case 'xiaomi':
        return this.buildXiaomi(tier, options)
      default:
        return this.buildGemini(tier, options)
    }
  }

  private noProviderError(): Error {
    return new Error(
      'No LLM API key configured. Set GEMINI_API_KEY, OPENAI_API_KEY and/or XIAOMI_API_KEY in your env.',
    )
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

  /** Concrete Xiaomi MiMo model id for a tier (env-overridable). */
  private xiaomiModelFor(tier: LlmTier): string {
    const c = (key: string, def: string) => this.config.get<string>(key) || def
    switch (tier) {
      case 'thinking':
        return c('XIAOMI_MODEL_THINKING', 'mimo-v2.5-pro')
      case 'ultra':
        return c('XIAOMI_MODEL_ULTRA', 'mimo-v2.5-pro')
      case 'pro':
        return c('XIAOMI_MODEL_PRO', 'mimo-v2.5-pro')
      default:
        return c('XIAOMI_MODEL_FLASH', 'mimo-v2.5')
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

  /**
   * Xiaomi MiMo. The MiMo API is OpenAI-compatible, so we reuse ChatOpenAI and
   * just point it at the MiMo endpoint via `XIAOMI_BASE_URL`. We deliberately do
   * NOT send OpenAI's `reasoning` param (it's provider-specific and a non-OpenAI
   * endpoint may reject it); temperature/maxTokens are standard and kept.
   */
  private buildXiaomi(tier: LlmTier, options: LlmFactoryOptions): ChatOpenAI | null {
    const apiKey = this.config.get<string>('XIAOMI_API_KEY')
    if (!apiKey) return null

    const baseURL =
      this.config.get<string>('XIAOMI_BASE_URL')?.trim() || 'https://api.mimo.xiaomi.com/v1'

    const model = options.model ?? this.xiaomiModelFor(tier)

    return new ChatOpenAI({
      apiKey,
      model,
      temperature: options.temperature ?? 0.3,
      maxTokens: options.maxOutputTokens,
      configuration: { baseURL },
    })
  }
}
