import { Module } from '@nestjs/common'
import { InvitationController } from './invitation.controller'
import { InvitationService } from './invitation.service'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule],
  controllers: [InvitationController],
  providers: [InvitationService],
  exports: [InvitationService],
})
export class InvitationModule {}
