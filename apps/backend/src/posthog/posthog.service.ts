import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PostHog } from 'posthog-node'
import { initOtelLogs, shutdownOtelLogs } from './otel-logs'

export interface CaptureParams {
  distinctId: string
  event: string
  properties?: Record<string, unknown>
  /** PostHog group analytics, e.g. `{ organisation: '<id>' }`. */
  groups?: Record<string, string>
}

/**
 * Thin wrapper around the `posthog-node` client.
 *
 * - Disabled (no-op) when `POSTHOG_PROJECT_TOKEN` is not set, so local dev and
 *   CI keep working without analytics.
 * - Never throws: analytics must not break the request path.
 * - Flushes pending events on application shutdown.
 */
@Injectable()
export class PostHogService implements OnApplicationShutdown {
  private readonly logger = new Logger(PostHogService.name)
  private readonly client: PostHog | null = null
  readonly enabled: boolean

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('POSTHOG_PROJECT_TOKEN')
    const host = config.get<string>('POSTHOG_HOST') || 'https://us.i.posthog.com'

    if (!apiKey) {
      this.enabled = false
      this.logger.warn('PostHog disabled — set POSTHOG_PROJECT_TOKEN to enable analytics & logs')
      return
    }

    this.enabled = true
    this.client = new PostHog(apiKey, {
      host,
      // Batch events to limit network overhead; flushed on shutdown too.
      flushAt: 20,
      flushInterval: 10_000,
    })

    // Application logs go to the PostHog **Logs** product via OTLP (separate
    // surface from events — see otel-logs.ts). Same token & host as the events
    // client. PostHogLoggerService emits the actual records.
    initOtelLogs({
      token: apiKey,
      host,
      serviceName: config.get<string>('OTEL_SERVICE_NAME') || 'bedones-backend',
      environment: config.get<string>('NODE_ENV'),
    })

    this.logger.log(`PostHog enabled (host=${host}, logs→OTLP)`)
  }

  /** Raw client for advanced integrations (LangChain LLM observability handler). */
  getClient(): PostHog | null {
    return this.client
  }

  capture(params: CaptureParams): void {
    if (!this.client) return
    try {
      this.client.capture({
        distinctId: params.distinctId,
        event: params.event,
        properties: params.properties,
        groups: params.groups,
      })
    } catch (error) {
      this.logger.debug(`PostHog capture failed: ${String(error)}`)
    }
  }

  captureException(
    error: unknown,
    distinctId?: string,
    properties?: Record<string, unknown>,
  ): void {
    if (!this.client) return
    try {
      const err = error instanceof Error ? error : new Error(String(error))
      this.client.captureException(err, distinctId, properties)
    } catch (e) {
      this.logger.debug(`PostHog captureException failed: ${String(e)}`)
    }
  }

  async onApplicationShutdown(): Promise<void> {
    // Flush buffered OTLP logs first so a graceful shutdown doesn't drop them.
    await shutdownOtelLogs()
    if (!this.client) return
    try {
      await this.client.shutdown()
    } catch (error) {
      this.logger.debug(`PostHog shutdown failed: ${String(error)}`)
    }
  }
}
