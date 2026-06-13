import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import Stripe from 'stripe'

// Le bundle de types CJS de stripe n'expose au niveau racine que le constructeur
// (et le type d'instance `Stripe.Stripe`) ; le namespace de ressources n'est pas
// réexporté. On dérive donc les types dont on a besoin depuis l'instance plutôt
// que de référencer `Stripe.Event` / `Stripe.Checkout.Session` directement.
export type StripeClient = Stripe.Stripe
export type StripeEvent = ReturnType<StripeClient['webhooks']['constructEvent']>

/**
 * Fin wrapper autour du SDK Stripe. Initialise le client de façon paresseuse à
 * partir de STRIPE_SECRET_KEY : le backend démarre même sans Stripe configuré
 * (les endpoints de paiement renverront alors une 500 explicite), ce qui évite
 * de bloquer les environnements de dev/CI où la clé n'est pas renseignée.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name)
  private client: StripeClient | null = null

  getClient(): StripeClient {
    if (this.client) return this.client

    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) {
      this.logger.error('STRIPE_SECRET_KEY manquant — paiement Stripe indisponible')
      throw new InternalServerErrorException('Paiement indisponible : Stripe non configuré')
    }

    // apiVersion non épinglé : on suit la version par défaut du SDK installé,
    // ce qui garde les types et les webhooks cohérents avec cette dépendance.
    this.client = new Stripe(secretKey, { appInfo: { name: 'Bedones Agents' } })
    return this.client
  }

  get isConfigured(): boolean {
    return Boolean(process.env.STRIPE_SECRET_KEY)
  }

  /**
   * Vérifie la signature d'un webhook Stripe et renvoie l'événement typé.
   * Lève une erreur si la signature est invalide ou le secret absent.
   */
  constructWebhookEvent(rawBody: Buffer, signature: string): StripeEvent {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET manquant — impossible de vérifier le webhook')
      throw new InternalServerErrorException('Webhook Stripe non configuré')
    }
    return this.getClient().webhooks.constructEvent(rawBody, signature, webhookSecret)
  }
}
