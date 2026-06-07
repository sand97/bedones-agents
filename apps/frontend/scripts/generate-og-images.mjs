/**
 * Génère les images Open Graph / Twitter (`public/og-*.png`) — variante
 * « Logo seul » : marque Bedones centrée sur fond encre + grille signature.
 *
 * Pourquoi : les liens partagés (Facebook, WhatsApp, X…) référencent
 * `https://bedones.com/og-home.png` (cf. balises og:image dans les routes).
 * Sans fichier PNG réel, le crawler reçoit le HTML du SPA → erreur
 * « Invalid Image Content Type ». Ce script produit de vrais PNG 1200×630.
 *
 * Usage :
 *   node scripts/generate-og-images.mjs
 *
 * Dépendances :
 *   pnpm add -D @resvg/resvg-js
 *
 * Polices (Geist, OFL) — à placer dans scripts/fonts/ (one-time) :
 *   curl -sL "https://raw.githubusercontent.com/google/fonts/main/ofl/geist/Geist%5Bwght%5D.ttf" -o /tmp/Geist.ttf
 *   pip install fonttools
 *   for w in 400:Regular 500:Medium 600:SemiBold 700:Bold; do \
 *     python3 -m fontTools.varLib.instancer /tmp/Geist.ttf wght=${w%%:*} \
 *       -o scripts/fonts/Geist-${w##*:}.ttf; done
 */

import { Resvg } from '@resvg/resvg-js'
import { readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const W = 1200
const H = 630
const INK = '#111b21'
const SCRIPT_DIR = new URL('.', import.meta.url).pathname
const FONTS_DIR = join(SCRIPT_DIR, 'fonts')
const OUT_DIR = join(SCRIPT_DIR, '..', 'public')

// Lettre « B » de la marque (favicon.svg, viewBox 0..96).
// bbox du glyphe ≈ x[32.47..66.84] y[25.91..71], centre ≈ (49.65, 48.45).
const B_PATH =
  'M36.5 71V64.75H49.5312C52.4896 64.75 54.7396 64.1562 56.2812 62.9688C57.8438 61.7812 58.625 60.0521 58.625 57.7812V57.7188C58.625 56.1979 58.2604 54.9271 57.5312 53.9062C56.8229 52.8646 55.7604 52.0938 54.3438 51.5938C52.9271 51.0729 51.1667 50.8125 49.0625 50.8125H36.5V44.9688H47.7812C50.6979 44.9688 52.9167 44.3958 54.4375 43.25C55.9583 42.1042 56.7188 40.4583 56.7188 38.3125V38.25C56.7188 36.3125 56.0521 34.8125 54.7188 33.75C53.4062 32.6875 51.5521 32.1562 49.1562 32.1562H36.5V25.9062H51.1875C53.9375 25.9062 56.3125 26.375 58.3125 27.3125C60.3333 28.2292 61.8958 29.5312 63 31.2188C64.125 32.9062 64.6875 34.8958 64.6875 37.1875V37.25C64.6875 38.875 64.3125 40.3958 63.5625 41.8125C62.8333 43.2083 61.8229 44.3854 60.5312 45.3438C59.2396 46.2812 57.7917 46.8646 56.1875 47.0938V47.25C58.2917 47.4375 60.1458 48.0208 61.75 49C63.3542 49.9792 64.6042 51.2604 65.5 52.8438C66.3958 54.4062 66.8438 56.1875 66.8438 58.1875V58.25C66.8438 60.875 66.2188 63.1458 64.9688 65.0625C63.7188 66.9583 61.9375 68.4271 59.625 69.4688C57.3333 70.4896 54.5833 71 51.375 71H36.5ZM32.4688 71V25.9062H40.5312V71H32.4688Z'

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function logoMark(cx, cy, r) {
  const glyphH = 45.1
  const s = (r * 1.18) / glyphH
  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff"/>
    <g transform="translate(${cx} ${cy}) scale(${s}) translate(-49.65 -48.45)">
      <path d="${B_PATH}" fill="${INK}"/>
    </g>`
}

function grid() {
  let lines = ''
  for (let x = 40; x < W; x += 40) lines += `<line x1="${x}" y1="0" x2="${x}" y2="${H}"/>`
  for (let y = 40; y < H; y += 40) lines += `<line x1="0" y1="${y}" x2="${W}" y2="${y}"/>`
  return `<g stroke="#ffffff" stroke-opacity="0.045" stroke-width="1">${lines}</g>`
}

function dots(cx, cy) {
  const colors = ['#25d366', '#e4405f', '#25F4EE', '#1877f2', '#0084ff'] // wa, ig, tt, fb, ms
  const gap = 34
  const start = cx - (gap * (colors.length - 1)) / 2
  return colors
    .map((c, i) => `<circle cx="${start + i * gap}" cy="${cy}" r="6.5" fill="${c}"/>`)
    .join('')
}

function banner({ l1, l2 }) {
  const cx = W / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#15222b"/>
      <stop offset="1" stop-color="#0d161b"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="26%" r="60%">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${grid()}
  <rect x="28" y="28" width="${W - 56}" height="${H - 56}" rx="28" fill="none" stroke="#ffffff" stroke-opacity="0.08"/>
  ${logoMark(cx, 168, 70)}
  <text x="${cx}" y="322" text-anchor="middle" font-family="Geist" font-size="60" letter-spacing="-1">
    <tspan font-weight="700" fill="#ffffff">Bedones</tspan><tspan font-weight="500" fill="#9aa0a3"> / Moderator</tspan>
  </text>
  <text x="${cx}" y="392" text-anchor="middle" font-family="Geist" font-weight="500" font-size="27" fill="#c9ced1" letter-spacing="0.1">${esc(l1)}</text>
  <text x="${cx}" y="430" text-anchor="middle" font-family="Geist" font-weight="500" font-size="27" fill="#c9ced1" letter-spacing="0.1">${esc(l2)}</text>
  ${dots(cx, 504)}
  <text x="${cx}" y="560" text-anchor="middle" font-family="Geist" font-weight="600" font-size="22" fill="#7e878c" letter-spacing="1.5">bedones.com</text>
</svg>`
}

const pages = {
  'og-home': {
    l1: 'L’assistant IA qui répond à vos clients 24h/24',
    l2: 'sur WhatsApp, Instagram, TikTok et Facebook.',
  },
  'og-pricing': {
    l1: 'Tarifs simples et transparents.',
    l2: 'Démarrez gratuitement, sans engagement.',
  },
  'og-blog': {
    l1: 'Conseils & ressources pour automatiser',
    l2: 'votre service client sur les réseaux sociaux.',
  },
}

if (!existsSync(FONTS_DIR)) {
  console.error(
    `❌  Polices manquantes : ${FONTS_DIR}\n\nVoir l’en-tête de ce fichier pour récupérer Geist (Regular/Medium/SemiBold/Bold).`,
  )
  process.exit(1)
}

const fontFiles = readdirSync(FONTS_DIR)
  .filter((f) => f.endsWith('.ttf'))
  .map((f) => join(FONTS_DIR, f))

mkdirSync(OUT_DIR, { recursive: true })
for (const [name, copy] of Object.entries(pages)) {
  const resvg = new Resvg(banner(copy), {
    fitTo: { mode: 'width', value: W },
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Geist' },
  })
  const png = resvg.render().asPng()
  writeFileSync(join(OUT_DIR, `${name}.png`), png)
  console.log(`✅  ${name}.png  ${(png.length / 1024).toFixed(1)} KB`)
}
