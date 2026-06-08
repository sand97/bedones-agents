import { Injectable } from '@nestjs/common'
import { MessagingCommonService } from './messaging-common.service'
import { ConversationService } from './conversation.service'
import { MessageSenderService } from './message-sender.service'
import { ConversationSyncService } from './conversation-sync.service'
import { ConversationHistoryService } from './conversation-history.service'
import { ProductMessagingService } from './product-messaging.service'
import type {
  EchoMessageOptions,
  EchoMessageResult,
  HistoricalMessageInput,
  HistoryConversationRef,
  TikTokMessageType,
  TikTokSenderAction,
  TikTokTemplatePayload,
} from './messaging.types'

// Re-exported for the modules/services that historically imported these symbols
// from `./messaging.service`. Keep them importable here so external imports stay
// stable after the facade refactor.
export { HISTORY_SYNC_WINDOW_DAYS } from './messaging.types'
export type { HistoryConversationRef, HistoricalMessageInput } from './messaging.types'

/**
 * Thin facade over the focused messaging sub-services. Every public method here
 * delegates to the appropriate sub-service. Controllers, the webhook service, the
 * agent message processor, MCP tools and agent tools import `MessagingService`,
 * so its public surface must stay stable.
 */
@Injectable()
export class MessagingService {
  constructor(
    private readonly common: MessagingCommonService,
    private readonly conversation: ConversationService,
    private readonly sender: MessageSenderService,
    private readonly conversationSync: ConversationSyncService,
    private readonly history: ConversationHistoryService,
    private readonly productMessaging: ProductMessagingService,
  ) {}

  // ─── Conversations ───

  getConversations(userId: string, accountId: string) {
    return this.conversation.getConversations(userId, accountId)
  }

  getMessages(userId: string, conversationId: string) {
    return this.conversation.getMessages(userId, conversationId)
  }

  markConversationAsRead(userId: string, conversationId: string) {
    return this.conversation.markConversationAsRead(userId, conversationId)
  }

  getAgentStatusForConversation(userId: string, conversationId: string) {
    return this.conversation.getAgentStatusForConversation(userId, conversationId)
  }

  setConversationAgentOverride(
    userId: string,
    conversationId: string,
    override: 'FORCE_ON' | 'FORCE_OFF',
  ) {
    return this.conversation.setConversationAgentOverride(userId, conversationId, override)
  }

  handleIncomingMessage(
    socialAccountId: string,
    senderId: string,
    senderName: string,
    messageText: string,
    platformMsgId: string | null,
    mediaUrl: string | null,
    mediaType: string | null,
    timestamp: Date,
    _orgId: string,
    senderAvatar?: string | null,
    fileName?: string | null,
    fileSize?: number | null,
    replyToMid?: string | null,
    metadata?: Record<string, unknown> | null,
    platformThreadId?: string | null,
    participantUsername?: string | null,
  ) {
    return this.conversation.handleIncomingMessage(
      socialAccountId,
      senderId,
      senderName,
      messageText,
      platformMsgId,
      mediaUrl,
      mediaType,
      timestamp,
      _orgId,
      senderAvatar,
      fileName,
      fileSize,
      replyToMid,
      metadata,
      platformThreadId,
      participantUsername,
    )
  }

  handleEchoMessage(
    socialAccountId: string,
    recipientId: string,
    messageText: string,
    platformMsgId: string | null,
    timestamp: Date,
    mediaUrl?: string | null,
    mediaType?: string | null,
    fileName?: string | null,
    fileSize?: number | null,
    options?: EchoMessageOptions,
  ): Promise<EchoMessageResult | null> {
    return this.conversation.handleEchoMessage(
      socialAccountId,
      recipientId,
      messageText,
      platformMsgId,
      timestamp,
      mediaUrl,
      mediaType,
      fileName,
      fileSize,
      options,
    )
  }

  // ─── Sending ───

  sendMessage(
    userId: string,
    conversationId: string,
    message?: string,
    mediaUrl?: string,
    mediaType?: 'image' | 'video' | 'audio' | 'file',
    fileName?: string,
    fileSize?: number,
    replyToId?: string,
    tiktokMessageType?: TikTokMessageType,
    tiktokSharePostId?: string,
    tiktokTemplate?: TikTokTemplatePayload,
    tiktokSenderAction?: TikTokSenderAction,
  ) {
    return this.sender.sendMessage(
      userId,
      conversationId,
      message,
      mediaUrl,
      mediaType,
      fileName,
      fileSize,
      replyToId,
      tiktokMessageType,
      tiktokSharePostId,
      tiktokTemplate,
      tiktokSenderAction,
    )
  }

  sendReaction(userId: string, messageId: string, emoji: string) {
    return this.sender.sendReaction(userId, messageId, emoji)
  }

  sendTemplateMessage(
    userId: string,
    conversationId: string,
    metaTemplateName: string,
    metaTemplateLanguage: string,
    variables?: Record<string, string>,
    renderedBody?: string,
    metaTemplateId?: string,
  ) {
    return this.sender.sendTemplateMessage(
      userId,
      conversationId,
      metaTemplateName,
      metaTemplateLanguage,
      variables,
      renderedBody,
      metaTemplateId,
    )
  }

  sendMessageAsAgent(
    conversationId: string,
    message: string,
  ): Promise<{ id: string; message: string }> {
    return this.sender.sendMessageAsAgent(conversationId, message)
  }

  sendTypingIndicator(conversationId: string, userId?: string): Promise<void> {
    return this.sender.sendTypingIndicator(conversationId, userId)
  }

  sendWhatsAppTemplatePayload(
    phoneNumberId: string,
    recipientPhone: string,
    accessToken: string,
    templateName: string,
    languageCode: string,
    variables?: Record<string, string>,
  ): Promise<string | null> {
    return this.sender.sendWhatsAppTemplatePayload(
      phoneNumberId,
      recipientPhone,
      accessToken,
      templateName,
      languageCode,
      variables,
    )
  }

  // ─── Sync ───

  syncConversations(userId: string, accountId: string) {
    return this.conversationSync.syncConversations(userId, accountId)
  }

  fetchTikTokDirectMessageParticipantProfile(
    businessId: string,
    accessToken: string,
    conversationId: string,
    participantId: string,
  ): Promise<{ displayName: string | null; profileImage: string | null } | null> {
    return this.conversationSync.fetchTikTokDirectMessageParticipantProfile(
      businessId,
      accessToken,
      conversationId,
      participantId,
    )
  }

  mirrorTikTokParticipantAvatar(
    socialAccountId: string,
    participantId: string,
    candidateAvatar: string | null,
  ): Promise<string | null> {
    return this.conversationSync.mirrorTikTokParticipantAvatar(
      socialAccountId,
      participantId,
      candidateAvatar,
    )
  }

  mapTikTokMessageForStorage(
    businessId: string,
    accessToken: string,
    conversationId: string,
    msg: {
      message_id?: string
      message_type?: string
      text?: { body?: string }
      image?: { media_id?: string }
      video?: { media_id?: string }
      share_post?: { item_id?: string; embed_url?: string }
      template?: TikTokTemplatePayload
      reactions?: Array<{ sender_id?: string; emoji?: string }>
    },
  ): Promise<{
    message: string
    mediaUrl: string | null
    mediaType: string | null
    fileName: string | null
    fileSize: number | null
    reactions?: import('generated/prisma/client').Prisma.InputJsonValue
    metadata?: import('generated/prisma/client').Prisma.InputJsonValue
  }> {
    return this.conversationSync.mapTikTokMessageForStorage(
      businessId,
      accessToken,
      conversationId,
      msg,
    )
  }

  // ─── History ───

  backfillConversationHistory(conversationId: string, limit = 20): Promise<number> {
    return this.history.backfillConversationHistory(conversationId, limit)
  }

  handleHistoricalMessage(params: HistoricalMessageInput): Promise<boolean> {
    return this.history.handleHistoricalMessage(params)
  }

  listHistoryConversations(socialAccountId: string): Promise<HistoryConversationRef[]> {
    return this.history.listHistoryConversations(socialAccountId)
  }

  syncConversationHistory(socialAccountId: string, ref: HistoryConversationRef): Promise<number> {
    return this.history.syncConversationHistory(socialAccountId, ref)
  }

  // ─── Product messaging ───

  sendProductMessage(
    userId: string,
    conversationId: string,
    productRetailerIds: string[],
    catalogId: string,
    format: 'product' | 'product_list' | 'carousel' | 'catalog_message',
    headerText?: string,
    bodyText?: string,
    footerText?: string,
  ) {
    return this.productMessaging.sendProductMessage(
      userId,
      conversationId,
      productRetailerIds,
      catalogId,
      format,
      headerText,
      bodyText,
      footerText,
    )
  }

  sendProductMessageAsAgent(
    conversationId: string,
    productRetailerIds: string[],
    catalogId: string,
    format: 'product' | 'product_list' | 'carousel' | 'catalog_message',
    headerText?: string,
    bodyText?: string,
    footerText?: string,
  ): Promise<{ id: string; message: string }> {
    return this.productMessaging.sendProductMessageAsAgent(
      conversationId,
      productRetailerIds,
      catalogId,
      format,
      headerText,
      bodyText,
      footerText,
    )
  }

  buildEnrichedItems(
    catalogProviderId: string,
    retailerIds: string[],
  ): Promise<
    Array<{
      productRetailerId: string
      name: string | null
      imageUrl: string | null
      price: number | null
      currency: string | null
    }>
  > {
    return this.productMessaging.buildEnrichedItems(catalogProviderId, retailerIds)
  }

  buildEnrichedItemsForSocialAccount(
    socialAccountId: string,
    catalogProviderId: string,
    retailerIds: string[],
  ): Promise<
    Array<{
      productRetailerId: string
      name: string | null
      imageUrl: string | null
      price: number | null
      currency: string | null
    }>
  > {
    return this.productMessaging.buildEnrichedItemsForSocialAccount(
      socialAccountId,
      catalogProviderId,
      retailerIds,
    )
  }
}
