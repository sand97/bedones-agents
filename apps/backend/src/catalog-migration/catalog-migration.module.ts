import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { CatalogModule } from '../catalog/catalog.module'
import { GatewayModule } from '../gateway/gateway.module'
import { QueueModule } from '../queue/queue.module'
import { UploadModule } from '../upload/upload.module'

import { CatalogConnectorClient } from './catalog-connector.client'
import { CatalogMigrationController } from './catalog-migration.controller'
import { CatalogMigrationProcessor } from './catalog-migration.processor'
import { CatalogMigrationService } from './catalog-migration.service'

@Module({
  imports: [AuthModule, GatewayModule, QueueModule, CatalogModule, UploadModule],
  controllers: [CatalogMigrationController],
  providers: [CatalogMigrationService, CatalogMigrationProcessor, CatalogConnectorClient],
  exports: [CatalogMigrationService],
})
export class CatalogMigrationModule {}
