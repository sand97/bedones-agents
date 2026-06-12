import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CatalogModule } from '../catalog/catalog.module'
import { WhatsappOptinModule } from '../whatsapp-optin/whatsapp-optin.module'
import { NotificationPreferenceController } from './notification-preference.controller'
import { NotificationPreferenceService } from './notification-preference.service'
import { TicketNotificationService } from './ticket-notification.service'

@Module({
  imports: [AuthModule, CatalogModule, WhatsappOptinModule],
  controllers: [NotificationPreferenceController],
  providers: [NotificationPreferenceService, TicketNotificationService],
  exports: [NotificationPreferenceService],
})
export class NotificationPreferenceModule {}
