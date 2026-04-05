import { Module } from '@nestjs/common'
import { MulterModule } from '@nestjs/platform-express'
import { UploadController } from './upload.controller'
import { UploadService } from './upload.service'
import { MediaConverterService } from './media-converter.service'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [
    AuthModule,
    MulterModule.register({
      storage: undefined, // use memory storage (buffer)
    }),
  ],
  controllers: [UploadController],
  providers: [UploadService, MediaConverterService],
  exports: [UploadService, MediaConverterService],
})
export class UploadModule {}
