import { Logger } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import type { Job } from 'bullmq'
import { CONTACT_LANGUAGE_QUEUE } from '../queue/queue.module'
import {
  ContactLanguageService,
  type ContactLanguageJobData,
  type ContactLanguageJobName,
} from './contact-language.service'

@Processor(CONTACT_LANGUAGE_QUEUE)
export class ContactLanguageProcessor extends WorkerHost {
  private readonly logger = new Logger(ContactLanguageProcessor.name)

  constructor(private contactLanguage: ContactLanguageService) {
    super()
  }

  async process(job: Job<unknown>): Promise<void> {
    const name = job.name as ContactLanguageJobName
    if (name === 'detect-contact-language') {
      const { conversationId } = job.data as ContactLanguageJobData
      await this.contactLanguage.detectConversationLanguage(conversationId)
      return
    }
    this.logger.warn(`[Language] unknown job name: ${String(name)}`)
  }
}
