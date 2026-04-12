import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class SmartCropService {
  private readonly logger = new Logger(SmartCropService.name)
  private readonly imageCropperUrl: string

  constructor(private readonly configService: ConfigService) {
    this.imageCropperUrl =
      this.configService.get<string>('IMAGE_CROPPER_URL') || 'http://localhost:8011'
  }

  async cropOpenCV(imageBuffer: Buffer): Promise<Buffer> {
    try {
      const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/jpeg' })
      const formData = new FormData()
      formData.append('file', blob, 'input.jpg')

      const response = await fetch(`${this.imageCropperUrl}/crop/opencv`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        this.logger.warn(`OpenCV crop service returned ${response.status}. Using original.`)
        return imageBuffer
      }

      const data = (await response.json()) as { success: boolean; image_base64?: string }
      const base64Image = data?.image_base64

      if (!base64Image) {
        this.logger.warn('OpenCV crop service returned no image. Using original.')
        return imageBuffer
      }

      return Buffer.from(base64Image, 'base64')
    } catch (error: any) {
      this.logger.warn(`OpenCV crop failed, using original image: ${error?.message || error}`)
      return imageBuffer
    }
  }
}
