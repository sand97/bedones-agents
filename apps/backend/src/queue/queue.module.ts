import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { ConfigModule, ConfigService } from '@nestjs/config'

export const CATALOG_INDEXING_QUEUE = 'catalog-indexing'

const catalogQueue = BullModule.registerQueue({ name: CATALOG_INDEXING_QUEUE })

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
  ],
  exports: [catalogQueue],
})
export class QueueModule {}
