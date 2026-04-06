import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common'
import { Response } from 'express'
import { I18nContext } from 'nestjs-i18n'
import { Prisma } from 'generated/prisma/client'

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaNotFoundFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const i18n = I18nContext.current()

    if (exception.code === 'P2025') {
      response.status(HttpStatus.NOT_FOUND).json({
        statusCode: HttpStatus.NOT_FOUND,
        message: i18n?.t('errors.common.not_found') ?? 'Resource not found',
      })
      return
    }

    // Re-throw other Prisma errors as 500
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: i18n?.t('errors.common.internal_error') ?? 'Internal server error',
    })
  }
}
