import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

const IV_LENGTH = 12 // AES-GCM uses 12 bytes IV

@Injectable()
export class EncryptionService {
  private readonly secret: string

  constructor(private configService: ConfigService) {
    this.secret = this.configService.getOrThrow<string>('SESSION_SECRET')
  }

  private async getKey(): Promise<CryptoKey> {
    const encoder = new TextEncoder()
    const keyMaterial = encoder.encode(this.secret.padEnd(32, '0').slice(0, 32))

    return crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, [
      'encrypt',
      'decrypt',
    ])
  }

  async encrypt(text: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(text)
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
    const key = await this.getKey()

    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)

    const combined = new Uint8Array(iv.length + encrypted.byteLength)
    combined.set(iv, 0)
    combined.set(new Uint8Array(encrypted), iv.length)

    return Array.from(combined)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }

  async decrypt(text: string): Promise<string> {
    const bytes = new Uint8Array(text.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)))

    const iv = bytes.slice(0, IV_LENGTH)
    const data = bytes.slice(IV_LENGTH)
    const key = await this.getKey()

    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)

    return new TextDecoder().decode(decrypted)
  }
}
