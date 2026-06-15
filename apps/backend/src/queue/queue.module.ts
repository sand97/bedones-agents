import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { ConfigModule, ConfigService } from '@nestjs/config'

export const CATALOG_INDEXING_QUEUE = 'catalog-indexing'
export const WHATSAPP_OPTIN_QUEUE = 'whatsapp-optin'
export const SOCIAL_AVATAR_SYNC_QUEUE = 'social-avatar-sync'
export const LOYALTY_CAMPAIGN_QUEUE = 'loyalty-campaign'
export const CONTACT_LANGUAGE_QUEUE = 'contact-language'
export const WHATSAPP_PRODUCT_IMAGE_SYNC_QUEUE = 'whatsapp-product-image-sync'
export const CATALOG_MIGRATION_QUEUE = 'catalog-migration'
export const MESSAGE_HISTORY_SYNC_QUEUE = 'message-history-sync'
export const TICKET_AGENT_QUEUE = 'ticket-agent'
export const PAYMENT_QUEUE = 'payment'
export const MESSAGE_PROCESSING_QUEUE = 'message-processing'

const catalogQueue = BullModule.registerQueue({
  name: CATALOG_INDEXING_QUEUE,
  defaultJobOptions: {
    removeOnComplete: true,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  },
})
const whatsappOptinQueue = BullModule.registerQueue({ name: WHATSAPP_OPTIN_QUEUE })
const socialAvatarSyncQueue = BullModule.registerQueue({ name: SOCIAL_AVATAR_SYNC_QUEUE })
const loyaltyCampaignQueue = BullModule.registerQueue({ name: LOYALTY_CAMPAIGN_QUEUE })
const contactLanguageQueue = BullModule.registerQueue({ name: CONTACT_LANGUAGE_QUEUE })
const whatsappProductImageSyncQueue = BullModule.registerQueue({
  name: WHATSAPP_PRODUCT_IMAGE_SYNC_QUEUE,
})
const catalogMigrationQueue = BullModule.registerQueue({ name: CATALOG_MIGRATION_QUEUE })
const messageHistorySyncQueue = BullModule.registerQueue({ name: MESSAGE_HISTORY_SYNC_QUEUE })
const ticketAgentQueue = BullModule.registerQueue({ name: TICKET_AGENT_QUEUE })
const paymentQueue = BullModule.registerQueue({ name: PAYMENT_QUEUE })
// File de traitement des messages entrants, sérialisée/annulable par contact.
// Jobs éphémères : seul le job le plus récent par contact compte (les anciens
// sont annulés en vol), inutile de les conserver.
const messageProcessingQueue = BullModule.registerQueue({
  name: MESSAGE_PROCESSING_QUEUE,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 100,
  },
})

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL') || 'redis://localhost:6379'
        const url = new URL(redisUrl)
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port) || 6379,
            password: url.password || undefined,
          },
        }
      },
    }),
    catalogQueue,
    whatsappOptinQueue,
    socialAvatarSyncQueue,
    loyaltyCampaignQueue,
    contactLanguageQueue,
    whatsappProductImageSyncQueue,
    catalogMigrationQueue,
    messageHistorySyncQueue,
    ticketAgentQueue,
    paymentQueue,
    messageProcessingQueue,
  ],
  exports: [
    catalogQueue,
    whatsappOptinQueue,
    socialAvatarSyncQueue,
    loyaltyCampaignQueue,
    contactLanguageQueue,
    whatsappProductImageSyncQueue,
    catalogMigrationQueue,
    messageHistorySyncQueue,
    ticketAgentQueue,
    paymentQueue,
    messageProcessingQueue,
  ],
})
export class QueueModule {}
