import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as Minio from 'minio'
import * as crypto from 'crypto'

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

  private async ensureBucket() {
    const exists = await this.client.bucketExists(this.bucket)
    if (!exists) {
      await this.client.makeBucket(this.bucket, 'us-east-1')
      this.logger.log(`Bucket "${this.bucket}" created`)
    }
  }
}
