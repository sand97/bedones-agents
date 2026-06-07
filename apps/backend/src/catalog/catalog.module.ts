import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CatalogConnectorClient } from '../catalog-migration/catalog-connector.client'
import { CatalogController } from './catalog.controller'
import { CatalogWebhookController } from './catalog-webhook.controller'
import { CatalogService } from './catalog.service'
import { ProductContextController } from './product-context.controller'
import { ProductContextService } from './product-context.service'
import { SocialHealthModule } from '../social/social-health.module'

@Module({
  imports: [AuthModule, SocialHealthModule],
  controllers: [CatalogController, CatalogWebhookController, ProductContextController],
  providers: [CatalogService, ProductContextService, CatalogConnectorClient],
  exports: [CatalogService, ProductContextService],
})
export class CatalogModule {}
