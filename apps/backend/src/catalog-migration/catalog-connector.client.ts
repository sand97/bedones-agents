import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

/**
 * A single product as returned by the whatsapp-connector when extracting the
 * *public* catalogue of a WhatsApp number. Image URLs are already re-hosted by
 * the connector (e.g. presigned Minio URLs) so that Meta can fetch them — the
 * raw WhatsApp CDN URLs are short-lived and auth-gated and would be rejected.
 */
export interface ConnectorProduct {
  retailerId?: string
  name: string
  description?: string
  price?: string | number | null
  currency?: string | null
  availability?: string | null
  imageUrl?: string | null
  additionalImageUrls?: string[]
}

export interface ConnectorCatalogResponse {
  phoneNumber: string
  productCount: number
  products: ConnectorProduct[]
}

/**
 * Thin HTTP client for the external `whatsapp-connector` (wppconnect) service.
 * One of our own WhatsApp numbers is connected on that service (QR scanned from
 * the terminal); because WhatsApp Business catalogues are public, it can read
 * the catalogue of any business number we point it at.
 *
 * Configuration (env):
 *   - WHATSAPP_CATALOG_CONNECTOR_URL  base URL of the connector (e.g. http://wpp-connector:3001)
 *   - WHATSAPP_CONNECTOR_SECRET       optional bearer/signature secret sent as `x-connector-secret`
 */
@Injectable()
export class CatalogConnectorClient {
  private readonly logger = new Logger(CatalogConnectorClient.name)

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    const url = this.config.get<string>('WHATSAPP_CATALOG_CONNECTOR_URL')
    if (!url) {
      throw new ServiceUnavailableException(
        'WHATSAPP_CATALOG_CONNECTOR_URL is not configured — the catalogue connector service is unavailable',
      )
    }
    return url.replace(/\/+$/, '')
  }

  /** Digits only, no '+', no spaces — the connector turns this into a `<wid>@c.us`. */
  private sanitizePhone(phone: string): string {
    return (phone || '').replace(/[^0-9]/g, '')
  }

  /**
   * Fetch the public catalogue of a WhatsApp number through the connector.
   * Throws ServiceUnavailableException on transport/HTTP errors so the Bull job
   * fails cleanly and the migration is marked FAILED.
   */
  async fetchPublicCatalog(phone: string): Promise<ConnectorProduct[]> {
    const sanitized = this.sanitizePhone(phone)
    const secret = this.config.get<string>('WHATSAPP_CONNECTOR_SECRET')
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (secret) headers['x-connector-secret'] = secret

    const url = `${this.baseUrl}/catalog/public/${sanitized}`
    this.logger.log(`Fetching public catalogue for ${sanitized} via connector`)

    let response: Response
    try {
      response = await fetch(url, { method: 'GET', headers })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(`Connector request failed: ${message}`)
      throw new ServiceUnavailableException(`Catalogue connector unreachable: ${message}`)
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      this.logger.error(`Connector returned ${response.status}: ${body}`)
      throw new ServiceUnavailableException(
        `Catalogue connector error (${response.status}): ${body || response.statusText}`,
      )
    }

    const payload = (await response.json()) as Partial<ConnectorCatalogResponse>
    const products = Array.isArray(payload.products) ? payload.products : []
    this.logger.log(`Connector returned ${products.length} product(s) for ${sanitized}`)
    return products
  }
}
