import { Module } from '@nestjs/common'
import { ErrorExplanationService } from './error-explanation.service'
import { SocialHealthService } from './social-health.service'

/**
 * Standalone module for the account health / circuit-breaker stack. Depends only
 * on the global Prisma and LLM modules, so it can be imported by both
 * SocialModule and CatalogModule without creating a circular dependency.
 */
@Module({
  providers: [ErrorExplanationService, SocialHealthService],
  exports: [ErrorExplanationService, SocialHealthService],
})
export class SocialHealthModule {}
