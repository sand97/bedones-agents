import { ForbiddenException, UnauthorizedException } from '@nestjs/common'

export type OrgRoleName = 'OWNER' | 'ADMIN' | 'MEMBER'

/**
 * Shape attached to `request.user` by {@link McpAuthGuard}. The `roles` array is
 * a *hierarchy* (e.g. an OWNER carries `['OWNER','ADMIN','MEMBER']`) so that
 * mcp-nest's `requiredRoles` filtering and our own checks behave intuitively.
 */
export interface McpUserPayload {
  sub: string // Bedones userId
  org: string // active organisationId
  roles: OrgRoleName[]
  scope?: string
  name?: string
  email?: string
}

export interface McpContext {
  userId: string
  organisationId: string
  role: OrgRoleName
}

/**
 * Build the role hierarchy used both for tool filtering and authorization.
 */
export function roleHierarchy(role: OrgRoleName): OrgRoleName[] {
  switch (role) {
    case 'OWNER':
      return ['OWNER', 'ADMIN', 'MEMBER']
    case 'ADMIN':
      return ['ADMIN', 'MEMBER']
    default:
      return ['MEMBER']
  }
}

/**
 * Extract the authenticated MCP context from the raw Express request that
 * mcp-nest forwards as the 3rd argument of every `@Tool` method.
 */
export function mcpContext(request: unknown): McpContext {
  const user = (request as { user?: McpUserPayload } | undefined)?.user
  if (!user?.sub || !user?.org) {
    throw new UnauthorizedException('Contexte MCP manquant (token invalide).')
  }
  return {
    userId: user.sub,
    organisationId: user.org,
    role: user.roles?.[0] ?? 'MEMBER',
  }
}

/** Guard a tool against non-admin callers. */
export function requireAdmin(ctx: McpContext): void {
  if (ctx.role !== 'OWNER' && ctx.role !== 'ADMIN') {
    throw new ForbiddenException("Action réservée aux administrateurs de l'organisation.")
  }
}
