import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { createHmac, timingSafeEqual } from 'crypto'

// ⚠️ Contrat d'API NotchPay — à vérifier avec la doc/clé réelle du compte.
// Implémenté d'après l'API hébergée NotchPay v1 (https://api.notchpay.co) :
//   - POST /payments  (Authorization: <public_key>)  → renvoie authorization_url
//     + transaction.reference, comme une session Checkout.
//   - Webhook signé via header `x-notch-signature` = HMAC-SHA256(rawBody, hash).
// Les valeurs (base URL, clé, hash, devise, taux de conversion) sont toutes
// configurables par variables d'environnement pour s'adapter sans toucher au code.

export interface NotchpayInitParams {
  // Montant déjà converti dans la devise NotchPay (entier, ex. XAF sans décimales).
  amount: number
  currency: string
  email?: string | null
  phone?: string | null
  name?: string | null
  description: string
  // Référence idempotente côté Bedones (on réutilise l'id de la ligne Payment).
  reference: string
  callbackUrl: string
}

export interface NotchpayInitResult {
  authorizationUrl: string
  reference: string
}

@Injectable()
export class NotchpayService {
  private readonly logger = new Logger(NotchpayService.name)

  get isConfigured(): boolean {
    return Boolean(process.env.NOTCHPAY_PUBLIC_KEY)
  }

  private get baseUrl(): string {
    return (process.env.NOTCHPAY_BASE_URL ?? 'https://api.notchpay.co').replace(/\/$/, '')
  }

  get currency(): string {
    return process.env.NOTCHPAY_CURRENCY ?? 'XAF'
  }

  /**
   * Convertit un montant USD (devise de référence des forfaits) vers la devise
   * NotchPay (XAF par défaut), au taux NOTCHPAY_USD_RATE. Renvoie un entier
   * (mobile money XAF n'a pas de décimales).
   */
  toProviderAmount(usd: number): number {
    const rate = Number(process.env.NOTCHPAY_USD_RATE ?? '600')
    return Math.round(usd * rate)
  }

  /** Initialise un paiement hébergé et renvoie l'URL d'autorisation à ouvrir. */
  async initializePayment(params: NotchpayInitParams): Promise<NotchpayInitResult> {
    const publicKey = process.env.NOTCHPAY_PUBLIC_KEY
    if (!publicKey) {
      this.logger.error('NOTCHPAY_PUBLIC_KEY manquant — mobile money indisponible')
      throw new InternalServerErrorException(
        'Paiement mobile indisponible : NotchPay non configuré',
      )
    }

    const res = await fetch(`${this.baseUrl}/payments`, {
      method: 'POST',
      headers: {
        Authorization: publicKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: params.amount,
        currency: params.currency,
        description: params.description,
        reference: params.reference,
        callback: params.callbackUrl,
        customer: {
          email: params.email ?? undefined,
          phone: params.phone ?? undefined,
          name: params.name ?? undefined,
        },
      }),
    })

    const json = (await res.json().catch(() => ({}))) as {
      authorization_url?: string
      transaction?: { reference?: string }
      message?: string
    }
    if (!res.ok || !json.authorization_url) {
      this.logger.error(`Échec init NotchPay (${res.status}): ${JSON.stringify(json)}`)
      throw new InternalServerErrorException('Échec de création du paiement mobile money')
    }

    return {
      authorizationUrl: json.authorization_url,
      reference: json.transaction?.reference ?? params.reference,
    }
  }

  /**
   * Vérifie la signature HMAC-SHA256 d'un webhook NotchPay (header
   * `x-notch-signature`) calculée sur le corps BRUT avec la clé NOTCHPAY_HASH.
   */
  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
    const hashKey = process.env.NOTCHPAY_HASH
    if (!hashKey) {
      this.logger.error('NOTCHPAY_HASH manquant — impossible de vérifier le webhook NotchPay')
      return false
    }
    if (!signature) return false
    const expected = createHmac('sha256', hashKey).update(rawBody).digest('hex')
    try {
      const a = Buffer.from(expected)
      const b = Buffer.from(signature)
      return a.length === b.length && timingSafeEqual(a, b)
    } catch {
      return false
    }
  }
}
