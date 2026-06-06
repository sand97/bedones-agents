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
 * runs) and enriched later by the analytics interceptor once `req.user` is known.
 */
export interface RequestContext {
  requestId: string
  method?: string
  path?: string
  userId?: string
  organisationId?: string
}

const storage = new AsyncLocalStorage<RequestContext>()

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore()
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
