import { Injectable, InternalServerErrorException } from '@nestjs/common'
import type { InvoiceData } from './invoice-data'
import { buildInvoiceHtml } from './invoice-html'

/**
 * Génération de facture via **Gotenberg** (microservice HTML→PDF basé Chromium,
 * hors du backend). Le backend reste léger : il POST juste le HTML au service.
 * URL configurable via GOTENBERG_URL (défaut http://localhost:3000).
 */
@Injectable()
export class InvoiceGotenbergService {
  async generate(d: InvoiceData): Promise<Buffer> {
    const base = (process.env.GOTENBERG_URL ?? 'http://localhost:3000').replace(/\/$/, '')
    const form = new FormData()
    form.append('files', new Blob([buildInvoiceHtml(d)], { type: 'text/html' }), 'index.html')
    form.append('paperWidth', '8.27')
    form.append('paperHeight', '11.69') // A4
    form.append('printBackground', 'true')
    form.append('marginTop', '0')
    form.append('marginBottom', '0')

    const res = await fetch(`${base}/forms/chromium/convert/html`, { method: 'POST', body: form })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new InternalServerErrorException(
        `Gotenberg a échoué (${res.status}): ${text.slice(0, 200)}`,
      )
    }
    return Buffer.from(await res.arrayBuffer())
  }
}
