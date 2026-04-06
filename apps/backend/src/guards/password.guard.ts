import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  mixin,
} from '@nestjs/common'

export default function PasswordGuard(passwordEnvKey = 'MIGRATION_TOKEN') {
  @Injectable()
  class PasswordGuardClass implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const request = context.switchToHttp().getRequest()
      const password: string = request.body?.token ?? request.query?.token
      if (password && password === process.env[passwordEnvKey]) {
        return true
      }
      throw new ForbiddenException('Invalid token')
    }
  }
  return mixin(PasswordGuardClass)
}
