import { Global, Module } from '@nestjs/common'
import { PostHogService } from './posthog.service'
import { PostHogLoggerService } from './posthog-logger.service'
import { PostHogHttpMiddleware } from './posthog-http.middleware'

/**
 * Global PostHog integration for the backend:
 * - {@link PostHogService}: the shared `posthog-node` client (capture, exceptions).
 * - {@link PostHogLoggerService}: mirrors app logs to PostHog (set in `main.ts`).
 * - {@link PostHogHttpMiddleware}: tracks every webhook + API call (registered
 *   in `main.ts` via `app.use`).
 *
 * Marked `@Global` so any feature module (e.g. the LLM factory) can inject
 * {@link PostHogService} without re-importing this module.
 */
@Global()
@Module({
  providers: [PostHogService, PostHogLoggerService, PostHogHttpMiddleware],
  exports: [PostHogService, PostHogLoggerService, PostHogHttpMiddleware],
})
export class PostHogModule {}
