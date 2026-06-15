import { Global, Module } from '@nestjs/common'
import { McpModule, McpTransportType } from '@rekog/mcp-nest'

import { ImageProcessingModule } from '../image-processing/image-processing.module'
import { AgentPromptsService } from '../agent/prompts/agent-prompts.service'
import { DebugMcpAuthGuard } from './auth/debug-mcp-auth.guard'
import { DebugAgentTools } from './tools/agent-sim.tools'
import { DebugDbTools } from './tools/db-read.tools'
import { DebugQdrantTools } from './tools/qdrant-inspect.tools'
import { DebugCatalogTools } from './tools/catalog-write.tools'
import { DebugWellKnownController } from './debug-well-known.controller'

const DEBUG_SERVER_INSTRUCTIONS = `Serveur MCP de DEBUG (interne), totalement distinct du MCP de prod.
Il est verrouillé sur UNE seule organisation (DEBUG_MCP_ORG_ID) — impossible de lire les données d'une autre.
Outils:
- chat_with_agent: fait tourner l'agent live sur un message en DRY-RUN (rien n'est envoyé ni écrit) et renvoie la trace complète (tool calls, résultats, réponse, écritures simulées).
- list_tables / read_table / list_products: lecture seule de tables scopées à l'org (champs sensibles masqués).
- qdrant_list_indexed / qdrant_get_point: inspection du contenu indexé dans Qdrant.
- reindex_catalog: re-synchronise le catalogue depuis Meta et SUPPRIME de Qdrant tout point absent de Meta (purge des produits de test / obsolètes).`

/**
 * A SECOND, isolated MCP server mounted at /debug-mcp, with its OWN tool
 * registry (mcp-nest scopes tool discovery to the providers of the module that
 * imports forRoot) and its OWN guard. Auth reuses the production Bedones OAuth
 * (so Claude / ChatGPT connectors can drive it) but is LOCKED to a single
 * env-pinned org (DEBUG_MCP_ORG_ID). Shares NO tools with the production /mcp
 * surface. Only mounted when DEBUG_MCP_ENABLED=true (see AppModule). Declared
 * @Global so the auto-generated mcp-nest transport controller can resolve
 * {@link DebugMcpAuthGuard}.
 */
@Global()
@Module({
  imports: [
    ImageProcessingModule,
    McpModule.forRoot({
      name: 'bedones-debug',
      version: '0.1.0',
      instructions: DEBUG_SERVER_INSTRUCTIONS,
      transport: [McpTransportType.STREAMABLE_HTTP],
      mcpEndpoint: 'debug-mcp',
      guards: [DebugMcpAuthGuard],
    }),
  ],
  controllers: [DebugWellKnownController],
  providers: [
    DebugMcpAuthGuard,
    AgentPromptsService,
    DebugAgentTools,
    DebugDbTools,
    DebugQdrantTools,
    DebugCatalogTools,
  ],
  exports: [DebugMcpAuthGuard],
})
export class DebugMcpModule {}
