import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import type { Job } from 'bullmq'
import { WHATSAPP_PRODUCT_IMAGE_SYNC_QUEUE } from '../queue/queue.module'
import { ProductImageSyncService, type ProductImageSyncJobData } from './product-image-sync.service'

@Processor(WHATSAPP_PRODUCT_IMAGE_SYNC_QUEUE)
export class ProductImageSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(ProductImageSyncProcessor.name)

  constructor(private readonly productImageSyncService: ProductImageSyncService) {
    super()
  }

  async process(job: Job<ProductImageSyncJobData>): Promise<void> {
    const { messageId } = job.data
    this.logger.log(`Processing product image sync for message ${messageId}`)
    await this.productImageSyncService.sync(messageId)
  }
}
