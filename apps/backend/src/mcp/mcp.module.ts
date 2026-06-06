import { Global, Module } from '@nestjs/common'
import { McpModule, McpTransportType } from '@rekog/mcp-nest'
import { AuthModule } from '../auth/auth.module'
import { PrismaModule } from '../prisma/prisma.module'
import { SocialModule } from '../social/social.module'
import { McpAuthGuard } from './auth/mcp-auth.guard'
import { McpOAuthController } from './auth/mcp-oauth.controller'
import { McpOAuthService } from './auth/mcp-oauth.service'
import { WellKnownController } from './auth/well-known.controller'
import { McpCatalogTools } from './tools/catalog.tools'
import { McpCommentsTools } from './tools/comments.tools'
import { McpContextTools } from './tools/context.tools'
import { McpMessagingTools } from './tools/messaging.tools'
import { McpOrgTools } from './tools/org.tools'
import { McpTicketTools } from './tools/tickets.tools'

const SERVER_INSTRUCTIONS = `Bedones est un CRM social: il gère les commentaires et la messagerie (DM) sur Facebook, Instagram, TikTok et WhatsApp.
Cette connexion agit pour UNE organisation, choisie lors de l'autorisation (voir get_active_organisation; list_organisations pour les autres).
Utilise list_social_accounts pour obtenir les IDs de comptes, list_conversations / list_posts pour explorer, puis send_message / reply_to_comment pour répondre.
Les actions destructrices (delete_comment, update_page_settings, add_faq_rule) requièrent un rôle administrateur.`

/**
 * MCP server exposing Bedones features as tools for Claude Connectors and the
 * ChatGPT Apps SDK. Mounted at /mcp with an OAuth 2.1 layer bridged to the
 * existing User/Session/Organisation model (see ./auth).
 *
 * Declared @Global so the auto-generated mcp-nest transport controller can
 * resolve {@link McpAuthGuard} (mcp-nest applies the guard via UseGuards but
 * does not register it as a provider itself).
 */
@Global()
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    SocialModule,
    McpModule.forRoot({
      name: 'bedones-social-crm',
      version: '0.1.0',
      instructions: SERVER_INSTRUCTIONS,
      transport: [McpTransportType.STREAMABLE_HTTP, McpTransportType.SSE],
      mcpEndpoint: 'mcp',
      guards: [McpAuthGuard],
    }),
  ],
  controllers: [WellKnownController, McpOAuthController],
  providers: [
    McpOAuthService,
    McpAuthGuard,
    McpOrgTools,
    McpMessagingTools,
    McpCommentsTools,
    McpCatalogTools,
    McpTicketTools,
    McpContextTools,
  ],
  // Exported (module is @Global) so the auto-generated mcp-nest transport
  // controller can instantiate McpAuthGuard *and* resolve its dependency on
  // McpOAuthService from its own module injector.
  exports: [McpAuthGuard, McpOAuthService],
})
export class BedonesMcpModule {}
