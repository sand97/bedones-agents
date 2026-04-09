import { Body, Controller, Get, Logger, Post, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
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
  ) {
    const verifyToken = this.config.get<string>('FACEBOOK_WEBHOOK_VERIFY_TOKEN')
    if (mode === 'subscribe' && token === verifyToken) {
      this.logger.log('Catalog webhook verified')
      return challenge
    }
    return 'Verification failed'
  }

  /** Facebook webhook payload (POST) */
  @Post()
  async handleWebhook(@Body() body: Record<string, unknown>) {
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

    return 'OK'
  }
}
