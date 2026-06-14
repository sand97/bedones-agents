import { type InvoiceData, formatMoney } from './invoice-data'

// Gabarit HTML/CSS partagé par les générateurs basés navigateur (Puppeteer +
// Gotenberg). CSS inline, format A4, autonome (aucune ressource externe).
export function buildInvoiceHtml(d: InvoiceData): string {
  const rows = d.items
    .map(
      (it) => `
      <tr>
        <td>${escapeHtml(it.description)}</td>
        <td class="num">${it.quantity}</td>
        <td class="num">${formatMoney(it.unitPrice, d.currency)}</td>
        <td class="num">${formatMoney(it.total, d.currency)}</td>
      </tr>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  @page { size: A4; margin: 0; }
  body {
    margin: 0; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1f2933; font-size: 13px; line-height: 1.5;
  }
  .page { padding: 48px 56px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; }
  .brand { font-size: 26px; font-weight: 700; color: #128c7e; letter-spacing: -0.5px; }
  .brand small { display: block; font-size: 12px; font-weight: 400; color: #7b8794; letter-spacing: 0; }
  .doc-title { text-align: right; }
  .doc-title h1 { margin: 0; font-size: 22px; letter-spacing: 2px; color: #1f2933; }
  .doc-title .meta { margin-top: 6px; color: #52606d; font-size: 12px; }
  .parties { display: flex; justify-content: space-between; margin-top: 36px; gap: 32px; }
  .parties .box { flex: 1; }
  .label { text-transform: uppercase; font-size: 10px; letter-spacing: 1px; color: #9aa5b1; margin-bottom: 6px; }
  .parties strong { font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin-top: 36px; }
  thead th {
    text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
    color: #ffffff; background: #128c7e; padding: 10px 12px;
  }
  thead th.num, tbody td.num { text-align: right; }
  tbody td { padding: 12px; border-bottom: 1px solid #e4e7eb; }
  .totals { margin-top: 20px; margin-left: auto; width: 280px; }
  .totals .row { display: flex; justify-content: space-between; padding: 6px 0; color: #52606d; }
  .totals .grand { border-top: 2px solid #1f2933; margin-top: 8px; padding-top: 12px; font-size: 18px; font-weight: 700; color: #1f2933; }
  .pay { margin-top: 32px; padding: 14px 16px; background: #f5f7fa; border-radius: 8px; font-size: 12px; }
  .footer { margin-top: 48px; text-align: center; color: #9aa5b1; font-size: 11px; border-top: 1px solid #e4e7eb; padding-top: 16px; }
</style>
</head>
<body>
  <div class="page">
    <div class="head">
      <div class="brand">Bedones<small>${escapeHtml(d.seller.address)}</small></div>
      <div class="doc-title">
        <h1>FACTURE</h1>
        <div class="meta">
          N° ${escapeHtml(d.invoiceNumber)}<br/>
          Émise le ${escapeHtml(d.issueDate)}<br/>
          Échéance ${escapeHtml(d.dueDate)}
        </div>
      </div>
    </div>

    <div class="parties">
      <div class="box">
        <div class="label">Émetteur</div>
        <strong>${escapeHtml(d.seller.name)}</strong><br/>
        ${escapeHtml(d.seller.address)}<br/>
        ${escapeHtml(d.seller.email)}<br/>
        N° contribuable : ${escapeHtml(d.seller.taxId)}
      </div>
      <div class="box">
        <div class="label">Facturé à</div>
        <strong>${escapeHtml(d.client.org)}</strong><br/>
        ${escapeHtml(d.client.name)}<br/>
        ${escapeHtml(d.client.email)}<br/>
        ${escapeHtml(d.client.phone)}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th class="num">Qté</th>
          <th class="num">Prix unitaire</th>
          <th class="num">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <div class="row"><span>Sous-total</span><span>${formatMoney(d.subtotal, d.currency)}</span></div>
      <div class="row"><span>TVA (${d.taxRate}%)</span><span>${formatMoney(d.taxAmount, d.currency)}</span></div>
      <div class="row grand"><span>Total</span><span>${formatMoney(d.total, d.currency)}</span></div>
    </div>

    <div class="pay"><strong>Moyen de paiement :</strong> ${escapeHtml(d.paymentMethod)}</div>

    <div class="footer">${escapeHtml(d.notes)}</div>
  </div>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
