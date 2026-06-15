import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

/**
 * Per-request context carried through the whole async call stack via
 * AsyncLocalStorage. Lets the PostHog logger and interceptor attach the current
 * user / request id to events even from deep service code, without threading the
 * request object everywhere.
 *
 * The store is a mutable object: it is created in the middleware (before auth
 * runs) and enriched later — by the analytics interceptor once `req.user` is
 * known, and by webhook processing once the conversation is resolved (see
 * {@link setRequestContext}).
 */
export interface RequestContext {
  requestId: string
  method?: string
  path?: string
  userId?: string
  organisationId?: string
  /**
   * Conversation the current execution is about. Set during webhook processing
   * (once the inbound message resolves a conversation) and on the agent worker,
   * so every log line becomes searchable by conversation in PostHog → Logs.
   */
  conversationId?: string
  /** Social account / channel the execution relates to. */
  socialAccountId?: string
  /** End customer (platform sender / participant id) the execution is about. */
  contactId?: string
  /** Channel provider (WHATSAPP, INSTAGRAM, FACEBOOK, TIKTOK) when known. */
  provider?: string
  /**
   * Logical origin of the execution: `http` (default — an inbound HTTP request),
   * `agent-message-processing` (the BullMQ worker that runs the live agent), … —
   * lets PostHog tell webhook ingestion logs apart from the agent-run logs that
   * the same conversation triggered.
   */
  source?: string
}

const storage = new AsyncLocalStorage<RequestContext>()

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore()
}

/**
 * Merge fields into the CURRENT context (no-op when called outside a scope).
 * Used to enrich the context mid-flight once deeper code resolves something it
 * could not know up front — e.g. the conversation an inbound webhook is about.
 * Undefined values are ignored so a later call never clobbers an earlier one.
 */
export function setRequestContext(patch: Partial<RequestContext>): void {
  const store = storage.getStore()
  if (!store) return
  const target = store as unknown as Record<string, unknown>
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) target[key] = value
  }
}

/**
 * Open a FRESH context scope for work that runs OUTSIDE an HTTP request — BullMQ
 * workers, scheduled tasks, event handlers. A `requestId` is generated when not
 * provided so every execution stays correlatable in PostHog (its logs share one
 * id). Mirrors what {@link requestContextMiddleware} does for HTTP requests.
 */
export function runWithContext<T>(seed: Partial<RequestContext>, fn: () => T): T {
  const context: RequestContext = { ...seed, requestId: seed.requestId || randomUUID() }
  return storage.run(context, fn)
}

/**
 * Express middleware that opens an AsyncLocalStorage scope for the request.
 * Registered first in `main.ts` (via `app.use`) so every downstream handler,
 * guard, interceptor and service runs inside the same context. Using a plain
 * Express middleware (instead of a Nest middleware with `forRoutes('*')`) keeps
 * us compatible with Express 5's stricter path matching.
 */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id']
  const requestId = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID()

  const context: RequestContext = {
    requestId,
    method: req.method,
    path: req.path,
  }

  res.setHeader('x-request-id', requestId)
  storage.run(context, () => next())
}
