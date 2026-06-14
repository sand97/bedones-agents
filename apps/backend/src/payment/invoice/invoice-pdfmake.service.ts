import { Injectable } from '@nestjs/common'
import type { TDocumentDefinitions, TableCell } from 'pdfmake/interfaces'
import { type InvoiceData, formatMoney } from './invoice-data'

const CELL_M: [number, number, number, number] = [0, 4, 0, 4]

const BRAND = '#128c7e'
const INK = '#1f2933'
const MUTED = '#7b8794'

/**
 * Génération de facture via **pdfmake** (déclaratif JSON, sans dépendance native).
 * Imports dynamiques pour garder le démarrage léger et faciliter la suppression
 * des générateurs non retenus.
 */
@Injectable()
export class InvoicePdfmakeService {
  // Le shape du module de polices varie selon l'interop CJS/ESM : on retient
  // l'objet qui contient réellement les polices Roboto.
  private resolveVfs(mod: unknown): Record<string, string> {
    const m = mod as Record<string, unknown>
    const candidates = [
      (m?.pdfMake as { vfs?: unknown })?.vfs,
      m?.vfs,
      ((m?.default as Record<string, unknown>)?.pdfMake as { vfs?: unknown })?.vfs,
      (m?.default as Record<string, unknown>)?.vfs,
      m?.default,
      m,
    ]
    for (const c of candidates) {
      if (c && typeof c === 'object' && 'Roboto-Regular.ttf' in c) {
        return c as Record<string, string>
      }
    }
    throw new Error('Polices pdfmake (vfs) introuvables')
  }

  async generate(d: InvoiceData): Promise<Buffer> {
    const printerModule = (await import('pdfmake')) as Record<string, unknown>
    const PdfPrinter = [
      printerModule,
      printerModule.default,
      (printerModule.default as Record<string, unknown> | undefined)?.default,
    ].find((x) => typeof x === 'function') as unknown as new (fonts: unknown) => {
      createPdfKitDocument(def: TDocumentDefinitions): NodeJS.ReadableStream & { end(): void }
    }
    if (!PdfPrinter) throw new Error('Constructeur pdfmake introuvable')
    const vfsModule = await import('pdfmake/build/vfs_fonts')
    const vfs = this.resolveVfs(vfsModule)

    const printer = new PdfPrinter({
      Roboto: {
        normal: Buffer.from(vfs['Roboto-Regular.ttf'], 'base64'),
        bold: Buffer.from(vfs['Roboto-Medium.ttf'], 'base64'),
        italics: Buffer.from(vfs['Roboto-Italic.ttf'], 'base64'),
        bolditalics: Buffer.from(vfs['Roboto-MediumItalic.ttf'], 'base64'),
      },
    })

    const tableBody: TableCell[][] = [
      [
        { text: 'DESCRIPTION', style: 'th' },
        { text: 'QTÉ', style: 'th', alignment: 'right' },
        { text: 'PRIX UNIT.', style: 'th', alignment: 'right' },
        { text: 'TOTAL', style: 'th', alignment: 'right' },
      ],
      ...d.items.map((it): TableCell[] => [
        { text: it.description, margin: CELL_M },
        { text: String(it.quantity), alignment: 'right', margin: CELL_M },
        { text: formatMoney(it.unitPrice, d.currency), alignment: 'right', margin: CELL_M },
        { text: formatMoney(it.total, d.currency), alignment: 'right', margin: CELL_M },
      ]),
    ]

    const def: TDocumentDefinitions = {
      pageSize: 'A4',
      pageMargins: [48, 48, 48, 56],
      defaultStyle: { font: 'Roboto', fontSize: 10, color: INK, lineHeight: 1.3 },
      content: [
        {
          columns: [
            [
              { text: 'Bedones', fontSize: 24, bold: true, color: BRAND },
              { text: d.seller.address, color: MUTED, fontSize: 9 },
            ],
            [
              {
                text: 'FACTURE',
                fontSize: 20,
                bold: true,
                alignment: 'right',
                characterSpacing: 2,
              },
              {
                text: `N° ${d.invoiceNumber}\nÉmise le ${d.issueDate}\nÉchéance ${d.dueDate}`,
                alignment: 'right',
                color: '#52606d',
                fontSize: 9,
                margin: [0, 6, 0, 0],
              },
            ],
          ],
        },
        {
          columns: [
            [
              { text: 'ÉMETTEUR', style: 'label' },
              { text: d.seller.name, bold: true },
              {
                text: `${d.seller.address}\n${d.seller.email}\nN° contribuable : ${d.seller.taxId}`,
              },
            ],
            [
              { text: 'FACTURÉ À', style: 'label' },
              { text: d.client.org, bold: true },
              { text: `${d.client.name}\n${d.client.email}\n${d.client.phone}` },
            ],
          ],
          margin: [0, 32, 0, 0],
        },
        {
          margin: [0, 28, 0, 0],
          table: {
            headerRows: 1,
            widths: ['*', 40, 90, 90],
            body: tableBody,
          },
          layout: {
            fillColor: (rowIndex: number) => (rowIndex === 0 ? BRAND : null),
            hLineColor: () => '#e4e7eb',
            vLineWidth: () => 0,
            hLineWidth: (i: number) => (i === 0 ? 0 : 1),
          },
        },
        {
          margin: [0, 18, 0, 0],
          columns: [
            { text: '', width: '*' },
            {
              width: 240,
              stack: [
                {
                  columns: [
                    { text: 'Sous-total', color: '#52606d' },
                    {
                      text: formatMoney(d.subtotal, d.currency),
                      alignment: 'right',
                      color: '#52606d',
                    },
                  ],
                },
                {
                  columns: [
                    { text: `TVA (${d.taxRate}%)`, color: '#52606d' },
                    {
                      text: formatMoney(d.taxAmount, d.currency),
                      alignment: 'right',
                      color: '#52606d',
                    },
                  ],
                  margin: [0, 4, 0, 8],
                },
                {
                  columns: [
                    { text: 'Total', bold: true, fontSize: 15 },
                    {
                      text: formatMoney(d.total, d.currency),
                      alignment: 'right',
                      bold: true,
                      fontSize: 15,
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          text: [{ text: 'Moyen de paiement : ', bold: true }, d.paymentMethod],
          margin: [0, 28, 0, 0],
          fillColor: '#f5f7fa',
        },
        { text: d.notes, alignment: 'center', color: MUTED, fontSize: 9, margin: [0, 40, 0, 0] },
      ],
      styles: {
        label: { fontSize: 8, color: '#9aa5b1', characterSpacing: 1, margin: [0, 0, 0, 4] },
        th: { color: '#ffffff', bold: true, fontSize: 8, margin: [0, 6, 0, 6] },
      },
    }

    const doc = printer.createPdfKitDocument(def)
    const chunks: Buffer[] = []
    return new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (c: Buffer) => chunks.push(c))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)
      doc.end()
    })
  }
}
