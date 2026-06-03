import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { CatalogModule } from '../catalog/catalog.module'
import { GatewayModule } from '../gateway/gateway.module'
import { QueueModule } from '../queue/queue.module'
import { UploadModule } from '../upload/upload.module'

import { CatalogConnectorClient } from './catalog-connector.client'
import { CatalogMigrationCallbackController } from './catalog-migration-callback.controller'
import { CatalogMigrationCallbackGuard } from './catalog-migration-callback.guard'
import { CatalogMigrationController } from './catalog-migration.controller'
import { CatalogMigrationProcessor } from './catalog-migration.processor'
import { CatalogMigrationService } from './catalog-migration.service'

@Module({
  imports: [AuthModule, GatewayModule, QueueModule, CatalogModule, UploadModule],
  controllers: [CatalogMigrationController, CatalogMigrationCallbackController],
  providers: [
    CatalogMigrationService,
    CatalogMigrationProcessor,
    CatalogConnectorClient,
    CatalogMigrationCallbackGuard,
  ],
  exports: [CatalogMigrationService],
})
export class CatalogMigrationModule {}
