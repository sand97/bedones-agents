import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { timingSafeEqual } from 'crypto'

import { PrismaService } from '../../prisma/prisma.service'
import { McpOAuthService } from '../../mcp/auth/mcp-oauth.service'
import { debugOrgId, isDebugMcpEnabled } from '../debug-context'

/**
 * Auth for the debug MCP. It reuses the production Bedones OAuth 2.1 stack — the
 * only mechanism Claude / ChatGPT custom connectors can drive — but LOCKS access
 * to a single organisation: a token issued for any org other than
 * `DEBUG_MCP_ORG_ID` is rejected, so no other company's data is ever reachable.
 *
 * A static bearer (`DEBUG_MCP_TOKEN`, optional) is also accepted as an escape
 * hatch for non-OAuth clients (CLI / Codex). The whole server is OFF unless
 * `DEBUG_MCP_ENABLED=true`.
 */
@Injectable()
export class DebugMcpAuthGuard implements CanActivate {
  constructor(
    private readonly oauth: McpOAuthService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!isDebugMcpEnabled()) {
      throw new UnauthorizedException('debug_mcp_disabled')
    }

    const request = context.switchToHttp().getRequest<Request>()
    const response = context.switchToHttp().getResponse<Response>()

    const header = request.headers['authorization']
    const bearer =
      typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null

    if (!bearer) {
      this.challenge(response)
      throw new UnauthorizedException('missing_bearer_token')
    }

    // Escape hatch: a static token for non-OAuth clients (CLI / Codex).
    const staticToken = process.env.DEBUG_MCP_TOKEN
    if (staticToken && safeEqual(bearer, staticToken)) {
      return true
    }

    // Otherwise: a normal Bedones OAuth access token, locked to the pinned org.
    let userId: string
    let organisationId: string
    try {
      const verified = await this.oauth.verifyAccessToken(bearer)
      userId = verified.userId
      organisationId = verified.organisationId
    } catch {
      this.challenge(response)
      throw new UnauthorizedException('invalid_token')
    }

    const pinnedOrg = debugOrgId()
    if (organisationId !== pinnedOrg) {
      throw new ForbiddenException(
        `The debug connector is restricted to organisation ${pinnedOrg}. Reconnect and pick that organisation.`,
      )
    }

    // Re-validate membership on every call (mirrors the production MCP guard).
    const membership = await this.prisma.organisationMember.findUnique({
      where: { userId_organisationId: { userId, organisationId: pinnedOrg } },
      select: { status: true },
    })
    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenException('not_an_active_member_of_the_debug_organisation')
    }

    return true
  }

  private challenge(response: Response): void {
    response.setHeader(
      'WWW-Authenticate',
      `Bearer resource_metadata="${this.oauth.issuer}/.well-known/oauth-protected-resource/debug-mcp"`,
    )
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}
