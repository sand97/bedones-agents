import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Request } from 'express'

/** Scope embedded in the per-migration callback token. */
export const MIGRATION_CALLBACK_SCOPE = 'catalog-migration-callback'

interface CallbackRequest extends Request {
  migrationId?: string
}

interface CallbackTokenPayload {
  migrationId?: string
  scope?: string
}

/**
 * Authenticates the page-script callbacks (`upload-image`, `save-catalog`).
 * The token is a short-lived JWT minted per migration job; it scopes the caller
 * to a single migrationId, which we attach to the request.
 */
@Injectable()
export class CatalogMigrationCallbackGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<CallbackRequest>()
    const header = req.headers['authorization']
    const token =
      typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) throw new UnauthorizedException('Missing callback token')

    let payload: CallbackTokenPayload
    try {
      payload = this.jwt.verify<CallbackTokenPayload>(token)
    } catch {
      throw new UnauthorizedException('Invalid callback token')
    }

    if (payload?.scope !== MIGRATION_CALLBACK_SCOPE || !payload.migrationId) {
      throw new UnauthorizedException('Invalid callback token scope')
    }

    req.migrationId = payload.migrationId
    return true
  }
}

/** Resolves the migrationId attached by CatalogMigrationCallbackGuard. */
export const CallbackMigrationId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<CallbackRequest>()
    return req.migrationId as string
  },
)
