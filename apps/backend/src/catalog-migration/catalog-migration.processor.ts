import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import type { Job } from 'bullmq'

import { CATALOG_MIGRATION_QUEUE } from '../queue/queue.module'
import {
  CatalogMigrationJobData,
  CatalogMigrationService,
} from './catalog-migration.service'

/**
 * Processes catalogue migrations one at a time (`concurrency: 1`) — the Notion
 * spec mandates a single extraction at a time because only one of our numbers
 * is connected to the wppconnect service.
 *
 * On every worker lifecycle change we rebroadcast the queue state so each
 * waiting user sees their "minutes before your turn" decrement in real time.
 */
@Processor(CATALOG_MIGRATION_QUEUE, { concurrency: 1 })
export class CatalogMigrationProcessor extends WorkerHost {
  private readonly logger = new Logger(CatalogMigrationProcessor.name)

  constructor(private readonly service: CatalogMigrationService) {
    super()
  }

  async process(job: Job<CatalogMigrationJobData>): Promise<void> {
    this.logger.log(`Processing migration ${job.data.migrationId} (job ${job.id})`)
    await this.service.runMigration(job.data.migrationId, (percentage) => {
      void job.updateProgress(percentage)
    })
  }

  @OnWorkerEvent('active')
  onActive() {
    void this.service.broadcastQueueState()
  }

  @OnWorkerEvent('completed')
  onCompleted() {
    void this.service.broadcastQueueState()
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<CatalogMigrationJobData>, error: Error) {
    this.logger.error(`Migration ${job?.data?.migrationId} failed: ${error?.message}`)
    void this.service.broadcastQueueState()
  }
}
