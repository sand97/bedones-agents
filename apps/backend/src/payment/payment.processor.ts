import { OnModuleInit, Logger } from '@nestjs/common'
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq'
import { Queue, type Job } from 'bullmq'
import { PAYMENT_QUEUE } from '../queue/queue.module'
import { SubscriptionService } from './subscription.service'
import { SubscriptionNotificationService } from './subscription-notification.service'

// Cron quotidien (BullMQ repeatable) qui fait expirer les accès à durée fixe
// (mobile money NotchPay, ou Stripe annulés) arrivés à échéance. Pattern calqué
// sur whatsapp-optin.processor (repeatable job réenregistré au boot).
const EXPIRY_TICK = 'expire-subscriptions'

@Processor(PAYMENT_QUEUE)
export class PaymentProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(PaymentProcessor.name)

  constructor(
    @InjectQueue(PAYMENT_QUEUE) private queue: Queue,
    private subscriptionService: SubscriptionService,
    private notifications: SubscriptionNotificationService,
  ) {
    super()
  }

  async onModuleInit() {
    await this.ensureDailyCron()
  }

  async process(job: Job<unknown>): Promise<void> {
    if (job.name === EXPIRY_TICK) {
      // 1) Rappels d'échéance (mobile money) AVANT expiration, 2) expiration des
      // accès non renouvelés arrivés à terme.
      await this.notifications.sendDueReminders()
      await this.subscriptionService.expireSubscriptions()
      return
    }
    this.logger.warn(`[payment] job inconnu: ${String(job.name)}`)
  }

  private async ensureDailyCron(): Promise<void> {
    const pattern = process.env.PAYMENT_EXPIRY_CRON ?? '0 3 * * *' // tous les jours à 03:00 UTC

    const existing = await this.queue.getRepeatableJobs()
    for (const j of existing) {
      if (j.name === EXPIRY_TICK) await this.queue.removeRepeatableByKey(j.key)
    }

    await this.queue.add(
      EXPIRY_TICK,
      {},
      {
        repeat: { pattern },
        jobId: 'payment-expire-subscriptions',
        removeOnComplete: true,
        removeOnFail: 100,
      },
    )
  }
}
