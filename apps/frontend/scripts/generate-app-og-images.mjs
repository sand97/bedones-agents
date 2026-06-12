/**
 * Génère les images Open Graph / Twitter des pages du dashboard
 * (`public/og/<section>.png`, 1200×630).
 *
 * Pourquoi : quand on partage un lien profond du dashboard (catalogue, tickets,
 * promotions…), les crawlers sociaux (WhatsApp, Messenger, Facebook, LinkedIn,
 * Slack, Twitter/X) lisent les balises og:image. Le SVG n'est pas accepté en
 * og:image → il faut un vrai raster. Chaque section a sa propre illustration,
 * distinguée par son icône et sa couleur d'accent.
 *
 * Même langage visuel que `generate-og-images.mjs` (grille signature, encre de
 * marque, hub « B » de Bedones) et même chaîne 100 % vectorielle, sans texte
 * → net à toute taille, reproductible sans dépendance de police.
 *
 * Usage :
 *   pnpm add -D @resvg/resvg-js sharp
 *   node scripts/generate-app-og-images.mjs
 *
 * Variable d'env optionnelle : OG_OUT=<dossier> pour surcharger la destination.
 */

import { Resvg } from '@resvg/resvg-js'
import sharp from 'sharp'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const W = 1200
const H = 630
const INK = '#111b21'
const BG = '#fafafa'
const OUT_DIR =
  process.env.OG_OUT || join(new URL('.', import.meta.url).pathname, '..', 'public', 'og')

// Lettre « B » de la marque (favicon.svg, viewBox 0..96, centre ≈ 49.65,48.45).
const B_PATH =
  'M36.5 71V64.75H49.5312C52.4896 64.75 54.7396 64.1562 56.2812 62.9688C57.8438 61.7812 58.625 60.0521 58.625 57.7812V57.7188C58.625 56.1979 58.2604 54.9271 57.5312 53.9062C56.8229 52.8646 55.7604 52.0938 54.3438 51.5938C52.9271 51.0729 51.1667 50.8125 49.0625 50.8125H36.5V44.9688H47.7812C50.6979 44.9688 52.9167 44.3958 54.4375 43.25C55.9583 42.1042 56.7188 40.4583 56.7188 38.3125V38.25C56.7188 36.3125 56.0521 34.8125 54.7188 33.75C53.4062 32.6875 51.5521 32.1562 49.1562 32.1562H36.5V25.9062H51.1875C53.9375 25.9062 56.3125 26.375 58.3125 27.3125C60.3333 28.2292 61.8958 29.5312 63 31.2188C64.125 32.9062 64.6875 34.8958 64.6875 37.1875V37.25C64.6875 38.875 64.3125 40.3958 63.5625 41.8125C62.8333 43.2083 61.8229 44.3854 60.5312 45.3438C59.2396 46.2812 57.7917 46.8646 56.1875 47.0938V47.25C58.2917 47.4375 60.1458 48.0208 61.75 49C63.3542 49.9792 64.6042 51.2604 65.5 52.8438C66.3958 54.4062 66.8438 56.1875 66.8438 58.1875V58.25C66.8438 60.875 66.2188 63.1458 64.9688 65.0625C63.7188 66.9583 61.9375 68.4271 59.625 69.4688C57.3333 70.4896 54.5833 71 51.375 71H36.5ZM32.4688 71V25.9062H40.5312V71H32.4688Z'

// Icônes lucide (viewBox 0 0 24 24, tracé stroke) — mêmes que la sidebar.
const ICONS = {
  shoppingBag:
    '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  sparkles:
    '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
  ticket:
    '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
  badgePercent:
    '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m15 9-6 6"/><path d="M9 9h.01"/><path d="M15 15h.01"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  barChart:
    '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  layoutGrid:
    '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  globe:
    '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  messageCircle: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  messageSquare: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  userPlus:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
}

// Une entrée par image : nom de fichier, icône, couleur d'accent de la section.
const SECTIONS = [
  { file: 'catalog', icon: 'shoppingBag', accent: '#6366f1' },
  { file: 'agents', icon: 'sparkles', accent: '#8b5cf6' },
  { file: 'tickets', icon: 'ticket', accent: '#0ea5e9' },
  { file: 'promotions', icon: 'badgePercent', accent: '#f59e0b' },
  { file: 'loyalty', icon: 'gift', accent: '#ec4899' },
  { file: 'members', icon: 'users', accent: '#10b981' },
  { file: 'stats', icon: 'barChart', accent: '#06b6d4' },
  { file: 'dashboard', icon: 'layoutGrid', accent: '#3b82f6' },
  { file: 'website', icon: 'globe', accent: '#14b8a6' },
  { file: 'messaging', icon: 'messageCircle', accent: '#22c55e' },
  { file: 'comments', icon: 'messageSquare', accent: '#f97316' },
  { file: 'invitation', icon: 'userPlus', accent: '#4f46e5' },
  { file: 'app', icon: 'layoutGrid', accent: '#6366f1' },
]

const cx = 600
const cy = 300
const tile = 300 // côté de la tuile centrale

function grid() {
  let l = ''
  for (let x = 40; x < W; x += 40) l += `<line x1="${x}" y1="0" x2="${x}" y2="${H}"/>`
  for (let y = 40; y < H; y += 40) l += `<line x1="0" y1="${y}" x2="${W}" y2="${y}"/>`
  return `<g stroke="${INK}" stroke-opacity="0.05" stroke-width="1">${l}</g>`
}

// Icône blanche centrée dans la tuile (stroke ramené à ~3.4px visuels).
function heroIcon(key) {
  const target = 150
  const s = target / 24
  const x = cx - target / 2
  const y = cy - target / 2
  const sw = (3.4 / s).toFixed(3)
  return `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="#ffffff" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ICONS[key]}</g>`
}

// Petit médaillon de marque « B » en haut à gauche (rappel Bedones).
function brandMark() {
  const bx = 84
  const by = 84
  const r = 30
  const bScale = (r * 1.18) / 45.1
  return `<circle cx="${bx}" cy="${by}" r="${r}" fill="${INK}" filter="url(#ms)"/><g transform="translate(${bx} ${by}) scale(${bScale}) translate(-49.65 -48.45)"><path d="${B_PATH}" fill="#ffffff"/></g>`
}

function svgFor({ icon, accent }) {
  const tx = cx - tile / 2
  const ty = cy - tile / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="ts" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="14" stdDeviation="26" flood-color="#0b1418" flood-opacity="0.22"/></filter>
    <filter id="ms" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#0b1418" flood-opacity="0.16"/></filter>
    <filter id="glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="60"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${grid()}
  <ellipse cx="${cx}" cy="${cy + 18}" rx="260" ry="190" fill="${accent}" fill-opacity="0.20" filter="url(#glow)"/>
  <rect x="${tx}" y="${ty}" width="${tile}" height="${tile}" rx="72" fill="${INK}" filter="url(#ts)"/>
  <rect x="${tx}" y="${ty}" width="${tile}" height="${tile}" rx="72" fill="none" stroke="${accent}" stroke-opacity="0.85" stroke-width="3"/>
  ${heroIcon(icon)}
  ${brandMark()}
  <rect x="${cx - 36}" y="${cy + tile / 2 + 44}" width="72" height="8" rx="4" fill="${accent}"/>
</svg>`
}

mkdirSync(OUT_DIR, { recursive: true })

for (const section of SECTIONS) {
  const svg = svgFor(section)
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng()
  const out = await sharp(png).png({ compressionLevel: 9 }).toBuffer()
  const dest = join(OUT_DIR, `${section.file}.png`)
  writeFileSync(dest, out)
  console.log(`✅  og/${section.file}.png  ${(out.length / 1024).toFixed(1)} KB`)
}

console.log(`\nGénéré ${SECTIONS.length} images dans ${OUT_DIR}`)
