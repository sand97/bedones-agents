import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common'
import { ApiBody, ApiConsumes, ApiCreatedResponse, ApiTags } from '@nestjs/swagger'
import { FileInterceptor } from '@nestjs/platform-express'
import { UploadService } from './upload.service'
import { AuthGuard } from '../auth/auth.guard'
import { UploadResponseDto } from './dto/upload-response.dto'

@ApiTags('Upload')
@Controller('upload')
@UseGuards(AuthGuard)
export class UploadController {
  constructor(private uploadService: UploadService) {}

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
          cb(new BadRequestException('Format non supporté. Utilisez PNG, JPG, SVG ou WEBP.'), false)
          return
        }
        cb(null, true)
      },
    }),
  )
  async uploadLogo(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Aucun fichier fourni')
    }

    const url = await this.uploadService.uploadFile(file, 'logos')
    return { url }
  }
}
