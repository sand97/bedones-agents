import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as Minio from 'minio'
import * as crypto from 'crypto'
// sharp expose `export = sharp` (CommonJS) ; sous `module: commonjs` sans
// esModuleInterop, l'import-equals est la seule forme correcte au runtime.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import sharp = require('sharp')

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name)
  private readonly client: Minio.Client
  private readonly bucket: string
  private readonly publicBaseUrl: string

  constructor(private configService: ConfigService) {
    const endpoint = this.configService.getOrThrow<string>('MINIO_ENDPOINT')
    const port = parseInt(this.configService.getOrThrow<string>('MINIO_PORT'), 10)
    const useSSL = this.configService.get<string>('MINIO_USE_SSL', 'false')
    const ssl = useSSL === 'true' || useSSL === '1'

    this.client = new Minio.Client({
      endPoint: endpoint,
      port,
      useSSL: ssl,
      accessKey: this.configService.getOrThrow<string>('MINIO_ACCESS_KEY'),
      secretKey: this.configService.getOrThrow<string>('MINIO_SECRET_KEY'),
      region: 'us-east-1',
    })
    this.bucket = this.configService.getOrThrow<string>('MINIO_BUCKET')

    // Build public base URL (omit default ports)
    const protocol = ssl ? 'https' : 'http'
    const isDefaultPort = (ssl && port === 443) || (!ssl && port === 80)
    this.publicBaseUrl = isDefaultPort
      ? `${protocol}://${endpoint}`
      : `${protocol}://${endpoint}:${port}`
  }

  /** True if the URL points to our own MinIO bucket (already stored locally). */
  isOwnUrl(url: string | null | undefined): boolean {
    if (!url) return false
    return url.startsWith(`${this.publicBaseUrl}/${this.bucket}/`)
  }

  async uploadFile(file: Express.Multer.File, folder: string): Promise<string> {
    await this.ensureBucket()

    // Use subfolder with UUID to avoid collisions, keep original filename at the end of the URL
    // so platforms like Instagram display the real name instead of UUID
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_')
    const filename = `${folder}/${crypto.randomUUID()}/${safeName}`

    await this.client.putObject(this.bucket, filename, file.buffer, file.size, {
      'Content-Type': file.mimetype,
      'Content-Disposition': `inline; filename="${safeName}"`,
    })

    return `${this.publicBaseUrl}/${this.bucket}/${filename}`
  }

  /**
   * Download an image from a URL and upload it to Minio.
   * Returns the public URL of the uploaded file, or null on failure.
   */
  async uploadFromUrl(imageUrl: string, folder: string): Promise<string | null> {
    try {
      const response = await fetch(imageUrl)
      if (!response.ok) {
        this.logger.warn(`[Upload] Failed to download image (HTTP ${response.status}): ${imageUrl}`)
        return null
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg'
      const ext = contentType.includes('png')
        ? 'png'
        : contentType.includes('webp')
          ? 'webp'
          : 'jpg'
      const buffer = Buffer.from(await response.arrayBuffer())

      await this.ensureBucket()

      const filename = `${folder}/${crypto.randomUUID()}.${ext}`
      await this.client.putObject(this.bucket, filename, buffer, buffer.length, {
        'Content-Type': contentType,
      })

      const url = `${this.publicBaseUrl}/${this.bucket}/${filename}`
      this.logger.log(`[Upload] Uploaded ${imageUrl.substring(0, 80)}... → ${url}`)
      return url
    } catch (error) {
      this.logger.error(`[Upload] Failed to upload from URL: ${imageUrl}`, error)
      return null
    }
  }

  /**
   * Upload a raw buffer to Minio.
   * Returns the public URL of the uploaded file, or null on failure.
   */
  async uploadBuffer(
    buffer: Buffer,
    name: string,
    contentType: string,
    folder: string,
  ): Promise<string | null> {
    try {
      await this.ensureBucket()

      const ext = contentType.includes('png')
        ? 'png'
        : contentType.includes('webp')
          ? 'webp'
          : contentType.includes('mp4')
            ? 'mp4'
            : contentType.includes('ogg') || contentType.includes('opus')
              ? 'ogg'
              : contentType.includes('pdf')
                ? 'pdf'
                : contentType.includes('jpeg') || contentType.includes('jpg')
                  ? 'jpg'
                  : 'bin'
      const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const filename = `${folder}/${crypto.randomUUID()}/${safeName}.${ext}`

      await this.client.putObject(this.bucket, filename, buffer, buffer.length, {
        'Content-Type': contentType,
      })

      const url = `${this.publicBaseUrl}/${this.bucket}/${filename}`
      this.logger.log(`[Upload] Uploaded buffer "${name}" → ${url}`)
      return url
    } catch (error) {
      this.logger.error(`[Upload] Failed to upload buffer "${name}":`, error)
      return null
    }
  }

  /**
   * Optimise une image produit avant stockage commerce :
   * - auto-rotation selon l'EXIF,
   * - redimensionnement dans une boîte max (sans jamais agrandir),
   * - compression (JPEG progressif par défaut, PNG si transparence).
   * Garantit une taille de fichier raisonnable tout en gardant une
   * résolution adaptée aux catalogues (Meta recommande ≥ 500px).
   */
  async optimizeProductImage(
    buffer: Buffer,
  ): Promise<{ buffer: Buffer; contentType: string; width: number; height: number }> {
    const MAX_DIM = 1600
    const base = sharp(buffer, { failOn: 'none' }).rotate()
    const meta = await base.metadata()
    const resized = base.resize({
      width: MAX_DIM,
      height: MAX_DIM,
      fit: 'inside',
      withoutEnlargement: true,
    })

    let outBuffer: Buffer
    let contentType: string
    if (meta.hasAlpha) {
      outBuffer = await resized.png({ compressionLevel: 9, palette: true }).toBuffer()
      contentType = 'image/png'
    } else {
      outBuffer = await resized.jpeg({ quality: 82, mozjpeg: true, progressive: true }).toBuffer()
      contentType = 'image/jpeg'
    }

    const outMeta = await sharp(outBuffer).metadata()
    return {
      buffer: outBuffer,
      contentType,
      width: outMeta.width ?? 0,
      height: outMeta.height ?? 0,
    }
  }

  /** Upload JSON at an exact key (deterministic, overwrites). Returns its public URL. */
  async uploadJsonAtKey(key: string, data: unknown): Promise<string> {
    await this.ensureBucket()
    const buffer = Buffer.from(JSON.stringify(data), 'utf8')
    await this.client.putObject(this.bucket, key, buffer, buffer.length, {
      'Content-Type': 'application/json',
    })
    return `${this.publicBaseUrl}/${this.bucket}/${key}`
  }

  /** Read and parse a JSON object stored at an exact key. Returns null on failure. */
  async getJson<T>(key: string): Promise<T | null> {
    try {
      const stream = await this.client.getObject(this.bucket, key)
      const chunks: Buffer[] = []
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (chunk: Buffer) => chunks.push(chunk))
        stream.on('end', () => resolve())
        stream.on('error', reject)
      })
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
    } catch (error) {
      this.logger.warn(
        `[Upload] getJson failed for ${key}: ${error instanceof Error ? error.message : error}`,
      )
      return null
    }
  }

  private async ensureBucket() {
    const exists = await this.client.bucketExists(this.bucket)
    if (!exists) {
      await this.client.makeBucket(this.bucket, 'us-east-1')
      this.logger.log(`Bucket "${this.bucket}" created`)
    }
  }
}
