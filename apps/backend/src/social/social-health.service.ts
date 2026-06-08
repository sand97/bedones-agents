import { ForbiddenException, Injectable, Logger } from '@nestjs/common'
import { HttpException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ErrorExplanationService, redactSecrets } from './error-explanation.service'
import { REQUIRED_SCOPES } from './required-scopes.config'
import type { SocialFeature, SocialProvider } from 'generated/prisma/enums'

/**
 * Number of consecutive outbound failures tolerated on an account before we
 * trip the circuit breaker and stop sending. Incoming webhooks keep flowing.
 */
export const MAX_CONSECUTIVE_ERRORS = 5

/** Minimal shape needed to gate an outbound call without an extra DB read. */
export interface OutboundGateAccount {
  id: string
  provider: SocialProvider
  disabled: boolean
  featureDisabled: SocialFeature[]
}

/**
 * Thrown when an outbound call is attempted on an account that has been
 * disabled (or whose feature has been disabled). Surfaced to the frontend as a
 * 403 with a stable `code` so the UI can prompt the user to reconnect.
 */
export class SocialAccountDisabledException extends ForbiddenException {
  constructor(reason: string, feature?: SocialFeature) {
    super({
      statusCode: 403,
      error: 'SocialAccountDisabled',
      code: 'social_account_disabled',
      reason,
      feature: feature ?? null,
      message:
        'This account is temporarily disabled after repeated errors or missing permissions. ' +
        'Please reconnect it to restore the service.',
    })
  }
}

interface RecordErrorParams {
  socialAccountId: string
  provider: SocialProvider
  /** Service method that failed, e.g. "sendMessage" / "findProducts". */
  operation?: string
  /** Outbound capability the call belongs to. */
  feature?: SocialFeature
  /** Logical resource the user must reconnect (e.g. "page", "catalog"). */
  resource?: string
  error: unknown
  /**
   * When set, disables this feature immediately regardless of the error count
   * (used for the TikTok "no longer a business account" case).
   */
  forceDisableFeature?: SocialFeature
}

@Injectable()
export class SocialHealthService {
  private readonly logger = new Logger(SocialHealthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly errorExplanation: ErrorExplanationService,
  ) {}

  // ─── Outbound gating ───

  /**
   * Throws if the account (or the specific feature) is disabled. Cheap, in-memory
   * check for callers that already loaded the account. Never blocks incoming
   * webhook processing — only outbound calls go through here.
   */
  ensureOutboundAllowed(account: OutboundGateAccount, feature?: SocialFeature): void {
    if (account.disabled) {
      throw new SocialAccountDisabledException('account_disabled', feature)
    }
    if (feature && account.featureDisabled.includes(feature)) {
      throw new SocialAccountDisabledException('feature_disabled', feature)
    }
  }

  /** DB-backed variant for callers that don't already hold the account. */
  async assertOutboundAllowed(socialAccountId: string, feature?: SocialFeature): Promise<void> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: { id: true, provider: true, disabled: true, featureDisabled: true },
    })
    if (!account) return
    this.ensureOutboundAllowed(account, feature)
  }

  /**
   * Runs an outbound provider call through the circuit breaker: refuses when
   * disabled, resets the error counter on success, and records the failure
   * (tripping the breaker past the threshold) on error.
   */
  async wrapOutbound<T>(
    account: OutboundGateAccount,
    ctx: { operation: string; feature?: SocialFeature; resource?: string },
    fn: () => Promise<T>,
  ): Promise<T> {
    this.ensureOutboundAllowed(account, ctx.feature)
    try {
      const result = await fn()
      await this.recordSuccess(account.id)
      return result
    } catch (error) {
      await this.recordError({
        socialAccountId: account.id,
        provider: account.provider,
        error,
        ...ctx,
      })
      throw error
    }
  }

  // ─── Error accounting ───

  /** Resets the consecutive-error counter after a successful outbound call. */
  async recordSuccess(socialAccountId: string): Promise<void> {
    try {
      await this.prisma.socialAccount.updateMany({
        where: { id: socialAccountId, consecutiveErrors: { gt: 0 } },
        data: { consecutiveErrors: 0 },
      })
    } catch (error) {
      this.logger.warn(`recordSuccess failed for ${socialAccountId}: ${String(error)}`)
    }
  }

  /**
   * Logs an outbound failure, increments the counter and trips the breaker once
   * it crosses {@link MAX_CONSECUTIVE_ERRORS}. Safe to call from catch blocks:
   * it never throws.
   */
  async recordError(params: RecordErrorParams): Promise<void> {
    const { socialAccountId, provider, operation, feature, resource, forceDisableFeature } = params
    const { code, trace } = this.parseError(params.error)

    try {
      await this.prisma.socialAccountErrorLog.create({
        data: {
          socialAccountId,
          provider,
          feature: feature ?? null,
          operation: operation ?? null,
          resource: resource ?? null,
          errorCode: code,
          errorTrace: trace,
        },
      })

      const updated = await this.prisma.socialAccount.update({
        where: { id: socialAccountId },
        data: { consecutiveErrors: { increment: 1 } },
        select: { consecutiveErrors: true, disabled: true, featureDisabled: true },
      })

      // Immediate, feature-granular disable (e.g. TikTok lost business status).
      if (forceDisableFeature && !updated.featureDisabled.includes(forceDisableFeature)) {
        await this.prisma.socialAccount.update({
          where: { id: socialAccountId },
          data: {
            featureDisabled: { set: [...updated.featureDisabled, forceDisableFeature] },
            disabledReason: `feature_error:${forceDisableFeature.toLowerCase()}`,
          },
        })
      }

      // Trip the whole-account breaker past the threshold.
      if (!updated.disabled && updated.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        await this.prisma.socialAccount.update({
          where: { id: socialAccountId },
          data: {
            disabled: true,
            disabledAt: new Date(),
            disabledReason: `too_many_errors:${code ?? 'unknown'}`,
          },
        })
        this.logger.warn(
          `[${provider}] Account ${socialAccountId} disabled after ` +
            `${updated.consecutiveErrors} consecutive errors (last: ${code ?? 'unknown'})`,
        )
      }

      // Warm the human-friendly, multilingual explanation bank (fire & forget).
      void this.errorExplanation
        .getOrCreate({ provider, errorCode: code, errorTrace: trace, resource })
        .catch(() => undefined)
    } catch (error) {
      this.logger.error(`recordError failed for ${socialAccountId}: ${String(error)}`)
    }
  }

  /**
   * Records an outbound failure for visibility (error log) and warms the
   * explanation bank, WITHOUT incrementing the consecutive-error counter or
   * tripping the breaker. Use for user-triggered reads (catalog listing,
   * provider posts) where React Query retries would otherwise disable the
   * account on a single failed page load.
   */
  async logError(params: Omit<RecordErrorParams, 'forceDisableFeature'>): Promise<void> {
    const { socialAccountId, provider, operation, feature, resource } = params
    const { code, trace } = this.parseError(params.error)
    try {
      await this.prisma.socialAccountErrorLog.create({
        data: {
          socialAccountId,
          provider,
          feature: feature ?? null,
          operation: operation ?? null,
          resource: resource ?? null,
          errorCode: code,
          errorTrace: trace,
        },
      })
      void this.errorExplanation
        .getOrCreate({ provider, errorCode: code, errorTrace: trace, resource })
        .catch(() => undefined)
    } catch (error) {
      this.logger.error(`logError failed for ${socialAccountId}: ${String(error)}`)
    }
  }

  // ─── Granular / explicit disabling ───

  /** Disables a single feature immediately (TikTok non-business, manual ops). */
  async disableFeature(
    socialAccountId: string,
    feature: SocialFeature,
    reason: string,
  ): Promise<void> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: { featureDisabled: true },
    })
    if (!account || account.featureDisabled.includes(feature)) return

    await this.prisma.socialAccount.update({
      where: { id: socialAccountId },
      data: {
        featureDisabled: { set: [...account.featureDisabled, feature] },
        disabledReason: reason,
      },
    })
    this.logger.warn(`[${feature}] disabled on account ${socialAccountId}: ${reason}`)
  }

  // ─── Scope verification ───

  /**
   * Compares the scopes actually granted by the provider against what each
   * intended feature needs, and disables the features whose permissions are
   * incomplete. Called from every connect flow so a reconnect with the full set
   * automatically re-enables the feature.
   *
   * @returns the list of features left disabled because of missing scopes.
   */
  async syncScopeHealth(args: {
    socialAccountId: string
    provider: SocialProvider
    grantedScopes: string[]
    intendedFeatures: SocialFeature[]
  }): Promise<{ disabledFeatures: SocialFeature[]; missingScopes: string[] }> {
    const required = REQUIRED_SCOPES[args.provider] ?? {}
    const granted = new Set(args.grantedScopes)

    const disabledFeatures: SocialFeature[] = []
    const missingScopes = new Set<string>()

    for (const feature of args.intendedFeatures) {
      const needed = required[feature] ?? []
      const missing = needed.filter((scope) => !granted.has(scope))
      if (missing.length > 0) {
        disabledFeatures.push(feature)
        missing.forEach((scope) => missingScopes.add(scope))
      }
    }

    if (disabledFeatures.length === 0) return { disabledFeatures: [], missingScopes: [] }

    await this.prisma.socialAccount.update({
      where: { id: args.socialAccountId },
      data: {
        featureDisabled: { set: disabledFeatures },
        disabledReason: `missing_scopes:${[...missingScopes].join(',')}`,
      },
    })
    this.logger.warn(
      `[${args.provider}] Account ${args.socialAccountId} missing scopes ` +
        `${[...missingScopes].join(', ')} — disabled features: ${disabledFeatures.join(', ')}`,
    )

    return { disabledFeatures, missingScopes: [...missingScopes] }
  }

  /**
   * Clears all health state on a successful (re)connect: re-enables the account
   * and every feature, resets the error counter, and revives a user-initiated
   * soft disconnect. Scope checks run afterwards may disable individual features
   * again.
   */
  async clearHealth(socialAccountId: string): Promise<void> {
    await this.prisma.socialAccount.update({
      where: { id: socialAccountId },
      data: {
        disabled: false,
        disabledReason: null,
        disabledAt: null,
        consecutiveErrors: 0,
        featureDisabled: { set: [] },
        disconnectedAt: null,
      },
    })
  }

  // ─── Helpers ───

  /**
   * Extracts a stable error code and a bounded raw trace from anything thrown by
   * the provider calls (NestJS HttpException, Error, plain string, Meta/TikTok
   * JSON payloads).
   */
  private parseError(error: unknown): { code: string | null; trace: string } {
    let trace: string
    let httpStatus: number | null = null

    if (error instanceof HttpException) {
      httpStatus = error.getStatus()
      const response = error.getResponse()
      if (typeof response === 'string') {
        trace = response
      } else if (response && typeof response === 'object' && 'message' in response) {
        // Prefer the human message (single-escaped provider payload) so the
        // code regex below can read Meta/TikTok codes; fall back to the object.
        const message = (response as { message?: unknown }).message
        trace = typeof message === 'string' ? message : JSON.stringify(response)
      } else {
        trace = JSON.stringify(response)
      }
    } else if (error instanceof Error) {
      trace = error.stack || error.message
    } else if (typeof error === 'string') {
      trace = error
    } else {
      try {
        trace = JSON.stringify(error)
      } catch {
        trace = String(error)
      }
    }

    const code = this.extractCode(trace, httpStatus)
    return { code, trace: redactSecrets(trace).slice(0, 4000) }
  }

  /** Prefers a provider-specific error code, falling back to the HTTP status. */
  private extractCode(trace: string, httpStatus: number | null): string | null {
    // Meta OAuthException / Graph error code, e.g. {"error":{"code":190,...}}
    const metaCode = trace.match(/"code"\s*:\s*(\d+)/)
    const metaSubcode = trace.match(/"error_subcode"\s*:\s*(\d+)/)
    if (metaCode) {
      return metaSubcode ? `${metaCode[1]}/${metaSubcode[1]}` : metaCode[1]
    }
    const oauthType = trace.match(/"type"\s*:\s*"([A-Za-z]+Exception)"/)
    if (oauthType) return oauthType[1]
    if (httpStatus) return String(httpStatus)
    return null
  }
}
