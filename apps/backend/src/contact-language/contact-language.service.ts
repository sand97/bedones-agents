import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { OnEvent } from '@nestjs/event-emitter'
import type { Queue } from 'bullmq'
import { z } from 'zod'
import { PrismaService } from '../prisma/prisma.service'
import { CONTACT_LANGUAGE_QUEUE } from '../queue/queue.module'
import { LlmFactoryService } from '../common/llm/llm-factory.service'
import { buildLlmTrace } from '../common/llm/llm-trace'
import type { IncomingMessageEvent } from '../social/webhook.service'

export type ContactLanguageJobName = 'detect-contact-language'

export interface ContactLanguageJobData {
  conversationId: string
}

const LanguageDetectionSchema = z.object({
  languageCode: z
    .string()
    .describe('A short BCP-47 language code such as fr, en, es, ar, ja, pt, de, it.'),
  confidence: z.number().min(0).max(1).describe('Confidence from 0 to 1.'),
})

function normalizeLanguageCode(input: string): string | null {
  const code = input.trim().toLowerCase().replace('_', '-')
  if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(code)) return null
  return code
}

@Injectable()
export class ContactLanguageService {
  private readonly logger = new Logger(ContactLanguageService.name)

  constructor(
    private prisma: PrismaService,
    private llmFactory: LlmFactoryService,
    @InjectQueue(CONTACT_LANGUAGE_QUEUE) private queue: Queue,
  ) {}

  @OnEvent('message.incoming')
  async onIncomingMessage(payload: IncomingMessageEvent) {
    if (payload.provider !== 'WHATSAPP') return
    if (!payload.message.text?.trim()) return

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: payload.conversationId },
      select: { languageCode: true, languageSource: true },
    })
    if (!conversation) return
    if (conversation.languageCode || conversation.languageSource === 'MANUAL') return

    const inboundTextCount = await this.prisma.directMessage.count({
      where: {
        conversationId: payload.conversationId,
        isFromPage: false,
        message: { not: '' },
      },
    })
    if (inboundTextCount < 3) return

    await this.queue.add(
      'detect-contact-language',
      { conversationId: payload.conversationId } satisfies ContactLanguageJobData,
      {
        jobId: `detect-contact-language-${payload.conversationId}`,
        delay: 5_000,
        attempts: 2,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    )
  }

  async detectConversationLanguage(conversationId: string): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        languageCode: true,
        languageSource: true,
        socialAccount: { select: { organisationId: true } },
      },
    })
    if (!conversation) return
    if (conversation.languageCode || conversation.languageSource === 'MANUAL') return

    const messages = await this.prisma.directMessage.findMany({
      where: { conversationId, isFromPage: false, message: { not: '' } },
      orderBy: { createdTime: 'desc' },
      take: 8,
      select: { message: true },
    })
    if (messages.length < 3) return

    try {
      const detector = this.llmFactory.createStructuredChatModel('flash', LanguageDetectionSchema, {
        temperature: 0,
        maxOutputTokens: 80,
        trace: buildLlmTrace({
          feature: 'contact-language',
          organisationId: conversation.socialAccount?.organisationId,
          conversationId,
        }),
      })
      const result = await detector.invoke([
        {
          role: 'system',
          content:
            'Detect the dominant language used by this WhatsApp contact. Return only the language code and confidence.',
        },
        {
          role: 'user',
          content: messages
            .slice()
            .reverse()
            .map((m, index) => `${index + 1}. ${m.message}`)
            .join('\n'),
        },
      ])

      const languageCode = normalizeLanguageCode(result.languageCode)
      if (!languageCode) return

      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: {
          languageCode,
          languageSource: 'AI',
          languageConfidence: result.confidence,
          languageDetectedAt: new Date(),
        },
      })
    } catch (error) {
      this.logger.warn(
        `[Language] detection skipped for ${conversationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }
}
