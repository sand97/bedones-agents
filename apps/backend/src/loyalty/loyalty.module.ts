import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { AuthModule } from '../auth/auth.module'
import { LOYALTY_CAMPAIGN_QUEUE, QueueModule } from '../queue/queue.module'
import { LoyaltyController } from './loyalty.controller'
import { LoyaltyService } from './loyalty.service'
import { LoyaltyCampaignProcessor } from './loyalty-campaign.processor'

@Module({
  imports: [AuthModule, QueueModule, BullModule.registerQueue({ name: LOYALTY_CAMPAIGN_QUEUE })],
  controllers: [LoyaltyController],
  providers: [LoyaltyService, LoyaltyCampaignProcessor],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
