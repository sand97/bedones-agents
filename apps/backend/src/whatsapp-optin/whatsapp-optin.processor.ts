import { OnModuleInit, Logger } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import type { Job } from 'bullmq'
import { WHATSAPP_OPTIN_QUEUE } from '../queue/queue.module'
import { WhatsappOptinService } from './whatsapp-optin.service'
import type { OptinJobName, SendTemplateJobData } from './whatsapp-optin.config'

@Processor(WHATSAPP_OPTIN_QUEUE)
export class WhatsappOptinProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(WhatsappOptinProcessor.name)

  constructor(private optin: WhatsappOptinService) {
    super()
  }

  async onModuleInit() {
    await this.optin.ensureHourlyCron()
  }

  async process(job: Job<unknown>): Promise<void> {
    const name = job.name as OptinJobName
    if (name === 'tick-hourly') {
      await this.optin.tickHourly()
      return
    }
    if (name === 'send-template') {
      const { userId, organisationId } = job.data as SendTemplateJobData
      await this.optin.sendOptInTemplate(userId, organisationId)
      return
    }
    this.logger.warn(`[WA opt-in] unknown job name: ${String(name)}`)
  }
}
