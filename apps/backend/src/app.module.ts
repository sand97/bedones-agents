import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { I18nModule, AcceptLanguageResolver, I18nJsonLoader } from 'nestjs-i18n'
import * as path from 'path'
import { AppController } from './app.controller'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { OrganisationModule } from './organisation/organisation.module'
import { UploadModule } from './upload/upload.module'
import { SocialModule } from './social/social.module'
import { GatewayModule } from './gateway/gateway.module'
import { MemberModule } from './member/member.module'
import { InvitationModule } from './invitation/invitation.module'
import { CatalogModule } from './catalog/catalog.module'
import { AgentModule } from './agent/agent.module'
import { TicketModule } from './ticket/ticket.module'
import { PromotionModule } from './promotion/promotion.module'
import { ImageProcessingModule } from './image-processing/image-processing.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    I18nModule.forRoot({
      fallbackLanguage: 'fr',
      loader: I18nJsonLoader,
      loaderOptions: {
        path: path.join(__dirname, '..', '/i18n/'),
      },
      resolvers: [AcceptLanguageResolver],
    }),
    PrismaModule,
    GatewayModule,
    AuthModule,
    OrganisationModule,
    UploadModule,
    SocialModule,
    MemberModule,
    InvitationModule,
    CatalogModule,
    AgentModule,
    TicketModule,
    PromotionModule,
    ImageProcessingModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
