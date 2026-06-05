import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Request } from 'express'

/**
 * Ensures a caller targets the right connector instance. When
 * CONNECTOR_INSTANCE_ID is set, the request must carry a matching
 * `x-bedones-target-instance` header (sent by bedones-agents). When it is not
 * set, the guard is a no-op (useful for local dev).
 */
@Injectable()
export class TargetInstanceGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>()
    const expectedInstanceId = this.configService.get<string>('CONNECTOR_INSTANCE_ID')

    if (!expectedInstanceId) {
      return true
    }

    const receivedInstanceId = request.header('x-bedones-target-instance')
    if (!receivedInstanceId || receivedInstanceId !== expectedInstanceId) {
      throw new ForbiddenException('Invalid connector instance target')
    }

    return true
  }
}
