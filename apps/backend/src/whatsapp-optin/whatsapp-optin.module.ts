import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { AuthModule } from '../auth/auth.module'
import { QueueModule, WHATSAPP_OPTIN_QUEUE } from '../queue/queue.module'
import { WhatsappOptinController } from './whatsapp-optin.controller'
import { WhatsappOptinService } from './whatsapp-optin.service'
import { WhatsappOptinProcessor } from './whatsapp-optin.processor'

@Module({
  imports: [AuthModule, QueueModule, BullModule.registerQueue({ name: WHATSAPP_OPTIN_QUEUE })],
  controllers: [WhatsappOptinController],
  providers: [WhatsappOptinService, WhatsappOptinProcessor],
  exports: [WhatsappOptinService],
})
export class WhatsappOptinModule {}
