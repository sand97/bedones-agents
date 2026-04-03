import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppController } from './app.controller'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { OrganisationModule } from './organisation/organisation.module'
import { UploadModule } from './upload/upload.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    OrganisationModule,
    UploadModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
