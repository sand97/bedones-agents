import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { WhatsAppModule } from './whatsapp/whatsapp.module'

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), WhatsAppModule],
})
export class AppModule {}
