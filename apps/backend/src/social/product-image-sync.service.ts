import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Prisma } from 'generated/prisma/client'
import type { Queue } from 'bullmq'
import { PrismaService } from '../prisma/prisma.service'
import { UploadService } from '../upload/upload.service'
import { WHATSAPP_PRODUCT_IMAGE_SYNC_QUEUE } from '../queue/queue.module'

export const PRODUCT_IMAGE_SYNC_JOB = 'sync-product-message-images'
export const PRODUCT_IMAGE_SYNC_FOLDER = 'whatsapp-product-images'

export interface ProductImageSyncJobData {
  messageId: string
}

type ProductMessageMetadata = {
  kind?: unknown
  items?: unknown
  [key: string]: unknown
}

type ProductMessageItem = {
  imageUrl?: unknown
  [key: string]: unknown
}

@Injectable()
export class ProductImageSyncService {
  private readonly logger = new Logger(ProductImageSyncService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    @InjectQueue(WHATSAPP_PRODUCT_IMAGE_SYNC_QUEUE) private readonly queue: Queue,
  ) {}

  async enqueue(messageId: string): Promise<void> {
    const jobId = `product-image-sync-${messageId}`
    const existing = await this.queue.getJob(jobId)
    if (existing) {
      const state = await existing.getState()
      if (state === 'completed' || state === 'failed') {
        await existing.remove()
      } else {
        return
      }
    }

    await this.queue.add(PRODUCT_IMAGE_SYNC_JOB, { messageId } satisfies ProductImageSyncJobData, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: true,
      removeOnFail: 50,
    })
  }

  async enqueueIfProductMessage(
    messageId: string,
    metadata: Record<string, unknown> | null | undefined,
  ): Promise<void> {
    if (!this.hasExternalProductImages(metadata)) return
    try {
      await this.enqueue(messageId)
    } catch (error) {
      this.logger.error(`[ProductImageSync] Failed to enqueue message ${messageId}`, error)
    }
  }

  async sync(messageId: string): Promise<void> {
    const message = await this.prisma.directMessage.findUnique({
      where: { id: messageId },
      select: { id: true, metadata: true },
    })
    if (!message) {
      this.logger.warn(`[ProductImageSync] Message ${messageId} not found`)
      return
    }

    const metadata = this.asProductMetadata(message.metadata)
    if (!metadata || !Array.isArray(metadata.items)) return

    const items = metadata.items.filter(this.isProductItem)
    const externalUrls = Array.from(
      new Set(
        items
          .map((item) => (typeof item.imageUrl === 'string' ? item.imageUrl : null))
          .filter((url): url is string => !!url && !this.uploadService.isOwnUrl(url)),
      ),
    )
    if (externalUrls.length === 0) return

    const uploadedEntries = await Promise.all(
      externalUrls.map(async (url) => {
        const uploadedUrl = await this.uploadService.uploadFromUrl(
          url,
          `${PRODUCT_IMAGE_SYNC_FOLDER}/${messageId}`,
        )
        return [url, uploadedUrl] as const
      }),
    )
    const uploadedBySource = new Map(
      uploadedEntries.filter((entry): entry is readonly [string, string] => !!entry[1]),
    )
    if (uploadedBySource.size === 0) {
      throw new Error(`Failed to upload product images for message ${messageId}`)
    }

    const nextItems = metadata.items.map((item) => {
      if (!this.isProductItem(item) || typeof item.imageUrl !== 'string') return item
      const uploadedUrl = uploadedBySource.get(item.imageUrl)
      return uploadedUrl ? { ...item, imageUrl: uploadedUrl } : item
    })

    await this.prisma.directMessage.update({
      where: { id: messageId },
      data: {
        metadata: {
          ...metadata,
          items: nextItems,
        } as Prisma.InputJsonValue,
      },
    })

    this.logger.log(
      `[ProductImageSync] Message ${messageId}: uploaded ${uploadedBySource.size} product image(s)`,
    )
  }

  private hasExternalProductImages(metadata: Record<string, unknown> | null | undefined): boolean {
    const productMetadata = this.asProductMetadata(metadata)
    if (!productMetadata || !Array.isArray(productMetadata.items)) return false
    return productMetadata.items.some(
      (item) =>
        this.isProductItem(item) &&
        typeof item.imageUrl === 'string' &&
        !!item.imageUrl &&
        !this.uploadService.isOwnUrl(item.imageUrl),
    )
  }

  private asProductMetadata(metadata: unknown): ProductMessageMetadata | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
    const candidate = metadata as ProductMessageMetadata
    if (candidate.kind !== 'catalog' && candidate.kind !== 'order') return null
    return candidate
  }

  private isProductItem(item: unknown): item is ProductMessageItem {
    return !!item && typeof item === 'object' && !Array.isArray(item)
  }
}
