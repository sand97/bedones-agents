import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import type { Request, Response } from 'express'
import { PrismaService } from '../../prisma/prisma.service'
import { McpOAuthService } from './mcp-oauth.service'
import { roleHierarchy, type OrgRoleName } from '../mcp-context'

/**
 * Bearer-token guard for the MCP transport, analogous to {@link AuthGuard} but
 * for OAuth 2.1 access tokens. On success it attaches `request.user` (shape
 * consumed by mcp-nest tool filtering and by `mcpContext()`). On a missing
 * token it emits the `WWW-Authenticate` header so MCP clients start the OAuth
 * flow.
 */
@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(
    private readonly oauth: McpOAuthService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>()
    const response = context.switchToHttp().getResponse<Response>()

    const header = request.headers['authorization']
    const bearer =
      typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null

    if (!bearer) {
      this.challenge(response)
      throw new UnauthorizedException('missing_bearer_token')
    }

    const { userId, organisationId, scope } = await this.oauth.verifyAccessToken(bearer)

    // Re-validate membership on every call: the org could have been left or the
    // member deactivated since the token was issued.
    const membership = await this.prisma.organisationMember.findUnique({
      where: { userId_organisationId: { userId, organisationId } },
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    if (!membership || membership.status !== 'ACTIVE') {
      this.challenge(response)
      throw new UnauthorizedException('membership_revoked')
    }

    const role = membership.role as OrgRoleName
    ;(request as Request & { user: unknown }).user = {
      sub: userId,
      org: organisationId,
      roles: roleHierarchy(role),
      scope,
      name: membership.user.name,
      email: membership.user.email ?? undefined,
    }
    return true
  }

  private challenge(response: Response): void {
    response.setHeader(
      'WWW-Authenticate',
      `Bearer resource_metadata="${this.oauth.issuer}/.well-known/oauth-protected-resource"`,
    )
  }
}
