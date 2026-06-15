import { type Logger as OtelLogger, SeverityNumber } from '@opentelemetry/api-logs'
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'

/**
 * OpenTelemetry → PostHog **Logs** pipeline.
 *
 * PostHog has two distinct surfaces and they are NOT interchangeable:
 *  - **Events** (`posthog.capture(...)`) → the product-analytics / SQL surface.
 *  - **Logs** (this file) → the dedicated *Logs* product, fed ONLY by the
 *    OpenTelemetry OTLP endpoint `…/i/v1/logs`. Custom events never show up here.
 *
 * We export every backend log line as an OTLP log record so it is searchable in
 * PostHog → Logs, filterable by `severity_text`, by `service.name`, and — the
 * point of this integration — by the log attributes we stamp on each record
 * (`conversation_id`, `contact_id`, `social_account_id`, `organisation_id`,
 * `provider`, `request_id`, `source`…) so a single conversation can be pinpointed
 * by cross-referencing any of them.
 *
 * Logs-only setup on purpose: we wire a `LoggerProvider` directly instead of the
 * full `NodeSDK`, so we get nothing but log export — no trace/metric
 * auto-instrumentation that could interfere with the NestJS/Express app.
 */

let provider: LoggerProvider | null = null
let appLogger: OtelLogger | null = null

export interface OtelLogsOptions {
  /** PostHog project token (`phc_…`) — same value as `POSTHOG_PROJECT_TOKEN`. */
  token: string
  /** PostHog ingestion host, e.g. `https://us.i.posthog.com`. */
  host: string
  /** `service.name` resource attribute — how the backend shows up in Logs. */
  serviceName: string
  /** Optional `deployment.environment` resource attribute. */
  environment?: string
}

/**
 * Initialise the OTLP log exporter. Idempotent and never throws: logging must
 * never break the app. No-op when already initialised.
 */
export function initOtelLogs(opts: OtelLogsOptions): void {
  if (provider) return

  const base = opts.host.replace(/\/+$/, '')
  const exporter = new OTLPLogExporter({
    // PostHog authenticates the OTLP logs endpoint with the project token passed
    // as a query parameter (see PostHog → Logs onboarding).
    url: `${base}/i/v1/logs?token=${encodeURIComponent(opts.token)}`,
  })

  provider = new LoggerProvider({
    resource: resourceFromAttributes({
      'service.name': opts.serviceName,
      ...(opts.environment ? { 'deployment.environment': opts.environment } : {}),
    }),
    processors: [new BatchLogRecordProcessor(exporter)],
  })
  appLogger = provider.getLogger('bedones-backend')
}

/** The shared OTLP logger, or `null` when logs export is disabled. */
export function getOtelLogger(): OtelLogger | null {
  return appLogger
}

/** Flush and tear down the exporter on shutdown. Never throws. */
export async function shutdownOtelLogs(): Promise<void> {
  if (!provider) return
  try {
    await provider.shutdown()
  } catch {
    // Swallow — shutdown best-effort, never block process exit on telemetry.
  }
  provider = null
  appLogger = null
}

/** Map our log levels to the OpenTelemetry severity scale. */
export function toSeverityNumber(level: 'info' | 'warn' | 'error'): SeverityNumber {
  switch (level) {
    case 'error':
      return SeverityNumber.ERROR
    case 'warn':
      return SeverityNumber.WARN
    default:
      return SeverityNumber.INFO
  }
}
