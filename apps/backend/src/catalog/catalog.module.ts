import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CatalogController } from './catalog.controller'
import { CatalogWebhookController } from './catalog-webhook.controller'
import { CatalogService } from './catalog.service'
import { CatalogAccessService } from './services/catalog-access.service'
import { CatalogManagementService } from './services/catalog-management.service'
import { CatalogProductQueryService } from './services/catalog-product-query.service'
import { CatalogProductWriteService } from './services/catalog-product-write.service'
import { CatalogCollectionService } from './services/catalog-collection.service'
import { CatalogWhatsappService } from './services/catalog-whatsapp.service'
import { CatalogImageTemplateService } from './services/catalog-image-template.service'
import { ProductContextController } from './product-context.controller'
import { ProductContextService } from './product-context.service'
import { SocialHealthModule } from '../social/social-health.module'
import { QueueModule } from '../queue/queue.module'

@Module({
  imports: [AuthModule, SocialHealthModule, QueueModule],
  controllers: [CatalogController, CatalogWebhookController, ProductContextController],
  providers: [
    CatalogService,
    CatalogAccessService,
    CatalogManagementService,
    CatalogProductQueryService,
    CatalogProductWriteService,
    CatalogCollectionService,
    CatalogWhatsappService,
    CatalogImageTemplateService,
    ProductContextService,
  ],
  exports: [CatalogService, ProductContextService],
})
export class CatalogModule {}
