import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { UploadModule } from '../upload/upload.module'
import { SocialController } from './social.controller'
import { SocialService } from './social.service'
import { WebhookController } from './webhook.controller'
import { WebhookService } from './webhook.service'
import { AIService } from './ai.service'

@Module({
  imports: [AuthModule, UploadModule],
  controllers: [SocialController, WebhookController],
  providers: [SocialService, WebhookService, AIService],
})
export class SocialModule {}
