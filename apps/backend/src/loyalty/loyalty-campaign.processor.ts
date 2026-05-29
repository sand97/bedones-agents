import { Logger, OnModuleInit } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import type { Job } from 'bullmq'
import { LOYALTY_CAMPAIGN_QUEUE } from '../queue/queue.module'
import {
  LoyaltyService,
  type LoyaltyCampaignJobData,
  type LoyaltyCampaignJobName,
} from './loyalty.service'

@Processor(LOYALTY_CAMPAIGN_QUEUE)
export class LoyaltyCampaignProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(LoyaltyCampaignProcessor.name)

  constructor(private loyaltyService: LoyaltyService) {
    super()
  }

  async onModuleInit() {
    await this.loyaltyService.enqueueDueCampaigns()
  }

  async process(job: Job<unknown>): Promise<void> {
    const name = job.name as LoyaltyCampaignJobName
    if (name === 'send-campaign') {
      const { campaignId } = job.data as LoyaltyCampaignJobData
      await this.loyaltyService.sendCampaign(campaignId)
      return
    }
    this.logger.warn(`[Campaign] unknown job name: ${String(name)}`)
  }
}
