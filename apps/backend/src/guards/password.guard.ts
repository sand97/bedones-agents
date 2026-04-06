import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  mixin,
} from '@nestjs/common'
import { I18nContext } from 'nestjs-i18n'

export default function PasswordGuard(passwordEnvKey = 'MIGRATION_TOKEN') {
  @Injectable()
  class PasswordGuardClass implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const request = context.switchToHttp().getRequest()
      const password: string = request.body?.token ?? request.query?.token
      if (password && password === process.env[passwordEnvKey]) {
        return true
      }
      const i18n = I18nContext.current()
      throw new ForbiddenException(i18n?.t('errors.auth.invalid_token') ?? 'Invalid token')
    }
  }
  return mixin(PasswordGuardClass)
}
