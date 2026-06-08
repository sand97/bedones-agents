import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from 'generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Cross-platform webhook helpers shared by the platform-specific webhook
 * services (Meta, WhatsApp, TikTok).
 */
@Injectable()
export class WebhookCommonService {
  private readonly logger = new Logger(WebhookCommonService.name)

  constructor(private prisma: PrismaService) {}

  // ─── Ad / referral detection ───
  // When an incoming message originates from an ad, we flag the conversation so the
  // agent's "activate on ad messages" scope can pick it up. Detection is best-effort
  // and platform-specific.

  /** Persist ad provenance on the conversation. No-op when `referral` is null. */
  async markConversationFromAd(
    conversationId: string,
    referral: Prisma.InputJsonValue | null,
  ): Promise<void> {
    if (!referral) return
    try {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { fromAd: true, adReferral: referral },
      })
    } catch (error) {
      this.logger.warn(`Failed to flag conversation ${conversationId} as ad-sourced`, error)
    }
  }
}
