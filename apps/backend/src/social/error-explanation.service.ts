import { Injectable, Logger } from '@nestjs/common'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { PrismaService } from '../prisma/prisma.service'
import { LlmFactoryService } from '../common/llm/llm-factory.service'
import { buildLlmTrace } from '../common/llm/llm-trace'
import type { SocialProvider } from 'generated/prisma/enums'

/**
 * Languages we generate human-friendly error explanations in. Add a tag here
 * (and to the schema/prompt below) to support a new language — nothing else
 * needs to change since the messages are stored as a free-form JSON map.
 */
export const SUPPORTED_ERROR_LANGS = ['en', 'fr'] as const
export type ErrorLang = (typeof SUPPORTED_ERROR_LANGS)[number]
export type LocalizedMessages = Record<string, string>

/**
 * Strips access tokens / bearer credentials out of a raw provider error payload
 * before we persist it, send it to the LLM, or return it to the frontend. Keeps
 * us aligned with the "never expose sensitive data" rule.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/(access_token=)[^&\s"']+/gi, '$1***')
    .replace(/("access_token"\s*:\s*")[^"]+/gi, '$1***')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1***')
    .replace(/(Access-Token['"]?\s*[:=]\s*['"]?)[A-Za-z0-9._-]+/gi, '$1***')
}

const ExplanationSchema = z.object({
  en: z
    .string()
    .describe(
      'A short, friendly explanation in ENGLISH (max 2 sentences) of what went wrong, ' +
        'written for a non-technical business owner. Must end by telling them to reconnect ' +
        'the affected resource. Never expose tokens, ids or raw error text.',
    ),
  fr: z
    .string()
    .describe(
      'La même explication courte et bienveillante en FRANÇAIS (2 phrases max), pour un ' +
        'commerçant non technique. Doit se terminer en invitant à reconnecter la ressource ' +
        'concernée. Ne jamais exposer de token, id ou message d’erreur brut.',
    ),
})

interface ExplainParams {
  provider: SocialProvider
  errorCode?: string | null
  errorTrace: string
  /** Logical resource the user must reconnect (e.g. "catalog", "page", "tiktok"). */
  resource?: string | null
}

/**
 * Turns a raw provider API error into a cached, multilingual, human-friendly
 * message bank. The first time we see a given error signature we ask a cheap
 * "flash" LLM for an explanation in every supported language and persist it;
 * every later occurrence of the same signature is served from the cache so we
 * only pay for the LLM once per distinct error class.
 */
@Injectable()
export class ErrorExplanationService {
  private readonly logger = new Logger(ErrorExplanationService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmFactory: LlmFactoryService,
  ) {}

  /**
   * Stable, readable signature used to dedupe explanations. Two errors with the
   * same provider, code and resource share one explanation.
   */
  buildSignature(provider: SocialProvider, errorCode?: string | null, resource?: string | null) {
    const code = (errorCode ?? 'unknown').toString().slice(0, 80)
    const res = (resource ?? 'account').toString().slice(0, 40)
    return `${provider}:${code}:${res}`.toLowerCase()
  }

  /** Cache-only lookup (no generation). Returns null when not warmed yet. */
  async lookup(signature: string): Promise<LocalizedMessages | null> {
    const row = await this.prisma.providerErrorMessage.findUnique({ where: { signature } })
    return (row?.messages as LocalizedMessages | undefined) ?? null
  }

  /**
   * Returns the localized messages for an error, generating + caching them on a
   * miss. Always safe: returns null instead of throwing when the LLM is
   * unavailable so callers can fall back to a generic message.
   */
  async getOrCreate(params: ExplainParams): Promise<LocalizedMessages | null> {
    const signature = this.buildSignature(params.provider, params.errorCode, params.resource)

    const cached = await this.lookup(signature)
    if (cached) return cached

    const messages = await this.generate(params)
    if (!messages) return null

    try {
      await this.prisma.providerErrorMessage.upsert({
        where: { signature },
        create: {
          signature,
          provider: params.provider,
          errorCode: params.errorCode ?? null,
          resource: params.resource ?? null,
          messages,
        },
        update: { messages },
      })
    } catch (error) {
      // A concurrent writer may have inserted the same signature; ignore.
      this.logger.warn(`Failed to persist error explanation for ${signature}: ${String(error)}`)
    }

    return messages
  }

  private async generate(params: ExplainParams): Promise<LocalizedMessages | null> {
    try {
      const model = this.llmFactory.createStructuredChatModel('flash', ExplanationSchema, {
        temperature: 0.2,
        maxOutputTokens: 400,
        trace: buildLlmTrace({ feature: 'error-explanation', provider: params.provider }),
      })

      const system =
        'You translate raw social-media API errors (Facebook, Instagram, WhatsApp, TikTok) ' +
        'into short, reassuring explanations for non-technical shop owners. ' +
        'Do not mention HTTP codes, access tokens, ids or stack traces. ' +
        'Explain the likely cause in plain words and ALWAYS finish by inviting the user to ' +
        'reconnect the affected resource so we can restore the service.'

      const human =
        `Provider: ${params.provider}\n` +
        `Resource to reconnect: ${params.resource ?? 'account'}\n` +
        `Error code: ${params.errorCode ?? 'unknown'}\n` +
        `Raw error: ${redactSecrets(params.errorTrace).slice(0, 1500)}`

      const result = await model.invoke([new SystemMessage(system), new HumanMessage(human)])
      if (!result?.en || !result?.fr) return null
      return { en: result.en, fr: result.fr }
    } catch (error) {
      this.logger.warn(`Error explanation generation failed: ${String(error)}`)
      return null
    }
  }
}
