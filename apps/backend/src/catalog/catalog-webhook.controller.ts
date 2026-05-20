import {
  Controller,
  ForbiddenException,
  Get,
  Logger,
  Post,
  Query,
  RawBody,
  Req,
  Res,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
import { Request, Response } from 'express'
import { CatalogService } from './catalog.service'

/**
 * Webhook endpoint for external catalog changes (Facebook).
 * This controller is NOT guarded by AuthGuard since it receives calls from Meta.
 */
@ApiTags('Catalog Webhook')
@Controller('webhook/catalog')
export class CatalogWebhookController {
  private readonly logger = new Logger(CatalogWebhookController.name)

  constructor(
    private catalogService: CatalogService,
    private config: ConfigService,
  ) {}

  /** Facebook webhook verification (GET) */
  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const verifyToken = this.config.get<string>('FACEBOOK_WEBHOOK_VERIFY_TOKEN')
    if (mode === 'subscribe' && token === verifyToken) {
      this.logger.log('Catalog webhook verified')
      return res.status(200).send(challenge)
    }
    throw new ForbiddenException('Invalid verify token')
  }

  /** Facebook webhook payload (POST) */
  @Post()
  async handleWebhook(@Req() req: Request, @RawBody() rawBody: Buffer, @Res() res: Response) {
    const signature = req.headers['x-hub-signature-256'] as string | undefined
    const requireSignature =
      this.config.get<string>('CATALOG_WEBHOOK_REQUIRE_SIGNATURE', 'true') !== 'false'

    if (!signature && requireSignature) {
      this.logger.error('Catalog webhook missing signature')
      return res.status(403).send('MISSING_SIGNATURE')
    }

    if (signature) {
      const valid = await this.verifyMetaSignature(rawBody, signature)
      if (!valid) {
        this.logger.error('Catalog webhook invalid signature')
        return res.status(403).send('INVALID_SIGNATURE')
      }
    } else {
      this.logger.warn('Catalog webhook missing signature; processing because override is set')
    }

    const body = req.body as Record<string, unknown>
    this.logger.log(`Catalog webhook received: ${JSON.stringify(body).substring(0, 200)}`)

    const entries = (body.entry || []) as Array<{
      id: string
      changes?: Array<{ field: string; value: Record<string, unknown> }>
    }>

    for (const entry of entries) {
      const changes = entry.changes || []
      for (const change of changes) {
        if (change.field === 'product_catalog') {
          await this.catalogService.handleWebhookUpdate(entry.id, change.value)
        }
      }
    }

    return res.status(200).send('OK')
  }

  private async verifyMetaSignature(rawBody: Buffer, signature: string): Promise<boolean> {
    if (!signature?.startsWith('sha256=')) return false

    const expectedSignature = signature.slice(7)
    const appSecret = this.config.getOrThrow<string>('FACEBOOK_APP_SECRET')
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(appSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )

    const signed = await crypto.subtle.sign('HMAC', key, new Uint8Array(rawBody))
    const computedSignature = Array.from(new Uint8Array(signed))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')

    return this.safeEqual(computedSignature, expectedSignature)
  }

  private safeEqual(left: string, right: string): boolean {
    if (left.length !== right.length) return false
    let diff = 0
    for (let i = 0; i < left.length; i++) {
      diff |= left.charCodeAt(i) ^ right.charCodeAt(i)
    }
    return diff === 0
  }
}
