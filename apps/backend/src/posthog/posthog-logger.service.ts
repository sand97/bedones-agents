import { ConsoleLogger, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PostHogService } from './posthog.service'
import { getRequestContext } from './request-context'

type LogLevel = 'info' | 'warn' | 'error'

/**
 * Drop-in replacement for the default Nest logger. Keeps the usual console
 * output (via `ConsoleLogger`) AND mirrors the application's own log lines to
 * PostHog so they become searchable in the PostHog UI:
 *
 * - `error(...)` with a real `Error` → PostHog **Error tracking** (captureException)
 * - `error(...)` / `warn(...)` text lines → `backend_log` events (level tagged)
 * - `log(...)` (info) → forwarded only when POSTHOG_CAPTURE_INFO_LOGS=true
 *   (off by default to keep event volume — and cost — under control)
 *
 * Every forwarded line is enriched with the current request context (request id,
 * route, user) when available, thanks to the AsyncLocalStorage middleware.
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

    const properties: Record<string, unknown> = {
      level,
      message: text,
      logger_context: context,
      request_id: ctx?.requestId,
      path: ctx?.path,
      method: ctx?.method,
    }
    const groups = ctx?.organisationId ? { organisation: ctx.organisationId } : undefined

    // A real Error → Error tracking (richer: stack, grouping). Otherwise a plain
    // log event so it is still searchable.
    if (level === 'error' && error) {
      this.posthog.captureException(error, distinctId, properties)
      return
    }

    this.posthog.capture({ distinctId, event: 'backend_log', properties, groups })
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
