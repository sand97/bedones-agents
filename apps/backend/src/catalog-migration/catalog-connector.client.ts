import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

/** One image of an extracted product (base64 data URL downloaded in-browser). */
export interface ExtractedProductImage {
  index: number
  type: string
  /** `data:image/...;base64,...` */
  data: string
}

/**
 * A product extracted from a WhatsApp number's public catalogue by the page
 * script. Price is in major currency units (WhatsApp stores it as 1/1000).
 */
export interface ExtractedProduct {
  id: string
  name: string
  description?: string | null
  price?: number | null
  currency?: string | null
  availability?: string | null
  retailerId?: string | null
  images: ExtractedProductImage[]
}

/**
 * Page script injected into the connected WhatsApp Web session to read the
 * *public* catalogue of a target number. Adapted from the proven
 * `getCatalog.ts` script — the key difference is that we target the client's
 * wid (`{{CLIENT_USER_ID}}`) instead of `window.WPP.conn.getMyUserId()`, and we
 * return the products + images inline instead of POSTing them to a backend.
 *
 * It is an IIFE expression so the connector's `page.evaluate(script)` resolves
 * to its return value.
 */
const CLIENT_CATALOG_SCRIPT = `(async () => {
  const CLIENT_USER_ID = '{{CLIENT_USER_ID}}';
  const toPriceAmount1000 = (p) => {
    const raw = p.priceAmount1000 ?? p.price_amount_1000 ?? p.price ?? null;
    if (raw === null || raw === undefined) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const pickPreferredCdnUrl = (variants) => {
    if (!Array.isArray(variants)) return null;
    const full = variants.find((v) => v && v.key === 'full');
    if (full && full.value) return full.value;
    const req = variants.find((v) => v && v.key === 'requested');
    return (req && req.value) || null;
  };
  const extractFromCatalog = (entry) => {
    if (!entry) return [];
    const idx = entry.productCollection && entry.productCollection._index;
    if (!idx || typeof idx !== 'object') return [];
    return Object.keys(idx).map((id) => idx[id] && idx[id].attributes).filter(Boolean);
  };
  try {
    const userId = CLIENT_USER_ID;
    const wa = window.WPP.whatsapp;
    const productsById = new Map();
    const add = (raw) => {
      const p = (raw && raw.attributes) || raw;
      if (p && p.id && !productsById.has(p.id)) productsById.set(p.id, p);
    };

    if (wa && wa.functions && wa.functions.queryCatalog) {
      try {
        let after = undefined;
        while (true) {
          const r = await wa.functions.queryCatalog(userId, after);
          const list = Array.isArray(r && r.data) ? r.data : [];
          for (const p of list) add(p);
          const next = r && r.paging && r.paging.cursors && r.paging.cursors.after;
          if (!next || next === after) break;
          after = next;
        }
      } catch (e) {}
    }

    if (wa && wa.CatalogStore && wa.CatalogStore.findQuery) {
      try {
        const res = await wa.CatalogStore.findQuery(userId);
        if (Array.isArray(res)) for (const en of res) for (const p of extractFromCatalog(en)) add(p);
      } catch (e) {}
    }

    if (productsById.size === 0) {
      try {
        const fb = await window.WPP.catalog.getProducts(userId, 999);
        if (Array.isArray(fb)) for (const p of fb) add(p);
      } catch (e) {}
    }

    const products = [];
    for (const product of productsById.values()) {
      const imageUrls = [];
      const main = product.imageCdnUrl || product.image_cdn_url || pickPreferredCdnUrl(product.image_cdn_urls);
      if (main) imageUrls.push({ url: main, type: 'main', index: 0 });
      if (Array.isArray(product.additionalImageCdnUrl)) {
        product.additionalImageCdnUrl.forEach((u, i) => { if (u) imageUrls.push({ url: u, type: 'additional', index: i + 1 }); });
      } else if (Array.isArray(product.additional_image_cdn_urls)) {
        product.additional_image_cdn_urls.forEach((arr, i) => {
          const u = pickPreferredCdnUrl(arr);
          if (u) imageUrls.push({ url: u, type: 'additional', index: i + 1 });
        });
      }
      const images = [];
      for (const info of imageUrls) {
        try {
          const resp = await fetch(info.url, {
            method: 'GET',
            credentials: 'include',
            headers: { 'User-Agent': navigator.userAgent, Referer: 'https://web.whatsapp.com/', Origin: 'https://web.whatsapp.com' },
          });
          if (!resp.ok) continue;
          const blob = await resp.blob();
          if (blob.size === 0) continue;
          const data = await new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onloadend = () => res(reader.result);
            reader.onerror = rej;
            reader.readAsDataURL(blob);
          });
          images.push({ index: info.index, type: info.type, data });
        } catch (e) {}
      }
      const amount = toPriceAmount1000(product);
      products.push({
        id: product.id,
        name: product.name || '',
        description: product.description || null,
        price: amount !== null ? amount / 1000 : null,
        currency: product.currency || null,
        availability: product.availability || null,
        retailerId: product.retailerId || product.retailer_id || null,
        images,
      });
    }
    return { success: true, products };
  } catch (error) {
    return { success: false, error: (error && error.message) || String(error), products: [] };
  }
})()`

/**
 * Thin HTTP client for the external `whatsapp-connector` (wppconnect) service.
 * One of our own WhatsApp numbers is connected on that service (QR scanned from
 * the terminal). Because WhatsApp Business catalogues are public, we inject a
 * page script that reads the catalogue of any business number we point it at.
 *
 * Configuration (env):
 *   - WHATSAPP_CATALOG_CONNECTOR_URL    base URL (e.g. http://wpp-connector:3001)
 *   - WHATSAPP_CONNECTOR_INSTANCE_ID    sent as `x-bedones-target-instance` when set
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

  /**
   * Extract the public catalogue of a WhatsApp number by injecting the page
   * script into the connector's session via its generic /whatsapp/execute-script.
   * @param clientUserId the target wid, e.g. `237657888690@c.us`
   */
  async extractClientCatalog(clientUserId: string): Promise<ExtractedProduct[]> {
    const script = CLIENT_CATALOG_SCRIPT.replace('{{CLIENT_USER_ID}}', clientUserId)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
    const instanceId = this.config.get<string>('WHATSAPP_CONNECTOR_INSTANCE_ID')
    if (instanceId) headers['x-bedones-target-instance'] = instanceId

    const url = `${this.baseUrl}/whatsapp/execute-script`
    this.logger.log(`Extracting public catalogue for ${clientUserId} via connector`)

    let response: Response
    try {
      response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ script }) })
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

    const payload = (await response.json()) as {
      success?: boolean
      result?: { success?: boolean; error?: string; products?: ExtractedProduct[] }
    }
    const result = payload?.result
    if (!result?.success) {
      throw new ServiceUnavailableException(
        `Catalogue extraction failed: ${result?.error || 'unknown error'}`,
      )
    }
    const products = Array.isArray(result.products) ? result.products : []
    this.logger.log(`Connector returned ${products.length} product(s) for ${clientUserId}`)
    return products
  }
}
