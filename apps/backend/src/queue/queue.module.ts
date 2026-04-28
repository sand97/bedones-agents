import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { ConfigModule, ConfigService } from '@nestjs/config'

export const CATALOG_INDEXING_QUEUE = 'catalog-indexing'
export const WHATSAPP_OPTIN_QUEUE = 'whatsapp-optin'
export const SOCIAL_AVATAR_SYNC_QUEUE = 'social-avatar-sync'

const catalogQueue = BullModule.registerQueue({ name: CATALOG_INDEXING_QUEUE })
const whatsappOptinQueue = BullModule.registerQueue({ name: WHATSAPP_OPTIN_QUEUE })
const socialAvatarSyncQueue = BullModule.registerQueue({ name: SOCIAL_AVATAR_SYNC_QUEUE })

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
  ],
  exports: [catalogQueue, whatsappOptinQueue, socialAvatarSyncQueue],
})
export class QueueModule {}
