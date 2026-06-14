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
import { CatalogMigrationModule } from './catalog-migration/catalog-migration.module'
import { AgentModule } from './agent/agent.module'
import { TicketModule } from './ticket/ticket.module'
import { PromotionModule } from './promotion/promotion.module'
import { LoyaltyModule } from './loyalty/loyalty.module'
import { ImageProcessingModule } from './image-processing/image-processing.module'
import { StatsModule } from './stats/stats.module'
import { PaymentModule } from './payment/payment.module'
import { NotificationPreferenceModule } from './notification-preference/notification-preference.module'
import { WhatsappOptinModule } from './whatsapp-optin/whatsapp-optin.module'
import { LlmModule } from './common/llm/llm.module'
import { ContactLanguageModule } from './contact-language/contact-language.module'
import { BedonesMcpModule } from './mcp/mcp.module'
import { DebugMcpModule } from './debug-mcp/debug-mcp.module'
import { PostHogModule } from './posthog/posthog.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    PostHogModule,
    LlmModule,
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
    CatalogMigrationModule,
    AgentModule,
    TicketModule,
    PromotionModule,
    LoyaltyModule,
    ImageProcessingModule,
    StatsModule,
    PaymentModule,
    NotificationPreferenceModule,
    WhatsappOptinModule,
    ContactLanguageModule,
    BedonesMcpModule,
    // Internal debug MCP — mounted only when explicitly enabled at deploy time.
    ...(process.env.DEBUG_MCP_ENABLED === 'true' ? [DebugMcpModule] : []),
  ],
  controllers: [AppController],
})
export class AppModule {}
