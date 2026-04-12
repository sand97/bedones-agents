import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import type { Job } from 'bullmq'

import { CATALOG_INDEXING_QUEUE } from '../queue/queue.module'
import { ProductImageIndexingService } from './product-image-indexing.service'

export interface CatalogIndexingJobData {
  catalogId: string
  organisationId: string
}

@Processor(CATALOG_INDEXING_QUEUE)
export class CatalogIndexingProcessor extends WorkerHost {
  private readonly logger = new Logger(CatalogIndexingProcessor.name)

  constructor(private readonly indexingService: ProductImageIndexingService) {
    super()
  }

  async process(job: Job<CatalogIndexingJobData>): Promise<void> {
    const { catalogId, organisationId } = job.data
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
