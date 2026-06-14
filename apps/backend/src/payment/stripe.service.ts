import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
// Le package `stripe` est un module CommonJS `export =` (le module EST le
// constructeur). Sans `esModuleInterop`, `import Stripe from 'stripe'` se
// compile en `stripe_1.default` (undefined au runtime → « not a constructor »).
// On utilise donc l'import `= require` qui pointe sur le constructeur lui-même.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Stripe = require('stripe')

// Le bundle de types CJS de stripe n'expose au niveau racine que le constructeur
// (et le type d'instance `Stripe.Stripe`) ; le namespace de ressources n'est pas
// réexporté. On dérive donc les types dont on a besoin depuis l'instance plutôt
// que de référencer `Stripe.Event` / `Stripe.Checkout.Session` directement.
export type StripeClient = Stripe.Stripe
export type StripeEvent = ReturnType<StripeClient['webhooks']['constructEvent']>

// Deux environnements Stripe distincts (clés + secret webhook séparés). Le mode
// ACTIF (sortant : création de checkouts) est piloté par STRIPE_MODE ; les
// webhooks, eux, sont routés par endpoint (/stripe = production,
// /stripe-sandbox = sandbox) et vérifiés avec le secret de leur mode.
export type StripeMode = 'sandbox' | 'production'

const MODE_ENV: Record<StripeMode, { secretEnv: string; webhookEnv: string }> = {
  production: { secretEnv: 'STRIPE_SECRET_KEY', webhookEnv: 'STRIPE_WEBHOOK_SECRET' },
  sandbox: { secretEnv: 'STRIPE_SANDBOX_SECRET_KEY', webhookEnv: 'STRIPE_SANDBOX_WEBHOOK_SECRET' },
}

/**
 * Fin wrapper autour du SDK Stripe, multi-mode (production + sandbox).
 *
 * Les clients sont initialisés de façon paresseuse et mis en cache par mode, à
 * partir des clés correspondantes : le backend démarre même sans Stripe
 * configuré (les endpoints renverront alors une 500 explicite), ce qui évite de
 * bloquer les environnements de dev/CI où les clés ne sont pas renseignées.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name)
  private readonly clients = new Map<StripeMode, StripeClient>()

  /** Mode sortant actif (création de checkouts). Défaut/fallback : production. */
  get activeMode(): StripeMode {
    return process.env.STRIPE_MODE === 'sandbox' ? 'sandbox' : 'production'
  }

  getClient(mode: StripeMode = this.activeMode): StripeClient {
    const cached = this.clients.get(mode)
    if (cached) return cached

    const secretKey = process.env[MODE_ENV[mode].secretEnv]
    if (!secretKey) {
      this.logger.error(
        `${MODE_ENV[mode].secretEnv} manquant — paiement Stripe (${mode}) indisponible`,
      )
      throw new InternalServerErrorException('Paiement indisponible : Stripe non configuré')
    }

    // apiVersion non épinglé : on suit la version par défaut du SDK installé,
    // ce qui garde les types et les webhooks cohérents avec cette dépendance.
    const client = new Stripe(secretKey, { appInfo: { name: 'Bedones Agents' } })
    this.clients.set(mode, client)
    return client
  }

  isConfigured(mode: StripeMode = this.activeMode): boolean {
    return Boolean(process.env[MODE_ENV[mode].secretEnv])
  }

  /**
   * Vérifie la signature d'un webhook Stripe (avec le secret du mode indiqué) et
   * renvoie l'événement typé. Lève une erreur si la signature est invalide ou le
   * secret absent.
   */
  constructWebhookEvent(rawBody: Buffer, signature: string, mode: StripeMode): StripeEvent {
    const webhookSecret = process.env[MODE_ENV[mode].webhookEnv]
    if (!webhookSecret) {
      this.logger.error(`${MODE_ENV[mode].webhookEnv} manquant — impossible de vérifier le webhook`)
      throw new InternalServerErrorException('Webhook Stripe non configuré')
    }
    return this.getClient(mode).webhooks.constructEvent(rawBody, signature, webhookSecret)
  }
}
