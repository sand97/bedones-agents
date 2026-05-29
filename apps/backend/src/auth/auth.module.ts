import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { AuthGuard } from './auth.guard'
import { EncryptionService } from './encryption.service'
import { WhatsAppOtpService } from './whatsapp-otp.service'
import { WhatsAppLoginService } from './whatsapp-login.service'

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, EncryptionService, WhatsAppOtpService, WhatsAppLoginService],
  exports: [AuthService, AuthGuard, EncryptionService, WhatsAppOtpService, JwtModule],
})
export class AuthModule {}
