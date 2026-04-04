/**
 * Convert blog SVG illustrations to JPG for SEO (og:image, structured data).
 *
 * Usage:
 *   node scripts/convert-blog-svg-to-jpg.mjs
 *
 * Requirements:
 *   npm install sharp  (or pnpm add -D sharp)
 *
 * Reads every .svg in public/blog/ and writes a .jpg next to it.
 */

import { readdir, readFile } from 'node:fs/promises'
import { join, basename, extname } from 'node:path'

const BLOG_DIR = new URL('../public/blog', import.meta.url).pathname
const WIDTH = 1200
const HEIGHT = 675 // 16:9 ratio — ideal for og:image

async function convert() {
  let sharp
  try {
    sharp = (await import('sharp')).default
  } catch {
    console.error(
      '❌  sharp is not installed. Run:\n\n  pnpm add -D sharp\n\nThen re-run this script.',
    )
    process.exit(1)
  }

  const files = await readdir(BLOG_DIR)
  const svgs = files.filter((f) => extname(f) === '.svg')

  if (svgs.length === 0) {
    console.log('No SVG files found in', BLOG_DIR)
    return
  }

  console.log(`Converting ${svgs.length} SVG → JPG (${WIDTH}×${HEIGHT})…\n`)

  for (const file of svgs) {
    const svgPath = join(BLOG_DIR, file)
    const jpgName = basename(file, '.svg') + '.jpg'
    const jpgPath = join(BLOG_DIR, jpgName)

    const svgBuffer = await readFile(svgPath)

    await sharp(svgBuffer)
      .resize(WIDTH, HEIGHT, { fit: 'contain', background: '#ffffff' })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85, mozjpeg: true })
      .toFile(jpgPath)

    console.log(`  ✅  ${file} → ${jpgName}`)
  }

  console.log('\nDone!')
}

convert()
