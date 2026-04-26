import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { NotificationPreferenceController } from './notification-preference.controller'
import { NotificationPreferenceService } from './notification-preference.service'

@Module({
  imports: [AuthModule],
  controllers: [NotificationPreferenceController],
  providers: [NotificationPreferenceService],
  exports: [NotificationPreferenceService],
})
export class NotificationPreferenceModule {}
