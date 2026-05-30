import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CatalogController } from './catalog.controller'
import { CatalogWebhookController } from './catalog-webhook.controller'
import { CatalogService } from './catalog.service'
import { ProductContextController } from './product-context.controller'
import { ProductContextService } from './product-context.service'

@Module({
  imports: [AuthModule],
  controllers: [CatalogController, CatalogWebhookController, ProductContextController],
  providers: [CatalogService, ProductContextService],
  exports: [CatalogService, ProductContextService],
})
export class CatalogModule {}
