import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { AuthModule } from '../auth/auth.module'
import { LOYALTY_CAMPAIGN_QUEUE, QueueModule } from '../queue/queue.module'
import { LoyaltyController } from './loyalty.controller'
import { LoyaltyService } from './loyalty.service'
import { LoyaltyCampaignProcessor } from './loyalty-campaign.processor'
import { LoyaltyContactService } from './services/loyalty-contact.service'
import { LoyaltyBonusService } from './services/loyalty-bonus.service'
import { LoyaltyTemplateService } from './services/loyalty-template.service'
import { LoyaltyAudienceService } from './services/loyalty-audience.service'
import { LoyaltyCampaignService } from './services/loyalty-campaign.service'
import { LoyaltyCampaignStatsService } from './services/loyalty-campaign-stats.service'
import { LoyaltyCampaignSenderService } from './services/loyalty-campaign-sender.service'
import { LoyaltyEngagementService } from './services/loyalty-engagement.service'

@Module({
  imports: [AuthModule, QueueModule, BullModule.registerQueue({ name: LOYALTY_CAMPAIGN_QUEUE })],
  controllers: [LoyaltyController],
  providers: [
    LoyaltyService,
    LoyaltyContactService,
    LoyaltyBonusService,
    LoyaltyTemplateService,
    LoyaltyAudienceService,
    LoyaltyCampaignService,
    LoyaltyCampaignStatsService,
    LoyaltyCampaignSenderService,
    LoyaltyEngagementService,
    LoyaltyCampaignProcessor,
  ],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
