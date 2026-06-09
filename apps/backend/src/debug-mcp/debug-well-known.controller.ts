import { Controller, Get } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { McpOAuthService } from '../mcp/auth/mcp-oauth.service'

/**
 * OAuth protected-resource metadata for the debug MCP. When a connector hits
 * /debug-mcp without a token, the guard challenges with a WWW-Authenticate
 * pointing here; the client then discovers the (shared, production) Bedones
 * authorization server. The `resource` points at /debug-mcp so strict clients
 * bind the token to the right resource.
 */
@ApiExcludeController()
@Controller('.well-known')
export class DebugWellKnownController {
  constructor(private readonly oauth: McpOAuthService) {}

  @Get('oauth-protected-resource/debug-mcp')
  protectedResourceDebug() {
    const issuer = this.oauth.issuer
    return {
      resource: `${issuer}/debug-mcp`,
      authorization_servers: [issuer],
      scopes_supported: this.oauth.supportedScopes,
    }
  }
}
