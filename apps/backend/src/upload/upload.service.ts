import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as Minio from 'minio'
import * as crypto from 'crypto'

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name)
  private readonly client: Minio.Client
  private readonly bucket: string

  constructor(private configService: ConfigService) {
    this.client = new Minio.Client({
      endPoint: this.configService.getOrThrow<string>('MINIO_ENDPOINT'),
      port: parseInt(this.configService.getOrThrow<string>('MINIO_PORT'), 10),
      useSSL: false,
      accessKey: this.configService.getOrThrow<string>('MINIO_ACCESS_KEY'),
      secretKey: this.configService.getOrThrow<string>('MINIO_SECRET_KEY'),
    })
    this.bucket = this.configService.getOrThrow<string>('MINIO_BUCKET')
  }

  async uploadFile(file: Express.Multer.File, folder: string): Promise<string> {
    await this.ensureBucket()

    const ext = file.originalname.split('.').pop() || 'bin'
    const filename = `${folder}/${crypto.randomUUID()}.${ext}`

    await this.client.putObject(this.bucket, filename, file.buffer, file.size, {
      'Content-Type': file.mimetype,
    })

    const endpoint = this.configService.getOrThrow<string>('MINIO_ENDPOINT')
    const port = this.configService.getOrThrow<string>('MINIO_PORT')

    return `http://${endpoint}:${port}/${this.bucket}/${filename}`
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

      const endpoint = this.configService.getOrThrow<string>('MINIO_ENDPOINT')
      const port = this.configService.getOrThrow<string>('MINIO_PORT')

      const url = `http://${endpoint}:${port}/${this.bucket}/${filename}`
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
      await this.client.makeBucket(this.bucket)
      this.logger.log(`Bucket "${this.bucket}" created`)
    }
  }
}
