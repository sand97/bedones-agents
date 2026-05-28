#!/usr/bin/env node
// Generate static sitemap.xml at build time using the blog frontmatter
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SITE = 'https://bedones.com'
const BLOG_DIR = resolve(__dirname, '../src/app/data/blog')
const OUT = resolve(__dirname, '../public/sitemap.xml')

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null
  const meta = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const k = line.slice(0, idx).trim()
    const v = line
      .slice(idx + 1)
      .trim()
      .replace(/^"|"$/g, '')
    meta[k] = v
  }
  return meta
}

const blogFiles = readdirSync(BLOG_DIR).filter((f) => f.endsWith('.md'))
const articles = blogFiles
  .map((f) => parseFrontmatter(readFileSync(join(BLOG_DIR, f), 'utf8')))
  .filter(Boolean)
  .sort((a, b) => new Date(b.date) - new Date(a.date))

const today = new Date().toISOString().slice(0, 10)
const urls = [
  { loc: `${SITE}/`, lastmod: today, changefreq: 'weekly', priority: '1.0' },
  { loc: `${SITE}/pricing`, lastmod: today, changefreq: 'monthly', priority: '0.9' },
  { loc: `${SITE}/blog`, lastmod: today, changefreq: 'weekly', priority: '0.9' },
  ...articles.map((a) => ({
    loc: `${SITE}/blog/${a.slug}`,
    lastmod: a.date,
    changefreq: 'monthly',
    priority: '0.7',
  })),
]

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>
`

writeFileSync(OUT, xml, 'utf8')
console.log(`✓ sitemap.xml generated (${urls.length} URLs) → ${OUT}`)
