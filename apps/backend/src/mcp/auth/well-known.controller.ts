import { Controller, Get } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { McpOAuthService } from './mcp-oauth.service'

/**
 * OAuth 2.1 discovery documents required by MCP clients (Claude Connectors,
 * ChatGPT Apps SDK). Served at the root of `MCP_PUBLIC_URL`.
 */
@ApiExcludeController()
@Controller('.well-known')
export class WellKnownController {
  constructor(private readonly oauth: McpOAuthService) {}

  @Get('oauth-authorization-server')
  authorizationServer() {
    const issuer = this.oauth.issuer
    return {
      issuer,
      authorization_endpoint: `${issuer}/mcp/oauth/authorize`,
      token_endpoint: `${issuer}/mcp/oauth/token`,
      registration_endpoint: `${issuer}/mcp/oauth/register`,
      revocation_endpoint: `${issuer}/mcp/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: this.oauth.supportedScopes,
    }
  }

  @Get('oauth-protected-resource')
  protectedResource() {
    const issuer = this.oauth.issuer
    return {
      resource: `${issuer}/mcp`,
      authorization_servers: [issuer],
      scopes_supported: this.oauth.supportedScopes,
    }
  }

  // Some clients append the resource path to the protected-resource document.
  @Get('oauth-protected-resource/mcp')
  protectedResourceMcp() {
    return this.protectedResource()
  }
}
