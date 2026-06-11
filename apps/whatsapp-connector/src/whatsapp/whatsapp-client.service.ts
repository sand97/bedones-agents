import * as fs from 'fs'

import { HttpService } from '@nestjs/axios'
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as qrcodeTerminal from 'qrcode-terminal'
import { Client, LocalAuth } from 'whatsapp-web.js'

import { readCatalogIdScript, readCatalogPreviewScript } from './whatsapp-page-scripts'

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

    const result = await page.evaluate(readCatalogPreviewScript, wid)

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

    const debug = await page.evaluate(readCatalogIdScript, wid)

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
