import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  Logger,
} from '@nestjs/common'
import { ApiBody, ApiConsumes, ApiCreatedResponse, ApiTags } from '@nestjs/swagger'
import { FileInterceptor } from '@nestjs/platform-express'
import { I18nContext } from 'nestjs-i18n'
import { UploadService } from './upload.service'
import { MediaConverterService } from './media-converter.service'
import { AuthGuard } from '../auth/auth.guard'
import { UploadResponseDto } from './dto/upload-response.dto'

@ApiTags('Upload')
@Controller('upload')
@UseGuards(AuthGuard)
export class UploadController {
  private readonly logger = new Logger(UploadController.name)

  constructor(
    private uploadService: UploadService,
    private mediaConverter: MediaConverterService,
  ) {}

  @Post('logo')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({ type: UploadResponseDto })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
        if (!allowed.includes(file.mimetype)) {
          cb(
            new BadRequestException(
              I18nContext.current()?.t('errors.upload.unsupported_image_format') ??
                'Format non supporté. Utilisez PNG, JPG, SVG ou WEBP.',
            ),
            false,
          )
          return
        }
        cb(null, true)
      },
    }),
  )
  async uploadLogo(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException(
        I18nContext.current()?.t('errors.upload.no_file') ?? 'Aucun fichier fourni',
      )
    }

    const url = await this.uploadService.uploadFile(file, 'logos')
    return { url }
  }

  @Post('chat-media')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({ type: UploadResponseDto })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'image/png',
          'image/jpeg',
          'image/webp',
          'audio/webm',
          'audio/ogg',
          'audio/mp4',
          'audio/m4a',
          'audio/mpeg',
          'audio/wav',
          'video/mp4',
          'video/quicktime',
          'video/webm',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'text/plain',
          'application/zip',
          'application/x-rar-compressed',
        ]
        if (!allowed.includes(file.mimetype)) {
          cb(
            new BadRequestException(
              I18nContext.current()?.t('errors.upload.unsupported_format') ??
                'Format de fichier non supporté.',
            ),
            false,
          )
          return
        }
        cb(null, true)
      },
    }),
  )
  async uploadChatMedia(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException(
        I18nContext.current()?.t('errors.upload.no_file') ?? 'Aucun fichier fourni',
      )
    }

    // Convert audio to M4A (AAC) for Instagram/Messenger compatibility
    const isAudio = file.mimetype.startsWith('audio/')
    if (isAudio) {
      const result = await this.mediaConverter.convertAudioToM4A(file.buffer, file.mimetype)
      file.buffer = result.buffer
      file.mimetype = result.mimetype
      file.size = result.buffer.length
      file.originalname = file.originalname.replace(/\.[^.]+$/, `.${result.extension}`)
      this.logger.log(`[ChatMedia] Audio converted → ${result.mimetype} (${file.size} bytes)`)
    }

    // Convert video to H.264 MP4 for Instagram mobile compatibility
    if (!isAudio && file.mimetype.startsWith('video/')) {
      const result = await this.mediaConverter.convertVideoToMp4(file.buffer, file.mimetype)
      file.buffer = result.buffer
      file.mimetype = result.mimetype
      file.size = result.buffer.length
      file.originalname = file.originalname.replace(/\.[^.]+$/, `.${result.extension}`)
      this.logger.log(`[ChatMedia] Video converted → ${result.mimetype} (${file.size} bytes)`)
    }

    const url = await this.uploadService.uploadFile(file, 'chat-media')
    return { url }
  }
}
