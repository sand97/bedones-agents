import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import type { Job } from 'bullmq'

import { SOCIAL_AVATAR_SYNC_QUEUE } from '../queue/queue.module'
import { AvatarSyncService, type AvatarSyncJobData } from './avatar-sync.service'

@Processor(SOCIAL_AVATAR_SYNC_QUEUE)
export class AvatarSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(AvatarSyncProcessor.name)

  constructor(private readonly avatarSyncService: AvatarSyncService) {
    super()
  }

  async process(job: Job<AvatarSyncJobData>): Promise<void> {
    const { socialAccountId } = job.data
    this.logger.log(`Processing avatar sync for social account ${socialAccountId}`)
    await this.avatarSyncService.sync(socialAccountId)
  }
}
