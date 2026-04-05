import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppController } from './app.controller'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { OrganisationModule } from './organisation/organisation.module'
import { UploadModule } from './upload/upload.module'
import { SocialModule } from './social/social.module'
import { GatewayModule } from './gateway/gateway.module'
import { MemberModule } from './member/member.module'
import { InvitationModule } from './invitation/invitation.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    GatewayModule,
    AuthModule,
    OrganisationModule,
    UploadModule,
    SocialModule,
    MemberModule,
    InvitationModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
