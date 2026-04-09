import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CatalogController } from './catalog.controller'
import { CatalogWebhookController } from './catalog-webhook.controller'
import { CatalogService } from './catalog.service'

@Module({
  imports: [AuthModule],
  controllers: [CatalogController, CatalogWebhookController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
