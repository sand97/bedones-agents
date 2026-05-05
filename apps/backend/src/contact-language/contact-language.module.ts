import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { CONTACT_LANGUAGE_QUEUE, QueueModule } from '../queue/queue.module'
import { ContactLanguageService } from './contact-language.service'
import { ContactLanguageProcessor } from './contact-language.processor'

@Module({
  imports: [QueueModule, BullModule.registerQueue({ name: CONTACT_LANGUAGE_QUEUE })],
  providers: [ContactLanguageService, ContactLanguageProcessor],
  exports: [ContactLanguageService],
})
export class ContactLanguageModule {}
