import { Injectable } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { PostHogService } from './posthog.service'
import { getRequestContext } from './request-context'

/** Exact paths we never track (UI, transport, discovery, health). */
const SKIP_EXACT = new Set([
  '/',
  '/favicon.ico',
  '/favicon.svg',
  '/health',
  '/mcp',
  '/sse',
  '/messages',
])
/** Path prefixes we never track. */
const SKIP_PREFIX = ['/swagger', '/.well-known', '/assets']

/**
 * Turns every HTTP response into a searchable PostHog event via `res.on('finish')`.
 *
 * A middleware (not a Nest interceptor) is used on purpose: interceptors run
 * *after* guards, so auth-rejected requests (401/403) would never be tracked.
 * `res.on('finish')` fires for every response — guard rejections, 404s, handler
 * errors included — giving complete API coverage.
 *
 * - `/webhooks/*` (and other webhook callbacks) → `webhook_received` with the
 *   provider and a PII-free structural summary of the payload.
 * - everything else → `api_request` with route, status and latency.
 */
@Injectable()
export class PostHogHttpMiddleware {
  constructor(private readonly posthog: PostHogService) {}

  /** Bound so it can be registered directly with `app.use(...)` in main.ts. */
  handle = (req: Request, res: Response, next: NextFunction): void => {
    if (!this.posthog.enabled || shouldSkip(req)) {
      next()
      return
    }

    const startedAt = Date.now()
    res.once('finish', () => this.record(req, res, startedAt))
    next()
  }

  private record(req: Request, res: Response, startedAt: number): void {
    const ctx = getRequestContext()
    const userId = (req as Request & { user?: { id?: string } }).user?.id
    const organisationId =
      (req.params?.organisationId as string | undefined) ||
      (req.params?.orgId as string | undefined)

    // Make the user/org available to any log line still tied to this request.
    if (ctx) {
      if (userId) ctx.userId = userId
      if (organisationId) ctx.organisationId = organisationId
    }

    const status = res.statusCode
    const properties: Record<string, unknown> = {
      method: req.method,
      path: req.path,
      route: routePattern(req),
      status,
      duration_ms: Date.now() - startedAt,
      request_id: ctx?.requestId,
      errored: status >= 400,
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
      this.posthog.capture({
        distinctId: userId || 'anonymous',
        event: 'api_request',
        properties,
        groups,
      })
    }
  }
}

function shouldSkip(req: Request): boolean {
  if (req.method === 'OPTIONS') return true
  const path = req.path
  if (SKIP_EXACT.has(path)) return true
  return SKIP_PREFIX.some((prefix) => path.startsWith(prefix))
}

function routePattern(req: Request): string {
  const route = (req as Request & { route?: { path?: string } }).route?.path
  return route ? `${req.baseUrl || ''}${route}` : req.path
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
 * Lightweight, PII-free summary of a Meta-style webhook payload: object type,
 * number of entries and the field/event types involved — never the message
 * bodies (those stay in the application logs).
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
