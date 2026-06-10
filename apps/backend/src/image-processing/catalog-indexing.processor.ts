import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import type { Job } from 'bullmq'

import { CATALOG_INDEXING_QUEUE } from '../queue/queue.module'
import { ProductImageIndexingService, type MetaProduct } from './product-image-indexing.service'

/** Job names handled by this processor. */
export const INDEX_CATALOG_JOB = 'index-catalog'
export const INDEX_PRODUCT_JOB = 'index-product'

/** Full-catalog (re)sync from Meta → Qdrant. */
export interface CatalogIndexingJobData {
  catalogId: string
  organisationId: string
}

/** Single-product index — enqueued right after a product is created. */
export interface SingleProductIndexingJobData {
  catalogId: string
  product: MetaProduct
}

@Processor(CATALOG_INDEXING_QUEUE, { concurrency: 5 })
export class CatalogIndexingProcessor extends WorkerHost {
  private readonly logger = new Logger(CatalogIndexingProcessor.name)

  constructor(private readonly indexingService: ProductImageIndexingService) {
    super()
  }

  async process(job: Job<CatalogIndexingJobData | SingleProductIndexingJobData>): Promise<void> {
    if (process.env.DISABLE_CATALOG_INDEXING === 'true') {
      return
    }

    // ── Single product (on-create indexing) ──
    if (job.name === INDEX_PRODUCT_JOB) {
      const { catalogId, product } = job.data as SingleProductIndexingJobData
      this.logger.log(`Indexing single product ${product.id} for catalog ${catalogId}`)
      await this.indexingService.indexProduct(catalogId, product)
      return
    }

    // ── Full catalog sync ──
    const { catalogId, organisationId } = job.data as CatalogIndexingJobData
    this.logger.log(`Processing catalog sync job for catalog ${catalogId}`)

    const result = await this.indexingService.syncCatalog(
      catalogId,
      organisationId,
      (percentage) => {
        job.updateProgress(percentage)
      },
    )

    this.logger.log(
      `Catalog sync completed: ${result.processed} indexed, ${result.skipped} skipped, ${result.failed} failed of ${result.total}`,
    )

    if (!result.success) {
      throw new Error(result.message)
    }
  }
}
