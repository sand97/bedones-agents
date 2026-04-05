import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  Logger,
  ForbiddenException,
  RawBody,
} from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
import { Request, Response } from 'express'
import { WebhookService } from './webhook.service'

@ApiExcludeController()
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name)
  private readonly fbVerifyToken: string
  private readonly igVerifyToken: string
  private readonly waVerifyToken: string

  constructor(
    private webhookService: WebhookService,
    private configService: ConfigService,
  ) {
    this.fbVerifyToken = this.configService.getOrThrow<string>('FACEBOOK_WEBHOOK_VERIFY_TOKEN')
    this.igVerifyToken = this.configService.getOrThrow<string>('INSTAGRAM_WEBHOOK_VERIFY_TOKEN')
    this.waVerifyToken = this.configService.get<string>('WHATSAPP_WEBHOOK_VERIFY_TOKEN', '')
  }

  // ─── Facebook webhook verification ───

  @Get('facebook')
  facebookVerify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    if (mode === 'subscribe' && token === this.fbVerifyToken) {
      this.logger.log('[Facebook Webhook] Verification successful')
      return res.status(200).send(challenge)
    }

    this.logger.error('[Facebook Webhook] Verification failed — invalid token')
    throw new ForbiddenException('Invalid verify token')
  }

  // ─── Facebook webhook events ───

  @Post('facebook')
  async facebookEvent(@Req() req: Request, @RawBody() rawBody: Buffer, @Res() res: Response) {
    // Respond immediately to avoid timeout
    res.status(200).send('EVENT_RECEIVED')

    // Verify signature
    const signature = req.headers['x-hub-signature-256'] as string
    if (signature) {
      const valid = await this.webhookService.verifyFacebookSignature(rawBody, signature)
      if (!valid) {
        this.logger.error('[Facebook Webhook] Invalid signature')
        return
      }
    }

    // Process asynchronously
    try {
      this.logger.log(`[Facebook Webhook] Payload: ${JSON.stringify(req.body, null, 2)}`)
      await this.webhookService.processFacebookWebhook(req.body)
    } catch (error) {
      this.logger.error('[Facebook Webhook] Processing error:', error)
    }
  }

  // ─── Instagram webhook verification ───

  @Get('instagram')
  instagramVerify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    if (mode === 'subscribe' && token === this.igVerifyToken) {
      this.logger.log('[Instagram Webhook] Verification successful')
      return res.status(200).send(challenge)
    }

    this.logger.error('[Instagram Webhook] Verification failed — invalid token')
    throw new ForbiddenException('Invalid verify token')
  }

  // ─── Instagram webhook events ───

  @Post('instagram')
  async instagramEvent(@Req() req: Request, @RawBody() rawBody: Buffer, @Res() res: Response) {
    // Respond immediately
    res.status(200).send('EVENT_RECEIVED')

    // Verify signature
    const signature = req.headers['x-hub-signature-256'] as string
    if (signature) {
      const valid = await this.webhookService.verifyInstagramSignature(rawBody, signature)
      if (!valid) {
        this.logger.error('[Instagram Webhook] Invalid signature')
        return
      }
    }

    // Process asynchronously
    try {
      this.logger.log(`[Instagram Webhook] Payload: ${JSON.stringify(req.body, null, 2)}`)
      await this.webhookService.processInstagramWebhook(req.body)
    } catch (error) {
      this.logger.error('[Instagram Webhook] Processing error:', error)
    }
  }

  // ─── WhatsApp webhook verification ───

  @Get('whatsapp')
  whatsappVerify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    if (mode === 'subscribe' && token === this.waVerifyToken) {
      this.logger.log('[WhatsApp Webhook] Verification successful')
      return res.status(200).send(challenge)
    }

    this.logger.error('[WhatsApp Webhook] Verification failed — invalid token')
    throw new ForbiddenException('Invalid verify token')
  }

  // ─── WhatsApp webhook events ───

  @Post('whatsapp')
  async whatsappEvent(@Req() req: Request, @RawBody() rawBody: Buffer, @Res() res: Response) {
    // Respond immediately to avoid timeout
    res.status(200).send('EVENT_RECEIVED')

    // Verify signature
    const signature = req.headers['x-hub-signature-256'] as string
    if (signature) {
      const valid = await this.webhookService.verifyWhatsAppSignature(rawBody, signature)
      if (!valid) {
        this.logger.error('[WhatsApp Webhook] Invalid signature')
        return
      }
    }

    // Process asynchronously
    try {
      this.logger.log(`[WhatsApp Webhook] Payload: ${JSON.stringify(req.body, null, 2)}`)
      await this.webhookService.processWhatsAppWebhook(req.body)
    } catch (error) {
      this.logger.error('[WhatsApp Webhook] Processing error:', error)
    }
  }
}
