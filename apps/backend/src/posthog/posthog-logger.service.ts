import { ConsoleLogger, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { LogAttributes } from '@opentelemetry/api-logs'
import { PostHogService } from './posthog.service'
import { getRequestContext } from './request-context'
import { getOtelLogger, toSeverityNumber } from './otel-logs'

type LogLevel = 'info' | 'warn' | 'error'

/**
 * Drop-in replacement for the default Nest logger. Keeps the usual console
 * output (via `ConsoleLogger`) AND mirrors the application's own log lines to
 * PostHog's **Logs** product via OpenTelemetry/OTLP (see `otel-logs.ts`), so
 * they become searchable in PostHog → Logs:
 *
 * - `error(...)` with a real `Error` → PostHog **Error tracking** (captureException)
 *   AND an `error` log line.
 * - `error(...)` / `warn(...)` text lines → OTLP log records (severity tagged).
 * - `log(...)` (info) → forwarded only when POSTHOG_CAPTURE_INFO_LOGS=true
 *   (off by default to keep log volume — and cost — under control).
 *
 * Every forwarded line is enriched with the current execution context (request
 * id, route, and conversation/contact/social-account/org/provider when known) as
 * log attributes, thanks to the AsyncLocalStorage context (`request-context.ts`).
 */
@Injectable()
export class PostHogLoggerService extends ConsoleLogger {
  private readonly captureInfoLogs: boolean

  constructor(
    private readonly posthog: PostHogService,
    config: ConfigService,
  ) {
    super()
    this.captureInfoLogs = config.get<string>('POSTHOG_CAPTURE_INFO_LOGS') === 'true'
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    super.log(message as string, ...(optionalParams as string[]))
    if (this.captureInfoLogs) this.forward('info', message, optionalParams)
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    super.warn(message as string, ...(optionalParams as string[]))
    this.forward('warn', message, optionalParams)
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    super.error(message as string, ...(optionalParams as string[]))
    this.forward('error', message, optionalParams)
  }

  private forward(level: LogLevel, message: unknown, optionalParams: unknown[]): void {
    if (!this.posthog.enabled) return

    const { context, error } = this.dissect(optionalParams)
    const ctx = getRequestContext()
    const distinctId = ctx?.userId || 'backend-server'
    const text = typeof message === 'string' ? message : safeStringify(message)

    // Searchable log attributes in PostHog → Logs. These are what let you pinpoint
    // a single conversation by cross-referencing org / contact / social account /
    // provider, and tell webhook-ingestion logs apart from agent-run logs (`source`).
    // `put` skips empty values so we never ship undefined/null attributes.
    const attributes: LogAttributes = {}
    const put = (key: string, value: unknown): void => {
      if (value !== undefined && value !== null && value !== '') attributes[key] = value as never
    }
    put('logger_context', context)
    put('request_id', ctx?.requestId)
    put('path', ctx?.path)
    put('method', ctx?.method)
    put('conversation_id', ctx?.conversationId)
    put('contact_id', ctx?.contactId)
    put('social_account_id', ctx?.socialAccountId)
    put('organisation_id', ctx?.organisationId)
    put('provider', ctx?.provider)
    put('source', ctx?.source)

    // A real Error → Error tracking (richer: stack, grouping). The line still goes
    // to Logs below so it also appears in the conversation timeline.
    if (level === 'error' && error) {
      this.posthog.captureException(error, distinctId, { level, message: text, ...attributes })
    }

    // → PostHog **Logs** product, via OTLP (see otel-logs.ts). This is the
    // searchable-by-conversation surface; `capture()` would land in Events instead.
    getOtelLogger()?.emit({
      severityNumber: toSeverityNumber(level),
      severityText: level,
      body: text,
      attributes,
    })
  }

  /** Extract the Nest "context" (last string param) and any Error from the params. */
  private dissect(optionalParams: unknown[]): { context?: string; error?: Error } {
    let context: string | undefined
    let error: Error | undefined

    for (const param of optionalParams) {
      if (param instanceof Error) {
        error = param
      } else if (typeof param === 'string') {
        // Multiline / spaced strings are stack traces; single tokens are the context.
        if (param.includes('\n') || /\s/.test(param.trim())) {
          if (!error) error = new Error(param)
        } else {
          context = param
        }
      }
    }

    return { context, error }
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
