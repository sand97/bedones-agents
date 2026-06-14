import { Controller, Headers, HttpCode, Logger, Post, RawBody, Res } from '@nestjs/common'
import type { Response } from 'express'
import { ApiExcludeEndpoint } from '@nestjs/swagger'
import { StripeService, type StripeEvent, type StripeMode } from './stripe.service'
import { SubscriptionService } from './subscription.service'

/**
 * Endpoints webhook Stripe. PAS d'AuthGuard (Stripe appelle de serveur à serveur)
 * — l'authenticité est garantie par la vérification de signature sur le corps
 * BRUT (rawBody, capturé grâce à `rawBody: true` dans main.ts).
 *
 * Deux routes, une par environnement Stripe (clés + secret webhook distincts) :
 *   - POST /payment/webhook/stripe          → production
 *   - POST /payment/webhook/stripe-sandbox  → sandbox
 * Le mode détermine quel secret de signature et quel client Stripe sont utilisés
 * pour vérifier puis traiter l'événement.
 */
@Controller('payment/webhook')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name)

  constructor(
    private stripe: StripeService,
    private subscriptionService: SubscriptionService,
  ) {}

  @Post('stripe')
  @ApiExcludeEndpoint()
  @HttpCode(200)
  async handleStripe(
    @RawBody() rawBody: Buffer,
    @Headers('stripe-signature') signature: string,
    @Res() res: Response,
  ) {
    return this.process('production', rawBody, signature, res)
  }

  @Post('stripe-sandbox')
  @ApiExcludeEndpoint()
  @HttpCode(200)
  async handleStripeSandbox(
    @RawBody() rawBody: Buffer,
    @Headers('stripe-signature') signature: string,
    @Res() res: Response,
  ) {
    return this.process('sandbox', rawBody, signature, res)
  }

  private async process(mode: StripeMode, rawBody: Buffer, signature: string, res: Response) {
    let event: StripeEvent
    try {
      event = this.stripe.constructWebhookEvent(rawBody, signature, mode)
    } catch (err) {
      this.logger.error(`Vérification de signature webhook Stripe (${mode}) échouée: ${err}`)
      return res
        .status(400)
        .send(`Webhook Error: ${err instanceof Error ? err.message : 'invalide'}`)
    }

    try {
      await this.subscriptionService.handleWebhookEvent(event, mode)
      return res.json({ received: true })
    } catch (err) {
      // 500 → Stripe réessaiera la livraison du webhook.
      this.logger.error(`Erreur de traitement du webhook ${event.type} (${mode}): ${err}`)
      return res.status(500).json({ error: 'Webhook processing failed' })
    }
  }
}
