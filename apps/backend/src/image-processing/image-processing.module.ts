import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { AuthModule } from '../auth/auth.module'
import { GatewayModule } from '../gateway/gateway.module'
import { QueueModule, CATALOG_INDEXING_QUEUE } from '../queue/queue.module'
import { PrismaService } from '../prisma/prisma.service'
import { type CatalogIndexingJobData } from './catalog-indexing.processor'

import { QdrantService } from './qdrant.service'
import { GeminiEmbeddingService } from './gemini-embedding.service'
import { GeminiVisionService } from './gemini-vision.service'
import { OcrService } from './ocr.service'
import { SmartCropService } from './smart-crop.service'
import { ImageProductMatchingService } from './image-product-matching.service'
import { CatalogSearchService } from './catalog-search.service'
import { ProductImageIndexingService } from './product-image-indexing.service'
import { CatalogIndexingProcessor } from './catalog-indexing.processor'

@Module({
  imports: [AuthModule, GatewayModule, QueueModule],
  providers: [
    QdrantService,
    GeminiEmbeddingService,
    GeminiVisionService,
    OcrService,
    SmartCropService,
    ImageProductMatchingService,
    CatalogSearchService,
    ProductImageIndexingService,
    CatalogIndexingProcessor,
  ],
  exports: [
    QdrantService,
    GeminiEmbeddingService,
    CatalogSearchService,
    ImageProductMatchingService,
    ProductImageIndexingService,
  ],
})
export class ImageProcessingModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(ImageProcessingModule.name)

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(CATALOG_INDEXING_QUEUE) private readonly catalogIndexingQueue: Queue,
  ) {}

  async onApplicationBootstrap() {
    try {
      // Find all catalogs with a Meta providerId that haven't been fully indexed yet.
      // This covers: PENDING, ANALYZING (interrupted), INDEXING (interrupted), COMPLETED but 0 indexed.
      const unindexedCatalogs = await this.prisma.catalog.findMany({
        where: {
          providerId: { not: null },
          analysisStatus: { not: 'COMPLETED' },
        },
        select: {
          id: true,
          organisationId: true,
          name: true,
          analysisStatus: true,
          indexedCount: true,
          productCount: true,
        },
      })

      if (unindexedCatalogs.length === 0) {
        this.logger.log('No unindexed catalogs found at startup')
        return
      }

      this.logger.log(
        `Found ${unindexedCatalogs.length} unindexed catalog(s) — queuing for indexation`,
      )

      for (const catalog of unindexedCatalogs) {
        // Remove any stale completed/failed job with the same ID so we can re-queue
        const staleJob = await this.catalogIndexingQueue.getJob(`index-catalog-${catalog.id}`)
        if (staleJob) {
          const state = await staleJob.getState()
          if (state === 'completed' || state === 'failed') {
            await staleJob.remove()
            this.logger.debug(`Removed stale ${state} job for catalog ${catalog.id}`)
          } else {
            this.logger.log(
              `Catalog "${catalog.name}" (${catalog.id}) already has a ${state} job — skipping`,
            )
            continue
          }
        }

        await this.catalogIndexingQueue.add(
          'index-catalog',
          {
            catalogId: catalog.id,
            organisationId: catalog.organisationId,
          } satisfies CatalogIndexingJobData,
          { jobId: `index-catalog-${catalog.id}` },
        )

        this.logger.log(
          `Queued indexation for catalog "${catalog.name}" (${catalog.id}) — was ${catalog.analysisStatus}`,
        )
      }
    } catch (error) {
      // Don't crash the app if startup indexing fails (e.g. Redis not available)
      this.logger.error('Failed to queue unindexed catalogs at startup', error)
    }
  }
}
