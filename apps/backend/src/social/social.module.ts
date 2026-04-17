import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { UploadModule } from '../upload/upload.module'
import { CatalogModule } from '../catalog/catalog.module'
import { SocialController } from './social.controller'
import { SocialService } from './social.service'
import { WebhookController } from './webhook.controller'
import { WebhookService } from './webhook.service'
import { MessagingController } from './messaging.controller'
import { TikTokWebhookController } from './tiktok-webhook.controller'
import { MessagingService } from './messaging.service'
import { AIService } from './ai.service'
import { LabelController } from './label.controller'
import { LabelService } from './label.service'

@Module({
  imports: [AuthModule, UploadModule, CatalogModule],
  controllers: [
    SocialController,
    WebhookController,
    TikTokWebhookController,
    MessagingController,
    LabelController,
  ],
  providers: [SocialService, WebhookService, MessagingService, AIService, LabelService],
  exports: [MessagingService, LabelService],
})
export class SocialModule {}
