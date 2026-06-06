import { Global, Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { PostHogService } from './posthog.service'
import { PostHogLoggerService } from './posthog-logger.service'
import { PostHogAnalyticsInterceptor } from './posthog-analytics.interceptor'

/**
 * Global PostHog integration for the backend:
 * - {@link PostHogService}: the shared `posthog-node` client (capture, exceptions).
 * - {@link PostHogLoggerService}: mirrors app logs to PostHog (set in `main.ts`).
 * - {@link PostHogAnalyticsInterceptor}: tracks every webhook + API call.
 *
 * Marked `@Global` so any feature module (e.g. the LLM factory) can inject
 * {@link PostHogService} without re-importing this module.
 */
@Global()
@Module({
  providers: [
    PostHogService,
    PostHogLoggerService,
    { provide: APP_INTERCEPTOR, useClass: PostHogAnalyticsInterceptor },
  ],
  exports: [PostHogService, PostHogLoggerService],
})
export class PostHogModule {}
