import { Injectable, Logger } from '@nestjs/common'
import * as Tesseract from 'tesseract.js'

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name)

  async extractText(imageBuffer: Buffer): Promise<string> {
    try {
      this.logger.debug('Starting OCR text extraction...')

      const {
        data: { text },
      } = await Tesseract.recognize(imageBuffer, 'fra+eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            this.logger.debug(`OCR progress: ${Math.round(m.progress * 100)}%`)
          }
        },
      })

      this.logger.debug(`OCR completed. Extracted ${text.length} characters`)
      return text.trim()
    } catch (error: any) {
      this.logger.error('Error during OCR text extraction:', error)
      throw new Error(`OCR extraction failed: ${error.message}`, { cause: error })
    }
  }
}
