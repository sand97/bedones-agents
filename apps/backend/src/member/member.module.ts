import { Module } from '@nestjs/common'
import { MemberController } from './member.controller'
import { MemberService } from './member.service'
import { AuthModule } from '../auth/auth.module'
import { InvitationModule } from '../invitation/invitation.module'

@Module({
  imports: [AuthModule, InvitationModule],
  controllers: [MemberController],
  providers: [MemberService],
  exports: [MemberService],
})
export class MemberModule {}
