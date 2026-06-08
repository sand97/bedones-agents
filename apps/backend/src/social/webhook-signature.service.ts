import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class WebhookSignatureService {
  private readonly logger = new Logger(WebhookSignatureService.name)
  private readonly facebookAppSecret: string
  private readonly instagramAppSecret: string
  private readonly whatsappAppSecret: string

  constructor(private configService: ConfigService) {
    this.facebookAppSecret = this.configService.getOrThrow<string>('FACEBOOK_APP_SECRET')
    this.instagramAppSecret = this.configService.getOrThrow<string>('INSTAGRAM_APP_SECRET')
    this.whatsappAppSecret = this.configService.getOrThrow<string>('FACEBOOK_APP_SECRET')
  }

  // ─── Signature verification ───

  async verifyFacebookSignature(rawBody: Buffer, signature: string): Promise<boolean> {
    return this.verifySignature(rawBody, signature, this.facebookAppSecret)
  }

  async verifyInstagramSignature(rawBody: Buffer, signature: string): Promise<boolean> {
    return this.verifySignature(rawBody, signature, this.instagramAppSecret)
  }

  async verifyWhatsAppSignature(rawBody: Buffer, signature: string): Promise<boolean> {
    return this.verifySignature(rawBody, signature, this.whatsappAppSecret)
  }

  async verifyTikTokSignature(rawBody: Buffer, signature: string): Promise<boolean> {
    const parsed = this.parseTikTokSignature(signature)
    if (!parsed) return false

    const configuredToleranceSeconds = Number(
      this.configService.get<string>('TIKTOK_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS', '300'),
    )
    const toleranceSeconds = Number.isFinite(configuredToleranceSeconds)
      ? configuredToleranceSeconds
      : 300
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - parsed.timestamp) > toleranceSeconds) {
      this.logger.warn('[TikTok Webhook] Signature timestamp outside tolerance')
      return false
    }

    const clientSecret = this.configService.getOrThrow<string>('TIKTOK_CLIENT_SECRET')
    const signedPayload = `${parsed.timestamp}.${rawBody.toString('utf8')}`
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(clientSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload))
    const computedSignature = Array.from(new Uint8Array(signed))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    return this.safeEqualHex(computedSignature, parsed.signature)
  }

  private parseTikTokSignature(signature: string): { timestamp: number; signature: string } | null {
    const parts = new Map(
      signature.split(',').map((part) => {
        const [key, ...value] = part.trim().split('=')
        return [key, value.join('=')] as const
      }),
    )
    const timestamp = Number(parts.get('t'))
    const signed = parts.get('s')
    if (!Number.isFinite(timestamp) || !signed) return null
    return { timestamp, signature: signed }
  }

  private safeEqualHex(left: string, right: string): boolean {
    if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) return false
    const leftBytes = new Uint8Array(left.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) ?? [])
    const rightBytes = new Uint8Array(right.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) ?? [])
    if (leftBytes.length !== rightBytes.length) return false
    let diff = 0
    for (let i = 0; i < leftBytes.length; i++) {
      diff |= leftBytes[i] ^ rightBytes[i]
    }
    return diff === 0
  }

  private async verifySignature(
    rawBody: Buffer,
    signature: string,
    secret: string,
  ): Promise<boolean> {
    if (!signature?.startsWith('sha256=')) return false

    const expectedSignature = signature.slice(7) // Remove "sha256=" prefix
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )

    const signed = await crypto.subtle.sign('HMAC', key, new Uint8Array(rawBody))
    const computedSignature = Array.from(new Uint8Array(signed))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    return computedSignature === expectedSignature
  }
}
