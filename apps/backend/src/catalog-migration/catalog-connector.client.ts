import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

export interface ExtractionResult {
  productCount: number
  collectionCount: number
}

export interface ExtractClientCatalogParams {
  clientUserId: string
  /** Base URL of bedones-agents reachable from the connector (for callbacks). */
  backendUrl: string
  /** Per-migration bearer token authenticating the callbacks. */
  token: string
}

/**
 * Page script injected into the connected WhatsApp Web session to read the
 * *public* catalogue of a target number. Adapted from the proven
 * `getCatalog.ts` script — it targets the client's wid (`{{CLIENT_USER_ID}}`),
 * streams every image to our `upload-image` callback and posts the assembled
 * catalogue to `save-catalog` (both authenticated by `{{TOKEN}}`).
 *
 * `window.nodeFetch` is exposed by the connector and proxies the request
 * server-side (no CSP/CORS). The browser `fetch` is only used to download the
 * images from WhatsApp's CDN within the authenticated session.
 *
 * It is an IIFE expression so the connector's `page.evaluate(script)` resolves
 * to its return value (a small summary).
 */
const CLIENT_CATALOG_SCRIPT = `(async () => {
  const CLIENT_USER_ID = '{{CLIENT_USER_ID}}';
  const BACKEND_URL = '{{BACKEND_URL}}';
  const TOKEN = '{{TOKEN}}';

  const post = (path, body) => window.nodeFetch(BACKEND_URL + path, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

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
    if (!window.WPP || !window.WPP.whatsapp) {
      return { success: false, error: 'WhatsApp session not ready: WPP is not injected into the page (no number connected to the connector, or the session is still loading).', productCount: 0 };
    }
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
    const retailerByWaId = new Map();
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

      const uploaded = [];
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
          const dataUrl = await new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onloadend = () => res(reader.result);
            reader.onerror = rej;
            reader.readAsDataURL(blob);
          });
          const up = await post('/catalog-migration/callback/upload-image', {
            image: dataUrl, productId: product.id, imageIndex: info.index, imageType: info.type,
          });
          if (up && up.ok) {
            const r = await up.json();
            const url = r && (r.url || (r.data && r.data.url));
            if (url) uploaded.push({ index: info.index, url });
          }
        } catch (e) {}
      }
      uploaded.sort((a, b) => a.index - b.index);
      const urls = uploaded.map((u) => u.url);

      const amount = toPriceAmount1000(product);
      const retailerId = product.retailerId || product.retailer_id || product.id || null;
      retailerByWaId.set(product.id, retailerId);
      products.push({
        name: product.name || '',
        description: product.description || null,
        price: amount !== null ? amount / 1000 : null,
        currency: product.currency || null,
        availability: product.availability || null,
        retailerId,
        imageUrl: urls[0] || null,
        additionalImageUrls: urls.slice(1),
      });
    }

    // Collections (product sets) — map each collection's products to retailer_ids.
    let collections = [];
    try {
      const cols = await window.WPP.catalog.getCollections(userId, 50, 100);
      if (Array.isArray(cols)) {
        collections = cols
          .map((c) => ({
            name: (c && c.name) || '',
            retailerIds: (((c && c.products) || []))
              .map((p) => retailerByWaId.get(p && p.id))
              .filter(Boolean),
          }))
          .filter((c) => c.name && c.retailerIds.length > 0);
      }
    } catch (e) {}

    const save = await post('/catalog-migration/callback/save-catalog', { products, collections });
    const saved = !!(save && save.ok);
    return { success: saved, productCount: products.length, collectionCount: collections.length, saved };
  } catch (error) {
    return { success: false, error: (error && error.message) || String(error), productCount: 0 };
  }
})()`

/**
 * Thin client for the external `whatsapp-connector` (wppconnect) service. One of
 * our own numbers is connected there (QR scanned from the terminal). Because
 * WhatsApp Business catalogues are public, we inject a page script that reads
 * the catalogue of any business number and streams it back to us.
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
   * Inject the extraction script into the connector's session. The script does
   * the heavy lifting (download images → upload-image, post catalogue →
   * save-catalog) and returns a small summary.
   */
  async extractClientCatalog(params: ExtractClientCatalogParams): Promise<ExtractionResult> {
    const script = CLIENT_CATALOG_SCRIPT.replace('{{CLIENT_USER_ID}}', params.clientUserId)
      .replace('{{BACKEND_URL}}', params.backendUrl.replace(/\/+$/, ''))
      .replace('{{TOKEN}}', params.token)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
    const instanceId = this.config.get<string>('WHATSAPP_CONNECTOR_INSTANCE_ID')
    if (instanceId) headers['x-bedones-target-instance'] = instanceId

    const url = `${this.baseUrl}/whatsapp/execute-script`
    this.logger.log(`Extracting public catalogue for ${params.clientUserId} via connector`)

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
      result?: {
        success?: boolean
        error?: string
        productCount?: number
        collectionCount?: number
      }
    }
    const result = payload?.result
    if (!result?.success) {
      const reason = result?.error || 'unknown error'
      this.logger.error(`Catalogue extraction failed for ${params.clientUserId}: ${reason}`)
      throw new ServiceUnavailableException(`Catalogue extraction failed: ${reason}`)
    }
    this.logger.log(
      `Extraction reported ${result.productCount ?? 0} product(s), ${result.collectionCount ?? 0} collection(s)`,
    )
    return {
      productCount: result.productCount ?? 0,
      collectionCount: result.collectionCount ?? 0,
    }
  }

  /**
   * Read a number's public catalogue through the connector and return its
   * product retailer ids (+ count). Best-effort: never throws — returns an
   * empty result on any failure. Used to confirm an SMB number has its
   * catalogue linked to a Commerce Manager catalogue.
   */
  async getNumberCatalog(
    phoneNumber: string,
  ): Promise<{ productCount: number; retailerIds: string[] }> {
    const digits = (phoneNumber || '').replace(/[^0-9]/g, '')
    if (!digits) return { productCount: 0, retailerIds: [] }

    const headers: Record<string, string> = { Accept: 'application/json' }
    const instanceId = this.config.get<string>('WHATSAPP_CONNECTOR_INSTANCE_ID')
    if (instanceId) headers['x-bedones-target-instance'] = instanceId

    try {
      const response = await fetch(`${this.baseUrl}/whatsapp/catalog/${digits}`, {
        method: 'GET',
        headers,
      })
      if (!response.ok) {
        this.logger.warn(`Connector catalogue read for ${digits} returned ${response.status}`)
        return { productCount: 0, retailerIds: [] }
      }
      const payload = (await response.json()) as {
        productCount?: number
        products?: Array<{ retailerId?: string | null }>
      }
      const retailerIds = (payload.products ?? [])
        .map((p) => p?.retailerId)
        .filter((id): id is string => !!id)
      return { productCount: payload.productCount ?? retailerIds.length, retailerIds }
    } catch (error) {
      this.logger.warn(
        `Connector catalogue read for ${digits} failed: ${
          error instanceof Error ? error.message : error
        }`,
      )
      return { productCount: 0, retailerIds: [] }
    }
  }
}
