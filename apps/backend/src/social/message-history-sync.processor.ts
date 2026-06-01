import { Logger } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import type { Job } from 'bullmq'
import { MESSAGE_HISTORY_SYNC_QUEUE } from '../queue/queue.module'
import {
  HISTORY_SYNC_ACCOUNT_JOB,
  HISTORY_SYNC_CONVERSATION_JOB,
  MessageHistorySyncService,
  type HistorySyncAccountJobData,
  type HistorySyncConversationJobData,
  type HistorySyncJobName,
} from './message-history-sync.service'

@Processor(MESSAGE_HISTORY_SYNC_QUEUE, { concurrency: 3 })
export class MessageHistorySyncProcessor extends WorkerHost {
  private readonly logger = new Logger(MessageHistorySyncProcessor.name)

  constructor(private readonly historySync: MessageHistorySyncService) {
    super()
  }

  async process(job: Job<unknown>): Promise<void> {
    const name = job.name as HistorySyncJobName
    if (name === HISTORY_SYNC_ACCOUNT_JOB) {
      const { socialAccountId } = job.data as HistorySyncAccountJobData
      await this.historySync.handleAccountJob(socialAccountId)
      return
    }
    if (name === HISTORY_SYNC_CONVERSATION_JOB) {
      await this.historySync.handleConversationJob(job.data as HistorySyncConversationJobData)
      return
    }
    this.logger.warn(`[History] unknown job name: ${String(name)}`)
  }
}
