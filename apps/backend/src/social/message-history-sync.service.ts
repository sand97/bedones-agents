import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { PrismaService } from '../prisma/prisma.service'
import { MESSAGE_HISTORY_SYNC_QUEUE } from '../queue/queue.module'
import { MessagingService, type HistoryConversationRef } from './messaging.service'

export const HISTORY_SYNC_ACCOUNT_JOB = 'sync-account'
export const HISTORY_SYNC_CONVERSATION_JOB = 'sync-conversation'

export type HistorySyncJobName =
  | typeof HISTORY_SYNC_ACCOUNT_JOB
  | typeof HISTORY_SYNC_CONVERSATION_JOB

export interface HistorySyncAccountJobData {
  socialAccountId: string
}

export interface HistorySyncConversationJobData {
  socialAccountId: string
  ref: HistoryConversationRef
}

const JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: true,
  removeOnFail: 50,
}

/**
 * Orchestrates the connect-time backfill of the last 14 days of messages.
 *
 * Two-phase, queue-driven (per the product requirement): an account-level job
 * lists the conversations first, then enqueues one job per conversation to pull
 * its messages. WhatsApp has no history pull API — its history is delivered via
 * Coexistence webhooks — so for WhatsApp we only flip the status to RUNNING and
 * let WebhookService persist the incoming history.
 *
 * Resilience against duplicates from webhooks arriving during the sync is
 * handled downstream in {@link MessagingService.handleHistoricalMessage} (dedup
 * on the provider message id + P2002 guard).
 */
@Injectable()
export class MessageHistorySyncService {
  private readonly logger = new Logger(MessageHistorySyncService.name)

  constructor(
    @InjectQueue(MESSAGE_HISTORY_SYNC_QUEUE) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly messagingService: MessagingService,
  ) {}

  /** Kick off the initial backfill for a freshly (re)connected account. */
  async enqueueInitialSync(socialAccountId: string): Promise<void> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: { id: true, provider: true },
    })
    if (!account) return

    // WhatsApp: history is pushed by Meta through Coexistence webhooks. Nothing
    // to pull — mark RUNNING; WebhookService marks it COMPLETED on the final
    // history phase.
    if (account.provider === 'WHATSAPP') {
      await this.setStatus(socialAccountId, 'RUNNING')
      this.logger.log(
        `[History] WhatsApp ${socialAccountId} awaiting Coexistence history webhook(s)`,
      )
      return
    }

    if (!['FACEBOOK', 'INSTAGRAM', 'TIKTOK'].includes(account.provider)) {
      await this.setStatus(socialAccountId, 'UNSUPPORTED')
      return
    }

    await this.setStatus(socialAccountId, 'PENDING')
    await this.queue.add(
      HISTORY_SYNC_ACCOUNT_JOB,
      { socialAccountId } satisfies HistorySyncAccountJobData,
      { ...JOB_OPTS, jobId: `hist:acct:${socialAccountId}` },
    )
  }

  /** Phase 1 worker: list conversations and fan out per-conversation jobs. */
  async handleAccountJob(socialAccountId: string): Promise<void> {
    await this.setStatus(socialAccountId, 'RUNNING')
    try {
      const refs = await this.messagingService.listHistoryConversations(socialAccountId)
      for (const ref of refs) {
        const key = ref.platformThreadId || ref.conversationId || ref.participantId || 'unknown'
        await this.queue.add(
          HISTORY_SYNC_CONVERSATION_JOB,
          { socialAccountId, ref } satisfies HistorySyncConversationJobData,
          { ...JOB_OPTS, jobId: `hist:conv:${socialAccountId}:${key}` },
        )
      }
      await this.prisma.socialAccount.update({
        where: { id: socialAccountId },
        data: {
          historySyncStatus: 'COMPLETED',
          historySyncedAt: new Date(),
          historySyncError: null,
        },
      })
      this.logger.log(
        `[History] account ${socialAccountId} fanned out ${refs.length} conversation job(s)`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.prisma.socialAccount
        .update({
          where: { id: socialAccountId },
          data: { historySyncStatus: 'FAILED', historySyncError: message.slice(0, 500) },
        })
        .catch(() => undefined)
      throw error
    }
  }

  /** Phase 2 worker: pull one conversation's messages within the window. */
  async handleConversationJob(data: HistorySyncConversationJobData): Promise<void> {
    await this.messagingService.syncConversationHistory(data.socialAccountId, data.ref)
  }

  private async setStatus(
    socialAccountId: string,
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'UNSUPPORTED',
  ): Promise<void> {
    await this.prisma.socialAccount
      .update({ where: { id: socialAccountId }, data: { historySyncStatus: status } })
      .catch(() => undefined)
  }
}
