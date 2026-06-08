import { Injectable } from '@nestjs/common'
import { WebhookSignatureService } from './webhook-signature.service'
import { MetaWebhookService } from './meta-webhook.service'
import { WhatsAppWebhookService } from './whatsapp-webhook.service'
import { TikTokWebhookService } from './tiktok-webhook.service'
import type {
  FacebookWebhookPayload,
  InstagramWebhookPayload,
  WhatsAppWebhookPayload,
  TikTokWebhookPayload,
} from './webhook.types'

// Re-exported for the modules/services that historically imported these symbols
// from `./webhook.service`. Keep them importable here so external imports stay
// stable after the facade refactor.
export type { IncomingMessageEvent } from './webhook.types'

/**
 * Thin facade over the focused webhook sub-services. Every public method here
 * delegates to the appropriate sub-service. The webhook controllers
 * (WebhookController, TikTokWebhookController) depend on `WebhookService`, so its
 * public surface must stay stable.
 */
@Injectable()
export class WebhookService {
  constructor(
    private readonly signature: WebhookSignatureService,
    private readonly meta: MetaWebhookService,
    private readonly whatsapp: WhatsAppWebhookService,
    private readonly tiktok: TikTokWebhookService,
  ) {}

  // ─── Signature verification ───

  verifyFacebookSignature(rawBody: Buffer, signature: string): Promise<boolean> {
    return this.signature.verifyFacebookSignature(rawBody, signature)
  }

  verifyInstagramSignature(rawBody: Buffer, signature: string): Promise<boolean> {
    return this.signature.verifyInstagramSignature(rawBody, signature)
  }

  verifyWhatsAppSignature(rawBody: Buffer, signature: string): Promise<boolean> {
    return this.signature.verifyWhatsAppSignature(rawBody, signature)
  }

  verifyTikTokSignature(rawBody: Buffer, signature: string): Promise<boolean> {
    return this.signature.verifyTikTokSignature(rawBody, signature)
  }

  // ─── Webhook processing ───

  processFacebookWebhook(payload: FacebookWebhookPayload) {
    return this.meta.processFacebookWebhook(payload)
  }

  processInstagramWebhook(payload: InstagramWebhookPayload) {
    return this.meta.processInstagramWebhook(payload)
  }

  processWhatsAppWebhook(payload: WhatsAppWebhookPayload) {
    return this.whatsapp.processWhatsAppWebhook(payload)
  }

  processTikTokWebhook(payload: TikTokWebhookPayload) {
    return this.tiktok.processTikTokWebhook(payload)
  }
}
