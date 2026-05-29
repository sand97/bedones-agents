import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { PrismaService } from '../prisma/prisma.service'
import { UploadService } from '../upload/upload.service'
import { SOCIAL_AVATAR_SYNC_QUEUE } from '../queue/queue.module'

export const AVATAR_SYNC_JOB = 'sync-avatar'
export const AVATAR_SYNC_FOLDER = 'social-avatars'

export interface AvatarSyncJobData {
  socialAccountId: string
}

@Injectable()
export class AvatarSyncService {
  private readonly logger = new Logger(AvatarSyncService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    @InjectQueue(SOCIAL_AVATAR_SYNC_QUEUE) private readonly queue: Queue,
  ) {}

  /**
   * Enqueue an async avatar sync for a social account. Safe to call repeatedly:
   * if a stale completed/failed job with the same id is hanging around it gets
   * removed first so the new connection picks up a fresh URL.
   */
  async enqueue(socialAccountId: string): Promise<void> {
    const jobId = `avatar-sync-${socialAccountId}`
    const existing = await this.queue.getJob(jobId)
    if (existing) {
      const state = await existing.getState()
      if (state === 'completed' || state === 'failed') {
        await existing.remove()
      } else {
        return
      }
    }

    await this.queue.add(AVATAR_SYNC_JOB, { socialAccountId } satisfies AvatarSyncJobData, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: true,
      removeOnFail: 50,
    })
  }

  /**
   * Download the social account's profile picture and upload it to our MinIO
   * bucket, then replace the DB URL with our own. No-op when the URL is empty
   * or already points to our bucket.
   */
  async sync(socialAccountId: string): Promise<void> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: { id: true, profilePictureUrl: true, provider: true },
    })

    if (!account) {
      this.logger.warn(`[AvatarSync] Social account ${socialAccountId} not found`)
      return
    }
    if (!account.profilePictureUrl) {
      return
    }
    if (this.uploadService.isOwnUrl(account.profilePictureUrl)) {
      return
    }

    const minioUrl = await this.uploadService.uploadFromUrl(
      account.profilePictureUrl,
      AVATAR_SYNC_FOLDER,
    )
    if (!minioUrl) {
      throw new Error(`Failed to download avatar for social account ${socialAccountId}`)
    }

    // Re-read so we don't overwrite a fresher URL (e.g. another connect that
    // ran between the read above and now and is itself pending sync).
    const fresh = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: { profilePictureUrl: true },
    })
    if (!fresh || fresh.profilePictureUrl !== account.profilePictureUrl) {
      this.logger.log(
        `[AvatarSync] ${socialAccountId} URL changed during sync — uploaded ${minioUrl} but skipping DB write`,
      )
      return
    }

    await this.prisma.socialAccount.update({
      where: { id: socialAccountId },
      data: { profilePictureUrl: minioUrl },
    })

    this.logger.log(`[AvatarSync] ${account.provider} account ${socialAccountId} → ${minioUrl}`)
  }
}
