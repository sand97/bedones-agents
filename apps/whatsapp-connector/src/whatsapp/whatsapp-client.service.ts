import * as fs from 'fs'

import { HttpService } from '@nestjs/axios'
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as qrcodeTerminal from 'qrcode-terminal'
import { Client, LocalAuth } from 'whatsapp-web.js'

/**
 * Minimal wppconnect-style client: connects one of our numbers via QR and runs
 * page scripts (with WPP + window.nodeFetch injected) in the WhatsApp Web page.
 * Only what the Commerce Manager catalogue migration needs — adapted from the
 * standalone bedones-whatsapp connector.
 */
@Injectable()
export class WhatsAppClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppClientService.name)
  private client: Client | undefined
  private isReady = false
  private qrCode: string | null = null
  private wppInjected = false
  private wppInjectionPromise: Promise<void> | null = null
  private initializationPromise: Promise<void> | null = null
  private pageDebugListenersAttached = false

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  onModuleInit(): void {
    // Start the WhatsApp client directly: if the service is up, we want to use
    // it. Fire-and-forget so the HTTP server (and /qr, /status) come up
    // immediately; the QR is printed to the terminal as soon as it's available.
    void this.initialize().catch((error) => {
      this.logger.error(
        `Failed to start WhatsApp client on boot: ${error instanceof Error ? error.message : error}`,
      )
    })
  }

  async onModuleDestroy() {
    await this.destroy()
  }

  async startClient(): Promise<void> {
    if (this.client && (this.isReady || this.initializationPromise)) {
      if (this.initializationPromise) await this.initializationPromise
      return
    }
    await this.initialize()
  }

  private async initialize(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise
      return
    }
    if (this.client) return

    this.initializationPromise = this.performInitialize().finally(() => {
      this.initializationPromise = null
    })
    await this.initializationPromise
  }

  private async performInitialize(): Promise<void> {
    this.logger.log('Initializing WhatsApp client...')

    const sessionPath = this.configService.get<string>('WHATSAPP_SESSION_PATH', './data/sessions')
    const executablePath =
      this.configService.get<string>('PUPPETEER_EXECUTABLE_PATH') || process.env.CHROME_BIN
    const configuredHeadless =
      this.configService.get<string>(
        'WHATSAPP_PUPPETEER_HEADLESS',
        process.env.NODE_ENV === 'production' ? 'true' : 'false',
      ) || 'false'

    const normalizedHeadless = configuredHeadless.trim().toLowerCase()
    const headless =
      normalizedHeadless === 'new' || ['1', 'true', 'yes', 'on'].includes(normalizedHeadless)

    fs.mkdirSync(sessionPath, { recursive: true })

    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: sessionPath }),
      puppeteer: {
        executablePath: executablePath || undefined,
        headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--no-zygote',
          '--disable-web-security',
          // Allow the in-page fetch of WhatsApp CDN images from scripts.
          '--disable-features=IsolateOrigins,site-per-process,ContentSecurityPolicy',
          '--disable-site-isolation-trials',
          '--disable-gpu',
        ],
      },
    })

    this.setupEventListeners()
    await this.client.initialize()
  }

  private setupEventListeners(): void {
    if (!this.client) return

    this.client.on('qr', (qr: string) => {
      this.qrCode = qr
      this.logger.log(
        `🔐 QR code received (length: ${qr?.length || 0}). Scan it with one of our numbers:`,
      )
      // Render the QR directly in the terminal.
      qrcodeTerminal.generate(qr, { small: true })
      void this.ensureWPPInjected()
    })

    this.client.on('authenticated', () => {
      this.logger.log('✅ WhatsApp client authenticated')
      void this.ensureWPPInjected()
    })

    this.client.on('ready', () => {
      this.isReady = true
      this.qrCode = null
      this.logger.log('✅ WhatsApp client is ready')
      void this.ensureWPPInjected()
    })

    this.client.on('auth_failure', (msg) => {
      this.logger.error(`Authentication failure: ${msg}`)
    })

    this.client.on('disconnected', (reason) => {
      this.isReady = false
      this.wppInjected = false
      this.logger.warn(`WhatsApp client disconnected: ${reason}`)
    })
  }

  // ─── WPP injection ───

  private async ensureWPPInjected(): Promise<void> {
    const page = this.client?.pupPage
    if (!page) {
      this.logger.warn('Puppeteer page not available, cannot inject WPP')
      return
    }
    this.attachPageDebugListeners(page)
    try {
      await this.injectWPPIntoPage(page)
    } catch (error) {
      this.logger.error('Error injecting WPP script:', error instanceof Error ? error.stack : error)
      this.wppInjected = false
    }
  }

  private async injectWPPIntoPage(page: any): Promise<void> {
    if (this.wppInjected) return
    if (!this.wppInjectionPromise) {
      this.wppInjectionPromise = this.injectWPPIntoPageInternal(page)
    }
    const current = this.wppInjectionPromise
    try {
      await current
    } finally {
      if (this.wppInjectionPromise === current) this.wppInjectionPromise = null
    }
  }

  private async injectWPPIntoPageInternal(page: any): Promise<void> {
    const wppAlreadyExists = await page.evaluate(() => typeof window.WPP !== 'undefined')
    if (!wppAlreadyExists) {
      this.logger.log('Loading WPP script from @wppconnect/wa-js...')
      const wppScriptPath = require.resolve('@wppconnect/wa-js')
      const wppScript = fs.readFileSync(wppScriptPath, 'utf8')
      await page.evaluate(wppScript)
    }

    await page.waitForFunction(
      () => typeof window.WPP !== 'undefined' && window.WPP.isReady === true,
      { timeout: 15000 },
    )

    const nodeFetchExposed = await page.evaluate(
      () => typeof (window as any).__nodeFetch === 'function',
    )
    if (!nodeFetchExposed) {
      await this.exposeNodeFetchToPage(page)
      this.logger.log('nodeFetch exposed to browser context')
    }

    this.wppInjected = true
    this.logger.log('✅ WPP is ready and available')
  }

  /**
   * Resilient guard run before any page script: make sure WPP is actually
   * injected AND ready in the current page, re-injecting and waiting across a
   * few attempts (the page may have reloaded, leaving a stale flag). Throws a
   * clear error if the session never becomes ready (e.g. no number connected)
   * so callers fail explicitly instead of running against an undefined
   * `window.WPP`.
   */
  private async ensureWPPReady(attempts = 3): Promise<void> {
    const page = this.client?.pupPage
    if (!page) throw new Error('Puppeteer page is not available')

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const ready = await page.evaluate(
        () => typeof window.WPP !== 'undefined' && window.WPP?.isReady === true,
      )
      if (ready) {
        this.wppInjected = true
        return
      }

      this.logger.warn(`WPP not ready (attempt ${attempt}/${attempts}); injecting…`)
      try {
        // Force a fresh injection (bypass the memoised flag/promise).
        this.wppInjected = false
        this.wppInjectionPromise = null
        await this.injectWPPIntoPageInternal(page)
        return
      } catch (error) {
        this.logger.error(
          `WPP injection attempt ${attempt}/${attempts} failed: ${
            error instanceof Error ? error.message : error
          }`,
        )
        if (attempt === attempts) {
          throw new Error(
            'WhatsApp session not ready: WPP could not be injected after multiple attempts ' +
              '(make sure a number is connected to the connector and the session has finished loading).',
          )
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500))
      }
    }
  }

  private attachPageDebugListeners(page: any): void {
    if (this.pageDebugListenersAttached) return
    page.on('pageerror', (error: Error) => {
      this.logger.debug(`[PAGE:error] ${error?.message}`)
    })
    this.pageDebugListenersAttached = true
  }

  /**
   * Exposes a Node-side fetch to the page (bypasses CSP). Scripts call
   * `window.nodeFetch(url, options)` which resolves to a fetch-like object.
   */
  private async exposeNodeFetchToPage(page: any): Promise<void> {
    await page.exposeFunction('__nodeFetch', async (url: string, options: any = {}) => {
      try {
        const axiosConfig: any = {
          url,
          method: options.method || 'GET',
          headers: options.headers || {},
        }
        if (options.responseType) axiosConfig.responseType = options.responseType
        if (options.body) {
          axiosConfig.data =
            typeof options.body === 'string' ? JSON.parse(options.body) : options.body
        }

        const response = await this.httpService.axiosRef.request(axiosConfig)
        const isBinary = options.responseType === 'arraybuffer'
        return {
          ok: response.status >= 200 && response.status < 300,
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          data: isBinary ? Buffer.from(response.data).toString('base64') : response.data,
          responseType: isBinary ? 'base64' : 'default',
        }
      } catch (error: any) {
        this.logger.error(`[nodeFetch] Error: ${error?.message}`)
        return {
          ok: false,
          status: error?.response?.status || 500,
          statusText: error?.response?.statusText || 'Internal Server Error',
          headers: error?.response?.headers || {},
          data: error?.response?.data || { error: error?.message },
          responseType: 'default',
        }
      }
    })

    await page.evaluate(() => {
      const w = window as unknown as {
        nodeFetch: unknown
        __nodeFetch: (url: string, options: unknown) => Promise<{ data: unknown }>
      }
      w.nodeFetch = async (url: string, options: unknown) => {
        const response = await w.__nodeFetch(url, options)
        return {
          ...response,
          json: async () => response.data,
          text: async () =>
            typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
        }
      }
    })
  }

  // ─── Public API ───

  async executePageScript(script: string): Promise<any> {
    if (!this.client) throw new Error('WhatsApp client is not initialized')
    const page = this.client.pupPage
    if (!page) throw new Error('Puppeteer page is not available')

    this.attachPageDebugListeners(page)

    // Resilient: inject WPP and wait until it's ready before running the
    // incoming script (retries across a few attempts; throws if never ready).
    await this.ensureWPPReady()

    return page.evaluate(script)
  }

  /**
   * Read a number's public catalogue for testing — returns the products inline
   * (name, price/currency, image CDN URLs) without downloading images or going
   * through the migration pipeline. `GET /whatsapp/catalog/:phoneNumber`.
   */
  async getCatalogPreview(phoneNumber: string): Promise<{
    phoneNumber: string
    wid: string
    productCount: number
    collectionCount: number
    products: unknown[]
    collections: unknown[]
  }> {
    const digits = (phoneNumber || '').replace(/[^0-9]/g, '')
    if (!digits) throw new Error('Invalid phone number')
    const wid = `${digits}@c.us`

    if (!this.client) throw new Error('WhatsApp client is not initialized')
    const page = this.client.pupPage
    if (!page) throw new Error('Puppeteer page is not available')

    await this.ensureWPPReady()

    const result = await page.evaluate(async (targetWid: string) => {
      const wa = window.WPP.whatsapp as any
      const byId = new Map<string, any>()
      const add = (raw: any) => {
        const p = (raw && raw.attributes) || raw
        if (p && p.id && !byId.has(p.id)) byId.set(p.id, p)
      }
      const pick = (variants: any): string | null => {
        if (!Array.isArray(variants)) return null
        const full = variants.find((v: any) => v && v.key === 'full')
        if (full && full.value) return full.value
        const req = variants.find((v: any) => v && v.key === 'requested')
        return (req && req.value) || null
      }
      const fromCatalog = (entry: any): any[] => {
        const idx = entry && entry.productCollection && entry.productCollection._index
        if (!idx || typeof idx !== 'object') return []
        return Object.keys(idx)
          .map((id) => idx[id] && idx[id].attributes)
          .filter(Boolean)
      }

      if (wa && wa.functions && wa.functions.queryCatalog) {
        try {
          let after: string | undefined = undefined
          while (true) {
            const r = await wa.functions.queryCatalog(targetWid, after)
            const list = Array.isArray(r && r.data) ? r.data : []
            for (const p of list) add(p)
            const next = r && r.paging && r.paging.cursors && r.paging.cursors.after
            if (!next || next === after) break
            after = next
          }
        } catch {
          /* ignore */
        }
      }
      if (wa && wa.CatalogStore && wa.CatalogStore.findQuery) {
        try {
          const res = await wa.CatalogStore.findQuery(targetWid)
          if (Array.isArray(res)) for (const en of res) for (const p of fromCatalog(en)) add(p)
        } catch {
          /* ignore */
        }
      }
      if (byId.size === 0) {
        try {
          const fb = await window.WPP.catalog.getProducts(targetWid as any, 999)
          if (Array.isArray(fb)) for (const p of fb) add(p)
        } catch {
          /* ignore */
        }
      }

      const retailerByWaId = new Map<string, string>()
      const products = Array.from(byId.values()).map((product: any) => {
        const imageUrls: string[] = []
        const main = product.imageCdnUrl || product.image_cdn_url || pick(product.image_cdn_urls)
        if (main) imageUrls.push(main)
        if (Array.isArray(product.additional_image_cdn_urls)) {
          for (const arr of product.additional_image_cdn_urls) {
            const u = pick(arr)
            if (u) imageUrls.push(u)
          }
        }
        const rawPrice =
          product.priceAmount1000 ?? product.price_amount_1000 ?? product.price ?? null
        const price =
          rawPrice != null && Number.isFinite(Number(rawPrice)) ? Number(rawPrice) / 1000 : null
        const retailerId = product.retailerId || product.retailer_id || product.id || null
        if (product.id) retailerByWaId.set(product.id, retailerId)
        return {
          id: product.id,
          retailerId,
          name: product.name || '',
          description: product.description || null,
          price,
          currency: product.currency || null,
          availability: product.availability || null,
          imageCount: imageUrls.length,
          imageUrls,
        }
      })

      let collections: any[] = []
      try {
        const cols = await window.WPP.catalog.getCollections(targetWid as any, 50, 100)
        if (Array.isArray(cols)) {
          collections = cols
            .map((c: any) => ({
              id: c && c.id,
              name: (c && c.name) || '',
              retailerIds: (((c && c.products) || []) as any[])
                .map((p: any) => retailerByWaId.get(p && p.id))
                .filter(Boolean),
            }))
            .filter((c: any) => c.name)
        }
      } catch {
        /* ignore */
      }

      return { products, collections }
    }, wid)

    return {
      phoneNumber: digits,
      wid,
      productCount: result.products.length,
      collectionCount: result.collections.length,
      products: result.products,
      collections: result.collections,
    }
  }

  /**
   * Diagnostic helper: best-effort attempt to read the *catalog id* of a number
   * from the WhatsApp Web page (to compare with a Commerce Manager catalog id).
   * WhatsApp Web exposes no documented, stable catalog-id accessor, so we probe
   * a few WPP sources and return the best candidate plus a `debug` dump of what
   * was found — handy to discover locally what's actually available.
   */
  async getCatalogId(phoneNumber: string): Promise<{
    phoneNumber: string
    wid: string
    catalogId: string | null
    candidates: string[]
    debug: unknown
  }> {
    const digits = (phoneNumber || '').replace(/[^0-9]/g, '')
    if (!digits) throw new Error('Invalid phone number')
    const wid = `${digits}@c.us`

    if (!this.client) throw new Error('WhatsApp client is not initialized')
    const page = this.client.pupPage
    if (!page) throw new Error('Puppeteer page is not available')

    await this.ensureWPPReady()

    const debug = await page.evaluate(async (targetWid: string) => {
      const out: any = { sources: {}, candidates: [] }
      const push = (v: any) => {
        if (v === null || v === undefined) return
        const s = String(v)
        if (s && !out.candidates.includes(s)) out.candidates.push(s)
      }
      const keysOf = (o: any) => (o && typeof o === 'object' ? Object.keys(o) : null)
      const W = window as any
      try {
        const wa = W.WPP?.whatsapp
        // 1) queryCatalog response wrapper + first product attributes
        if (wa?.functions?.queryCatalog) {
          try {
            const r = await wa.functions.queryCatalog(targetWid, undefined)
            const first = Array.isArray(r?.data) ? r.data[0] : null
            const fa = (first && first.attributes) || first
            out.sources.queryCatalog = {
              responseKeys: keysOf(r),
              respId: r?.id ?? r?.catalogId ?? r?.catalog_id ?? null,
              productKeys: keysOf(fa),
              productCatalogId:
                fa?.catalogWid ?? fa?.catalogId ?? fa?.catalog_id ?? fa?.catalog_wid ?? null,
            }
            push(out.sources.queryCatalog.respId)
            push(out.sources.queryCatalog.productCatalogId)
          } catch (e: any) {
            out.sources.queryCatalog = { error: String(e?.message || e) }
          }
        }
        // 2) CatalogStore entries
        if (wa?.CatalogStore?.findQuery) {
          try {
            const res = await wa.CatalogStore.findQuery(targetWid)
            const first = Array.isArray(res) ? res[0] : res
            const a = (first && first.attributes) || first
            out.sources.catalogStore = {
              entryKeys: keysOf(a),
              id: a?.id ?? a?.catalogId ?? a?.catalog_id ?? a?.catalogWid ?? null,
            }
            push(out.sources.catalogStore.id)
          } catch (e: any) {
            out.sources.catalogStore = { error: String(e?.message || e) }
          }
        }
        // 3) a product via WPP.catalog
        try {
          const fb = await W.WPP.catalog.getProducts(targetWid, 3)
          const p = Array.isArray(fb) && fb[0] ? fb[0].attributes || fb[0] : null
          out.sources.product = {
            keys: keysOf(p),
            catalogWid: p?.catalogWid ?? null,
            catalogId: p?.catalogId ?? p?.catalog_id ?? null,
          }
          push(out.sources.product.catalogWid)
          push(out.sources.product.catalogId)
        } catch (e: any) {
          out.sources.product = { error: String(e?.message || e) }
        }
        // 4) business profile / commerce info
        try {
          const bp =
            (await W.WPP?.contact?.getBusinessProfile?.(targetWid)) ??
            (await wa?.functions?.queryBusinessProfile?.(targetWid))
          out.sources.businessProfile = {
            keys: keysOf(bp),
            catalogId: bp?.catalogId ?? bp?.catalog_id ?? bp?.commerceProfile?.catalogId ?? null,
          }
          push(out.sources.businessProfile.catalogId)
        } catch (e: any) {
          out.sources.businessProfile = { error: String(e?.message || e) }
        }
      } catch (e: any) {
        out.error = String(e?.message || e)
      }
      return out
    }, wid)

    const candidates: string[] = (debug as { candidates?: string[] })?.candidates ?? []
    return { phoneNumber: digits, wid, catalogId: candidates[0] ?? null, candidates, debug }
  }

  getStatus() {
    return {
      isInitialized: !!this.client,
      isReady: this.isReady,
      hasQrCode: !!this.qrCode,
      state: this.client?.info || null,
    }
  }

  getQrCode(): string | null {
    return this.qrCode
  }

  async restartClient(): Promise<void> {
    this.logger.log('🔄 Restarting WhatsApp client...')
    if (!this.client) {
      await this.startClient()
      return
    }
    await this.destroy()
    await new Promise((resolve) => setTimeout(resolve, 1000))
    await this.initialize()
  }

  private async destroy(): Promise<void> {
    if (this.client) {
      this.logger.log('Destroying WhatsApp client...')
      try {
        await this.client.destroy()
      } catch (error) {
        this.logger.warn(`Error during destroy: ${error instanceof Error ? error.message : error}`)
      }
      this.client = undefined
      this.isReady = false
      this.qrCode = null
      this.wppInjected = false
      this.wppInjectionPromise = null
      this.pageDebugListenersAttached = false
    }
  }
}
