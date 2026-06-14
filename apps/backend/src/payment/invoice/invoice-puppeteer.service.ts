import { Injectable, Logger } from '@nestjs/common'
import type { InvoiceData } from './invoice-data'
import { buildInvoiceHtml } from './invoice-html'

/**
 * Génération de facture via **Puppeteer** (rendu HTML/CSS par Chromium headless).
 * Fidélité maximale mais lourd (Chromium en mémoire). Import dynamique pour ne
 * pas charger puppeteer au démarrage.
 */
@Injectable()
export class InvoicePuppeteerService {
  private readonly logger = new Logger(InvoicePuppeteerService.name)

  async generate(d: InvoiceData): Promise<Buffer> {
    const puppeteer = (await import('puppeteer')).default
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    try {
      const page = await browser.newPage()
      await page.setContent(buildInvoiceHtml(d), { waitUntil: 'load' })
      const pdf = await page.pdf({ format: 'A4', printBackground: true })
      return Buffer.from(pdf)
    } finally {
      await browser.close().catch((e) => this.logger.warn(`Fermeture Chromium: ${e}`))
    }
  }
}
