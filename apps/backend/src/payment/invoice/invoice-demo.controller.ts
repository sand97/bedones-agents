import { Controller, Get, Logger, Res } from '@nestjs/common'
import type { Response } from 'express'
import { ApiExcludeController } from '@nestjs/swagger'
import { DEMO_INVOICE } from './invoice-data'
import { InvoicePdfmakeService } from './invoice-pdfmake.service'
import { InvoicePuppeteerService } from './invoice-puppeteer.service'
import { InvoiceGotenbergService } from './invoice-gotenberg.service'

/**
 * ⚠️ TEMPORAIRE — endpoints de comparaison des 3 générateurs de facture PDF.
 * Sans authentification pour pouvoir ouvrir l'URL directement dans le navigateur.
 * Une fois l'outil retenu, supprimer ce dossier `invoice/` et garder le service
 * choisi. Le header `X-Generation-Ms` donne le temps de génération.
 *   - GET /payment/invoice-demo/pdfmake
 *   - GET /payment/invoice-demo/puppeteer
 *   - GET /payment/invoice-demo/gotenberg   (nécessite un Gotenberg sur GOTENBERG_URL)
 */
@ApiExcludeController()
@Controller('payment/invoice-demo')
export class InvoiceDemoController {
  private readonly logger = new Logger(InvoiceDemoController.name)

  constructor(
    private pdfmake: InvoicePdfmakeService,
    private puppeteer: InvoicePuppeteerService,
    private gotenberg: InvoiceGotenbergService,
  ) {}

  @Get('pdfmake')
  async viaPdfmake(@Res() res: Response) {
    await this.render(res, 'pdfmake', () => this.pdfmake.generate(DEMO_INVOICE))
  }

  @Get('puppeteer')
  async viaPuppeteer(@Res() res: Response) {
    await this.render(res, 'puppeteer', () => this.puppeteer.generate(DEMO_INVOICE))
  }

  @Get('gotenberg')
  async viaGotenberg(@Res() res: Response) {
    await this.render(res, 'gotenberg', () => this.gotenberg.generate(DEMO_INVOICE))
  }

  private async render(res: Response, engine: string, gen: () => Promise<Buffer>) {
    const startedAt = Date.now()
    try {
      const pdf = await gen()
      const ms = Date.now() - startedAt
      this.logger.log(`Facture démo générée via ${engine} en ${ms} ms (${pdf.length} octets)`)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="facture-demo-${engine}.pdf"`)
      res.setHeader('X-Generation-Ms', String(ms))
      res.setHeader('X-Generation-Engine', engine)
      res.send(pdf)
    } catch (err) {
      this.logger.error(`Génération ${engine} échouée: ${err}`)
      res.status(500).json({ error: `Génération ${engine} échouée`, detail: String(err) })
    }
  }
}
