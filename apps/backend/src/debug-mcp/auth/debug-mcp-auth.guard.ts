import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'
import { timingSafeEqual } from 'crypto'
import { isDebugMcpEnabled } from '../debug-context'

/**
 * Auth for the debug MCP. Deliberately decoupled from the production MCP's OAuth
 * stack ("rien à voir avec le MCP de prod"): a single static bearer token
 * (`DEBUG_MCP_TOKEN`) gates the whole surface, and the server is OFF unless
 * `DEBUG_MCP_ENABLED=true`. The blast radius is bounded by design — every tool
 * is org-pinned (read-only or dry-run) — so a leaked token can at most read one
 * org's (masked) data and run the agent in dry-run.
 */
@Injectable()
export class DebugMcpAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!isDebugMcpEnabled()) {
      throw new UnauthorizedException('debug_mcp_disabled')
    }

    const expected = process.env.DEBUG_MCP_TOKEN
    if (!expected) {
      throw new UnauthorizedException('debug_mcp_token_not_configured')
    }

    const request = context.switchToHttp().getRequest<Request>()
    const header = request.headers['authorization']
    const bearer =
      typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null

    if (!bearer || !safeEqual(bearer, expected)) {
      throw new UnauthorizedException('invalid_debug_token')
    }
    return true
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}
