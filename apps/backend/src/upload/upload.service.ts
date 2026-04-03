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

  private async ensureBucket() {
    const exists = await this.client.bucketExists(this.bucket)
    if (!exists) {
      await this.client.makeBucket(this.bucket)
      this.logger.log(`Bucket "${this.bucket}" created`)
    }
  }
}
