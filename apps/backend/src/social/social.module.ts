import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common'
import { BullModule, InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { AuthModule } from '../auth/auth.module'
import { UploadModule } from '../upload/upload.module'
import { CatalogModule } from '../catalog/catalog.module'
import {
  QueueModule,
  SOCIAL_AVATAR_SYNC_QUEUE,
  WHATSAPP_PRODUCT_IMAGE_SYNC_QUEUE,
  MESSAGE_HISTORY_SYNC_QUEUE,
} from '../queue/queue.module'
import { PrismaService } from '../prisma/prisma.service'
import { UploadService } from '../upload/upload.service'
import { SocialController } from './social.controller'
import { SocialService } from './social.service'
import { SocialCommonService } from './social-common.service'
import { SocialConnectService } from './social-connect.service'
import { TikTokContentService } from './tiktok-content.service'
import { SocialAccountService } from './social-account.service'
import { PostService } from './post.service'
import { CommentService } from './comment.service'
import { WebhookController } from './webhook.controller'
import { WebhookService } from './webhook.service'
import { MessagingController } from './messaging.controller'
import { TikTokWebhookController } from './tiktok-webhook.controller'
import { MessagingService } from './messaging.service'
import { AIService } from './ai.service'
import { LabelController } from './label.controller'
import { LabelService } from './label.service'
import { AvatarSyncService, AVATAR_SYNC_JOB, type AvatarSyncJobData } from './avatar-sync.service'
import { AvatarSyncProcessor } from './avatar-sync.processor'
import { ProductImageSyncService } from './product-image-sync.service'
import { ProductImageSyncProcessor } from './product-image-sync.processor'
import { MessageHistorySyncService } from './message-history-sync.service'
import { MessageHistorySyncProcessor } from './message-history-sync.processor'
import { SocialHealthModule } from './social-health.module'

@Module({
  imports: [
    AuthModule,
    UploadModule,
    CatalogModule,
    SocialHealthModule,
    QueueModule,
    BullModule.registerQueue({ name: SOCIAL_AVATAR_SYNC_QUEUE }),
    BullModule.registerQueue({ name: WHATSAPP_PRODUCT_IMAGE_SYNC_QUEUE }),
    BullModule.registerQueue({ name: MESSAGE_HISTORY_SYNC_QUEUE }),
  ],
  controllers: [
    SocialController,
    WebhookController,
    TikTokWebhookController,
    MessagingController,
    LabelController,
  ],
  providers: [
    SocialService,
    SocialCommonService,
    SocialConnectService,
    TikTokContentService,
    SocialAccountService,
    PostService,
    CommentService,
    WebhookService,
    MessagingService,
    AIService,
    LabelService,
    AvatarSyncService,
    AvatarSyncProcessor,
    ProductImageSyncService,
    ProductImageSyncProcessor,
    MessageHistorySyncService,
    MessageHistorySyncProcessor,
  ],
  exports: [
    SocialService,
    MessagingService,
    LabelService,
    AvatarSyncService,
    ProductImageSyncService,
    MessageHistorySyncService,
  ],
})
export class SocialModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(SocialModule.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    @InjectQueue(SOCIAL_AVATAR_SYNC_QUEUE) private readonly avatarSyncQueue: Queue,
  ) {}

  /**
   * Catch-up pass: any social account whose `profilePictureUrl` is set to an
   * external (non-MinIO) URL gets re-queued at startup, so we eventually
   * mirror every avatar to our own bucket without losing existing rows.
   */
  async onApplicationBootstrap() {
    try {
      const accounts = await this.prisma.socialAccount.findMany({
        where: { profilePictureUrl: { not: null } },
        select: { id: true, profilePictureUrl: true },
      })

      const pending = accounts.filter((a) => !this.uploadService.isOwnUrl(a.profilePictureUrl))
      if (pending.length === 0) return

      this.logger.log(
        `Found ${pending.length} social account(s) with external avatar URLs — queuing for sync`,
      )

      for (const account of pending) {
        const jobId = `avatar-sync-${account.id}`
        const stale = await this.avatarSyncQueue.getJob(jobId)
        if (stale) {
          const state = await stale.getState()
          if (state === 'completed' || state === 'failed') {
            await stale.remove()
          } else {
            continue
          }
        }
        await this.avatarSyncQueue.add(
          AVATAR_SYNC_JOB,
          { socialAccountId: account.id } satisfies AvatarSyncJobData,
          {
            jobId,
            attempts: 3,
            backoff: { type: 'exponential', delay: 5_000 },
            removeOnComplete: true,
            removeOnFail: 50,
          },
        )
      }
    } catch (error) {
      this.logger.error('Failed to queue avatar syncs at startup', error)
    }
  }
}
