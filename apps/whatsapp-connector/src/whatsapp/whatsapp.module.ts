import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { TargetInstanceGuard } from './guards/target-instance.guard'
import { WhatsAppClientService } from './whatsapp-client.service'
import { WhatsAppController } from './whatsapp.controller'

@Module({
  imports: [
    HttpModule.register({
      timeout: 60000, // 60s — the catalogue extraction streams images one by one
      maxRedirects: 5,
    }),
    ConfigModule,
  ],
  controllers: [WhatsAppController],
  providers: [WhatsAppClientService, TargetInstanceGuard],
  exports: [WhatsAppClientService],
})
export class WhatsAppModule {}
