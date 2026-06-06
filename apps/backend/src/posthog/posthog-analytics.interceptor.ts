import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import type { Request, Response } from 'express'
import { Observable, tap } from 'rxjs'
import { PostHogService } from './posthog.service'
import { getRequestContext } from './request-context'

/** Exact paths we never want to track (UI, transport, discovery, health). */
const SKIP_EXACT = new Set(['/', '/favicon.ico', '/health', '/mcp', '/sse', '/messages'])
/** Path prefixes we never want to track. */
const SKIP_PREFIX = ['/swagger', '/.well-known', '/assets']

/**
 * Global HTTP interceptor that turns every incoming request into a searchable
 * PostHog event:
 *
 * - `/webhooks/*` (and other webhook callbacks) → `webhook_received` with the
 *   provider and a PII-free structural summary of the payload.
 * - everything else → `api_request` with route, status and latency.
 *
 * Thrown errors are additionally sent to PostHog Error tracking. It also writes
 * the authenticated user id back into the request context so later log lines in
 * the same request are attributed to that user.
 */
@Injectable()
export class PostHogAnalyticsInterceptor implements NestInterceptor {
  constructor(private readonly posthog: PostHogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http' || !this.posthog.enabled) {
      return next.handle()
    }

    const http = context.switchToHttp()
    const req = http.getRequest<Request>()
    const res = http.getResponse<Response>()

    if (this.shouldSkip(req)) {
      return next.handle()
    }

    const startedAt = Date.now()

    return next.handle().pipe(
      tap({
        next: () => this.record(req, res, startedAt, null),
        error: (err: unknown) => this.record(req, res, startedAt, err),
      }),
    )
  }

  private shouldSkip(req: Request): boolean {
    if (req.method === 'OPTIONS') return true
    const path = req.path
    if (SKIP_EXACT.has(path)) return true
    return SKIP_PREFIX.some((prefix) => path.startsWith(prefix))
  }

  private record(req: Request, res: Response, startedAt: number, error: unknown): void {
    const ctx = getRequestContext()
    const userId = (req as Request & { user?: { id?: string } }).user?.id
    const organisationId =
      (req.params?.organisationId as string | undefined) ||
      (req.params?.orgId as string | undefined)

    // Enrich the shared context so log lines later in this request are attributed.
    if (ctx) {
      if (userId) ctx.userId = userId
      if (organisationId) ctx.organisationId = organisationId
    }

    const distinctId = userId || 'anonymous'
    const route = this.routePattern(req)
    const properties: Record<string, unknown> = {
      method: req.method,
      path: req.path,
      route,
      status: res.statusCode,
      duration_ms: Date.now() - startedAt,
      request_id: ctx?.requestId,
      errored: error != null,
    }
    const groups = organisationId ? { organisation: organisationId } : undefined

    if (isWebhookPath(req.path)) {
      this.posthog.capture({
        distinctId: 'webhook-ingest',
        event: 'webhook_received',
        properties: {
          ...properties,
          provider: webhookProvider(req.path),
          ...summarizeWebhookPayload(req.body),
        },
      })
    } else {
      this.posthog.capture({ distinctId, event: 'api_request', properties, groups })
    }

    if (error) {
      this.posthog.captureException(error, distinctId, properties)
    }
  }

  private routePattern(req: Request): string {
    const route = (req as Request & { route?: { path?: string } }).route?.path
    return route ? `${req.baseUrl || ''}${route}` : req.path
  }
}

function isWebhookPath(path: string): boolean {
  return (
    path.startsWith('/webhooks') ||
    path.startsWith('/catalog-migration') ||
    path.includes('webhook')
  )
}

function webhookProvider(path: string): string {
  const match = path.match(/^\/webhooks\/([^/?]+)/)
  if (match) return match[1]
  if (path.startsWith('/catalog-migration')) return 'catalog-migration'
  if (path.includes('webhook')) return 'catalog'
  return 'unknown'
}

/**
 * Lightweight, PII-free summary of a Meta-style webhook payload:
 * object type, number of entries and the field/event types involved — never
 * the message bodies (those stay in the application logs).
 */
function summarizeWebhookPayload(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') return {}
  const payload = body as Record<string, unknown>
  const summary: Record<string, unknown> = {}

  if (typeof payload.object === 'string') summary.object = payload.object

  if (Array.isArray(payload.entry)) {
    summary.entry_count = payload.entry.length
    const fields = new Set<string>()
    for (const entry of payload.entry as Array<Record<string, unknown>>) {
      if (Array.isArray(entry?.changes)) {
        for (const change of entry.changes as Array<Record<string, unknown>>) {
          if (typeof change?.field === 'string') fields.add(change.field)
        }
      }
      if (Array.isArray(entry?.messaging)) fields.add('messaging')
      if (Array.isArray(entry?.standby)) fields.add('standby')
    }
    if (fields.size > 0) summary.fields = Array.from(fields)
  }

  return summary
}
