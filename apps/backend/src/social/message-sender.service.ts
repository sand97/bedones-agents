import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common'
import { Prisma } from 'generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { MediaConverterService } from '../upload/media-converter.service'
import { UploadService } from '../upload/upload.service'
import { FACEBOOK_GRAPH_API_VERSION } from '../common/config/facebook-scopes.config'
import { EventsGateway } from '../gateway/events.gateway'
import { SocialHealthService } from './social-health.service'
import { MessagingCommonService } from './messaging-common.service'
import {
  TikTokMessageType,
  TikTokSenderAction,
  TikTokSendResult,
  TikTokTemplatePayload,
} from './messaging.types'

@Injectable()
export class MessageSenderService {
  private readonly logger = new Logger(MessageSenderService.name)

  constructor(
    private prisma: PrismaService,
    private mediaConverter: MediaConverterService,
    private uploadService: UploadService,
    private eventsGateway: EventsGateway,
    private socialHealth: SocialHealthService,
    private common: MessagingCommonService,
  ) {}

  // ─── Send a message ───

  async sendMessage(
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
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        socialAccount: {
          select: {
            id: true,
            provider: true,
            providerAccountId: true,
            organisationId: true,
            scopes: true,
            disabled: true,
            featureDisabled: true,
          },
        },
      },
    })
    if (!conversation) throw new NotFoundException('Conversation not found')
    await this.common.assertMembership(userId, conversation.socialAccount.organisationId)
    this.common.assertScope(conversation.socialAccount.scopes, 'messages')
    // Circuit breaker: refuse outbound sends on a disabled account / feature.
    this.socialHealth.ensureOutboundAllowed(conversation.socialAccount, 'MESSAGE')

    const accessToken = await this.common.getDecryptedToken(conversation.socialAccount.id)
    const provider = conversation.socialAccount.provider

    // Resolve the platform message ID of the replied message (for API reply_to)
    // Instagram API with Instagram Login does not support reply_to.
    let replyToPlatformMid: string | null = null
    if (
      replyToId &&
      (provider === 'FACEBOOK' || provider === 'WHATSAPP' || provider === 'TIKTOK')
    ) {
      const repliedMsg = await this.prisma.directMessage.findUnique({
        where: { id: replyToId },
        select: { platformMsgId: true },
      })
      replyToPlatformMid = repliedMsg?.platformMsgId || null
      if (!replyToPlatformMid) {
        this.logger.warn(
          `[${provider}] Reply target ${replyToId} has no platformMsgId, skipping reply_to`,
        )
      }
    }

    let platformMsgId: string | null = null
    let messageToPersist = message || ''
    let mediaUrlToPersist: string | null = mediaUrl || null
    let mediaTypeToPersist: string | null = mediaType || null
    let metadataToPersist: Prisma.InputJsonValue | undefined
    let displayText = message || (mediaType ? `[${mediaType}]` : '')

    try {
      if (provider === 'FACEBOOK') {
        platformMsgId = await this.sendFacebookMessage(
          conversation.socialAccount.providerAccountId,
          conversation.participantId,
          accessToken,
          message,
          mediaUrl,
          mediaType,
          replyToPlatformMid,
        )
      } else if (provider === 'INSTAGRAM') {
        platformMsgId = await this.sendInstagramMessage(
          conversation.participantId,
          accessToken,
          message,
          mediaUrl,
          mediaType,
        )
      } else if (provider === 'WHATSAPP') {
        platformMsgId = await this.sendWhatsAppMessage(
          conversation.socialAccount.providerAccountId,
          conversation.participantId,
          accessToken,
          message,
          mediaUrl,
          mediaType,
          replyToPlatformMid,
        )
      } else if (provider === 'TIKTOK') {
        const result = await this.sendTikTokMessage({
          conversationId,
          businessId: conversation.socialAccount.providerAccountId,
          conversationPlatformId: conversation.platformThreadId || conversation.participantId,
          accessToken,
          message,
          mediaUrl,
          mediaType,
          fileName,
          replyToMid: replyToPlatformMid,
          messageType: tiktokMessageType,
          sharePostId: tiktokSharePostId,
          template: tiktokTemplate,
          senderAction: tiktokSenderAction,
        })
        platformMsgId = result.platformMsgId
        messageToPersist = result.message
        mediaUrlToPersist = result.mediaUrl ?? mediaUrlToPersist
        mediaTypeToPersist = result.mediaType ?? mediaTypeToPersist
        metadataToPersist = result.metadata
        displayText = result.displayText
      }
    } catch (error) {
      this.logger.error(
        `[${provider}] Failed to send message to platform: ${error instanceof Error ? error.message : error}`,
      )
      await this.socialHealth.recordError({
        socialAccountId: conversation.socialAccount.id,
        provider,
        operation: 'sendMessage',
        feature: 'MESSAGE',
        resource: provider === 'TIKTOK' ? 'tiktok' : 'page',
        error,
        // TikTok: a personal (non-business) account loses messaging instantly,
        // without waiting for the 5-error threshold.
        forceDisableFeature: await this.detectTikTokBusinessLoss(
          provider,
          conversation.socialAccount.providerAccountId,
          accessToken,
        ),
      })
      throw error
    }

    // Sent successfully — clear the consecutive-error counter.
    await this.socialHealth.recordSuccess(conversation.socialAccount.id)

    // Save the sent message
    const savedMessage = await this.prisma.directMessage.create({
      data: {
        conversationId,
        platformMsgId,
        message: messageToPersist,
        senderId: conversation.socialAccount.providerAccountId,
        senderName: 'Page',
        isFromPage: true,
        isRead: true,
        mediaUrl: mediaUrlToPersist,
        mediaType: mediaTypeToPersist,
        fileName: fileName || null,
        fileSize: fileSize || null,
        replyToId: replyToId || null,
        deliveryStatus: provider === 'WHATSAPP' ? 'sent' : null,
        metadata: metadataToPersist ?? Prisma.JsonNull,
        createdTime: new Date(),
      },
      include: {
        replyTo: {
          select: { id: true, message: true, isFromPage: true, mediaType: true },
        },
      },
    })

    // Update conversation
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageText: displayText,
        lastMessageAt: new Date(),
      },
    })

    return {
      ...savedMessage,
      replyTo: savedMessage.replyTo
        ? {
            id: savedMessage.replyTo.id,
            text:
              savedMessage.replyTo.message ||
              (savedMessage.replyTo.mediaType ? `[${savedMessage.replyTo.mediaType}]` : ''),
            from: savedMessage.replyTo.isFromPage ? 'business' : 'customer',
          }
        : undefined,
    }
  }

  /**
   * TikTok messaging requires an active Business account. When a send fails we
   * probe /business/get/: a non-business response means the user downgraded to a
   * personal account, so messaging must be disabled immediately (the Notion
   * spec's "block without waiting for 5 errors" case). Returns 'MESSAGE' to
   * force-disable that feature, or undefined when the probe is inconclusive.
   */
  private async detectTikTokBusinessLoss(
    provider: string,
    businessId: string,
    accessToken: string,
  ): Promise<'MESSAGE' | undefined> {
    if (provider !== 'TIKTOK' || !businessId) return undefined
    try {
      const res = await fetch(
        `https://business-api.tiktok.com/open_api/v1.3/business/get/?business_id=${encodeURIComponent(
          businessId,
        )}&fields=${encodeURIComponent(JSON.stringify(['display_name']))}`,
        { headers: { 'Access-Token': accessToken } },
      )
      const raw = await res.text()
      let data: { code?: number } = {}
      try {
        data = JSON.parse(raw)
      } catch {
        return undefined // non-JSON → cannot confirm, stay safe
      }
      // code 0 means Business access is intact; anything else = lost it.
      return data.code === 0 ? undefined : 'MESSAGE'
    } catch {
      return undefined
    }
  }

  // ─── Send a reaction (WhatsApp) ───
  // Pass an empty `emoji` to remove the current reaction.
  async sendReaction(userId: string, messageId: string, emoji: string) {
    const message = await this.prisma.directMessage.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: {
            socialAccount: {
              select: {
                id: true,
                provider: true,
                providerAccountId: true,
                organisationId: true,
                scopes: true,
              },
            },
          },
        },
      },
    })
    if (!message) throw new NotFoundException('Message not found')

    const conversation = message.conversation
    const provider = conversation.socialAccount.provider
    await this.common.assertMembership(userId, conversation.socialAccount.organisationId)
    this.common.assertScope(conversation.socialAccount.scopes, 'messages')

    if (provider !== 'WHATSAPP') {
      throw new BadRequestException(`Reactions are only supported on WhatsApp (got ${provider})`)
    }
    if (!message.platformMsgId) {
      throw new BadRequestException(
        'Cannot react: target message has no platform ID (not yet synced with WhatsApp)',
      )
    }

    const accessToken = await this.common.getDecryptedToken(conversation.socialAccount.id)

    await this.sendWhatsAppReaction(
      conversation.socialAccount.providerAccountId,
      conversation.participantId,
      accessToken,
      message.platformMsgId,
      emoji,
    )

    // The business is the reactor — store the reaction under the business phone number.
    const businessSenderId = conversation.socialAccount.providerAccountId
    const existing = (message.reactions as { senderId: string; emoji: string }[]) || []
    const updated = existing.filter((r) => r.senderId !== businessSenderId)
    if (emoji) {
      updated.push({ senderId: businessSenderId, emoji })
    }

    await this.prisma.directMessage.update({
      where: { id: message.id },
      data: { reactions: updated },
    })

    if (emoji) {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageText: `[reaction:${emoji}]`,
          lastMessageAt: new Date(),
        },
      })
    }

    this.eventsGateway.emitToOrg(conversation.socialAccount.organisationId, 'message:reaction', {
      conversationId: conversation.id,
      messageId: message.id,
      reactions: updated,
    })

    return { messageId: message.id, reactions: updated }
  }

  async sendTemplateMessage(
    userId: string,
    conversationId: string,
    metaTemplateName: string,
    metaTemplateLanguage: string,
    variables?: Record<string, string>,
    renderedBody?: string,
    metaTemplateId?: string,
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        socialAccount: {
          select: {
            id: true,
            provider: true,
            providerAccountId: true,
            organisationId: true,
            scopes: true,
            disabled: true,
            featureDisabled: true,
          },
        },
      },
    })
    if (!conversation) throw new NotFoundException('Conversation not found')
    await this.common.assertMembership(userId, conversation.socialAccount.organisationId)
    this.common.assertScope(conversation.socialAccount.scopes, 'messages')
    // Circuit breaker: refuse outbound sends on a disabled account / feature.
    this.socialHealth.ensureOutboundAllowed(conversation.socialAccount, 'MESSAGE')

    if (conversation.socialAccount.provider !== 'WHATSAPP') {
      throw new BadRequestException('Template messages are only supported on WhatsApp')
    }

    const accessToken = await this.common.getDecryptedToken(conversation.socialAccount.id)
    const platformMsgId = await this.sendWhatsAppTemplatePayload(
      conversation.socialAccount.providerAccountId,
      conversation.participantId,
      accessToken,
      metaTemplateName,
      metaTemplateLanguage,
      variables,
    )

    const displayText = renderedBody || `[template:${metaTemplateName}]`
    const savedMessage = await this.prisma.directMessage.create({
      data: {
        conversationId,
        platformMsgId,
        message: displayText,
        senderId: conversation.socialAccount.providerAccountId,
        senderName: 'Page',
        isFromPage: true,
        isRead: true,
        mediaType: 'template',
        deliveryStatus: 'sent',
        metadata: {
          kind: 'template',
          templateId: metaTemplateId ?? null,
          templateName: metaTemplateName,
          templateLanguage: metaTemplateLanguage,
          variables: variables ?? {},
        },
        createdTime: new Date(),
      },
    })

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageText: displayText,
        lastMessageAt: new Date(),
      },
    })

    return savedMessage
  }

  // ─── Send message as AI agent (no user auth check) ───

  async sendMessageAsAgent(
    conversationId: string,
    message: string,
  ): Promise<{ id: string; message: string }> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        socialAccount: {
          select: {
            id: true,
            provider: true,
            providerAccountId: true,
            organisationId: true,
            disabled: true,
            featureDisabled: true,
          },
        },
      },
    })
    if (!conversation) throw new NotFoundException('Conversation not found')
    // Circuit breaker: agent auto-replies must also stop on a disabled account.
    this.socialHealth.ensureOutboundAllowed(conversation.socialAccount, 'MESSAGE')

    const accessToken = await this.common.getDecryptedToken(conversation.socialAccount.id)
    const provider = conversation.socialAccount.provider

    let platformMsgId: string | null = null

    try {
      if (provider === 'FACEBOOK') {
        platformMsgId = await this.sendFacebookMessage(
          conversation.socialAccount.providerAccountId,
          conversation.participantId,
          accessToken,
          message,
        )
      } else if (provider === 'INSTAGRAM') {
        platformMsgId = await this.sendInstagramMessage(
          conversation.participantId,
          accessToken,
          message,
        )
      } else if (provider === 'WHATSAPP') {
        platformMsgId = await this.sendWhatsAppMessage(
          conversation.socialAccount.providerAccountId,
          conversation.participantId,
          accessToken,
          message,
        )
      } else if (provider === 'TIKTOK') {
        const result = await this.sendTikTokMessage({
          conversationId,
          businessId: conversation.socialAccount.providerAccountId,
          conversationPlatformId: conversation.platformThreadId || conversation.participantId,
          accessToken,
          message,
          messageType: 'TEXT',
        })
        platformMsgId = result.platformMsgId
      }
    } catch (error) {
      await this.socialHealth.recordError({
        socialAccountId: conversation.socialAccount.id,
        provider,
        operation: 'sendMessageAsAgent',
        feature: 'MESSAGE',
        resource: provider === 'TIKTOK' ? 'tiktok' : 'page',
        error,
        forceDisableFeature: await this.detectTikTokBusinessLoss(
          provider,
          conversation.socialAccount.providerAccountId,
          accessToken,
        ),
      })
      throw error
    }
    await this.socialHealth.recordSuccess(conversation.socialAccount.id)

    const savedMessage = await this.prisma.directMessage.create({
      data: {
        conversationId,
        platformMsgId,
        message,
        senderId: conversation.socialAccount.providerAccountId,
        senderName: 'AI Agent',
        isFromPage: true,
        isRead: true,
        deliveryStatus: provider === 'WHATSAPP' ? 'sent' : null,
        createdTime: new Date(),
      },
    })

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageText: message,
        lastMessageAt: new Date(),
      },
    })

    return { id: savedMessage.id, message: savedMessage.message }
  }

  // ─── Typing indicator (best-effort, never throws) ───

  async sendTypingIndicator(conversationId: string, userId?: string): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        socialAccount: {
          select: {
            id: true,
            provider: true,
            providerAccountId: true,
            organisationId: true,
          },
        },
      },
    })
    if (!conversation) return

    if (userId) {
      try {
        await this.common.assertMembership(userId, conversation.socialAccount.organisationId)
      } catch {
        return
      }
    }

    try {
      const accessToken = await this.common.getDecryptedToken(conversation.socialAccount.id)
      const provider = conversation.socialAccount.provider

      if (provider === 'WHATSAPP') {
        const lastIncoming = await this.prisma.directMessage.findFirst({
          where: { conversationId, isFromPage: false, platformMsgId: { not: null } },
          orderBy: { createdTime: 'desc' },
          select: { platformMsgId: true },
        })
        if (!lastIncoming?.platformMsgId) return
        await this.sendWhatsAppTypingIndicator(
          conversation.socialAccount.providerAccountId,
          lastIncoming.platformMsgId,
          accessToken,
        )
      } else if (provider === 'FACEBOOK') {
        await this.sendMetaSenderAction(
          conversation.socialAccount.providerAccountId,
          conversation.participantId,
          accessToken,
          'typing_on',
          'Messenger',
        )
      } else if (provider === 'INSTAGRAM') {
        await this.sendMetaSenderAction(
          conversation.socialAccount.providerAccountId,
          conversation.participantId,
          accessToken,
          'typing_on',
          'Instagram',
        )
      } else if (provider === 'TIKTOK') {
        await this.sendTikTokMessage({
          conversationId,
          businessId: conversation.socialAccount.providerAccountId,
          conversationPlatformId: conversation.platformThreadId || conversation.participantId,
          accessToken,
          messageType: 'SENDER_ACTION',
          senderAction: 'TYPING',
        })
      }
    } catch (err) {
      this.logger.warn(
        `[Typing] Failed for conversation ${conversationId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  private async sendWhatsAppTypingIndicator(
    phoneNumberId: string,
    incomingMessageId: string,
    accessToken: string,
  ): Promise<void> {
    const url = `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${phoneNumberId}/messages`
    const body = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: incomingMessageId,
      typing_indicator: { type: 'text' },
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      this.logger.warn(
        `[WhatsApp] Typing indicator failed (${response.status}): ${JSON.stringify(data)}`,
      )
    }
  }

  private async sendMetaSenderAction(
    pageOrIgId: string,
    recipientId: string,
    accessToken: string,
    action: 'typing_on' | 'typing_off' | 'mark_seen',
    label: 'Messenger' | 'Instagram',
  ): Promise<void> {
    const url = `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${pageOrIgId}/messages?access_token=${accessToken}`
    const body = {
      recipient: { id: recipientId },
      sender_action: action,
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      this.logger.warn(
        `[${label}] Sender action ${action} failed (${response.status}): ${JSON.stringify(data)}`,
      )
    }
  }

  // ─── Facebook Messenger API ───

  private async sendFacebookMessage(
    pageId: string,
    recipientId: string,
    accessToken: string,
    message?: string,
    mediaUrl?: string,
    mediaType?: string,
    replyToMid?: string | null,
  ): Promise<string | null> {
    const url = `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${pageId}/messages?access_token=${accessToken}`

    // Build message payload
    let messagePayload: Record<string, unknown>
    if (mediaUrl && mediaType) {
      const typeMap: Record<string, string> = {
        audio: 'audio',
        video: 'video',
        image: 'image',
        file: 'file',
      }
      const fbType = typeMap[mediaType] || 'file'
      messagePayload = {
        attachment: {
          type: fbType,
          payload: { url: mediaUrl },
        },
      }
    } else {
      messagePayload = { text: message || '' }
    }

    const body: Record<string, unknown> = {
      recipient: { id: recipientId },
      message: messagePayload,
      messaging_type: 'RESPONSE',
    }
    if (replyToMid) {
      body.reply_to = { mid: replyToMid }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!response.ok) {
      this.logger.error(
        `[Messenger] Send failed (${response.status})\n` +
          `  Payload: ${JSON.stringify(body)}\n` +
          `  Response: ${JSON.stringify(data)}`,
      )
      throw new BadRequestException(
        `Failed to send message: ${JSON.stringify(data?.error?.message || data)}`,
      )
    }

    return (data as { message_id?: string }).message_id || null
  }

  // ─── Instagram DM API ───

  private async sendInstagramMessage(
    recipientId: string,
    accessToken: string,
    message?: string,
    mediaUrl?: string,
    mediaType?: string,
  ): Promise<string | null> {
    const url = `https://graph.instagram.com/${FACEBOOK_GRAPH_API_VERSION}/me/messages`

    // Build message payload
    let messagePayload: Record<string, unknown>
    if (mediaUrl && mediaType) {
      const typeMap: Record<string, string> = {
        audio: 'audio',
        video: 'video',
        image: 'image',
        file: 'file',
      }
      const igType = typeMap[mediaType] || 'file'
      messagePayload = {
        attachment: {
          type: igType,
          payload: { url: mediaUrl },
        },
      }
    } else {
      messagePayload = { text: message || '' }
    }

    const body: Record<string, unknown> = {
      recipient: { id: recipientId },
      message: messagePayload,
    }

    this.logger.log(`[Instagram DM] Sending to ${recipientId}`)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!response.ok) {
      // Log the full payload we sent so we can debug (access_token is in URL, not body)
      this.logger.error(
        `[Instagram DM] Send failed (${response.status})\n` +
          `  Payload: ${JSON.stringify(body)}\n` +
          `  Response: ${JSON.stringify(data)}`,
      )
      throw new BadRequestException(
        `Failed to send Instagram message: ${JSON.stringify(data?.error?.message || data)}`,
      )
    }

    return (data as { message_id?: string }).message_id || null
  }

  // ─── TikTok Business Messaging API ───

  async sendTikTokMessage(args: {
    conversationId: string
    businessId: string
    conversationPlatformId: string
    accessToken: string
    message?: string
    mediaUrl?: string
    mediaType?: 'image' | 'video' | 'audio' | 'file'
    fileName?: string
    replyToMid?: string | null
    messageType?: TikTokMessageType
    sharePostId?: string
    template?: TikTokTemplatePayload
    senderAction?: TikTokSenderAction
  }): Promise<TikTokSendResult> {
    const messageType = this.resolveTikTokMessageType(args)

    if (messageType !== 'SENDER_ACTION') {
      await this.assertTikTokMessagingWindow(args.conversationId)
    }

    const body: Record<string, unknown> = {
      business_id: args.businessId,
      recipient_type: 'CONVERSATION',
      recipient: args.conversationPlatformId,
      message_type: messageType,
    }

    let persisted: TikTokSendResult

    if (messageType === 'TEXT') {
      const text = args.message?.trim()
      if (!text) throw new BadRequestException('TikTok text message is empty')
      if (text.length > 6000)
        throw new BadRequestException('TikTok text message exceeds 6000 characters')
      if (args.mediaUrl)
        throw new BadRequestException('TikTok messages cannot include text and image together')
      body.text = { body: text }
      if (args.replyToMid) {
        body.referenced_message_info = { referenced_message_id: args.replyToMid }
      }
      persisted = {
        platformMsgId: null,
        message: text,
        displayText: text,
      }
    } else if (messageType === 'IMAGE') {
      if (args.mediaType && args.mediaType !== 'image') {
        throw new BadRequestException('TikTok only supports image media attachments')
      }
      if (!args.mediaUrl) throw new BadRequestException('TikTok image message requires mediaUrl')
      if (args.message?.trim()) {
        throw new BadRequestException('TikTok image messages cannot include text')
      }
      if (args.replyToMid) {
        throw new BadRequestException('TikTok only supports text replies')
      }
      const mediaId = await this.uploadTikTokImage(
        args.businessId,
        args.accessToken,
        args.mediaUrl,
        args.fileName,
      )
      body.image = { media_id: mediaId }
      persisted = {
        platformMsgId: null,
        message: '',
        displayText: '[image]',
        mediaUrl: args.mediaUrl,
        mediaType: 'image',
      }
    } else if (messageType === 'SHARE_POST') {
      const itemId = args.sharePostId?.trim()
      if (!itemId) throw new BadRequestException('TikTok Share Post message requires item_id')
      if (args.replyToMid) {
        throw new BadRequestException('TikTok only supports text replies')
      }
      body.share_post = { item_id: itemId }
      persisted = {
        platformMsgId: null,
        message: itemId,
        displayText: '[tiktok post]',
        mediaType: 'tiktok_post',
        metadata: {
          kind: 'tiktok_post',
          itemId,
        } satisfies Prisma.InputJsonValue,
      }
    } else if (messageType === 'TEMPLATE') {
      const template = this.validateTikTokTemplate(args.template)
      if (args.replyToMid) {
        throw new BadRequestException('TikTok only supports text replies')
      }
      body.template = template
      persisted = {
        platformMsgId: null,
        message: template.title,
        displayText: template.title,
        mediaType: 'button',
        metadata: {
          kind: 'tiktok_template',
          template,
        } satisfies Prisma.InputJsonValue,
      }
    } else {
      const senderAction = args.senderAction
      if (!senderAction) throw new BadRequestException('TikTok sender action is required')
      body.sender_action = senderAction
      persisted = {
        platformMsgId: null,
        message: '',
        displayText: senderAction === 'MARK_READ' ? '[mark read]' : '[typing]',
        mediaType: 'sender_action',
        metadata: {
          kind: 'tiktok_sender_action',
          action: senderAction,
        } satisfies Prisma.InputJsonValue,
      }
    }

    const response = await fetch(
      'https://business-api.tiktok.com/open_api/v1.3/business/message/send/',
      {
        method: 'POST',
        headers: {
          'Access-Token': args.accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    )
    const data = await this.common.readTikTokResponse<{ message?: { message_id?: string } }>(
      response,
      'send message',
      body,
    )

    persisted.platformMsgId = data.data?.message?.message_id || null
    return persisted
  }

  private resolveTikTokMessageType(args: {
    message?: string
    mediaUrl?: string
    mediaType?: 'image' | 'video' | 'audio' | 'file'
    messageType?: TikTokMessageType
    sharePostId?: string
    template?: TikTokTemplatePayload
    senderAction?: TikTokSenderAction
  }): TikTokMessageType {
    if (args.messageType) return args.messageType
    if (args.senderAction) return 'SENDER_ACTION'
    if (args.template) return 'TEMPLATE'
    if (args.sharePostId) return 'SHARE_POST'
    if (args.mediaUrl || args.mediaType) return 'IMAGE'
    return 'TEXT'
  }

  private validateTikTokTemplate(template?: TikTokTemplatePayload): TikTokTemplatePayload {
    if (!template) throw new BadRequestException('TikTok template payload is required')
    if (template.type !== 'QA_BUTTON_CARD' && template.type !== 'QA_LINK_CARD') {
      throw new BadRequestException('Unsupported TikTok template type')
    }
    const title = template.title?.trim()
    if (!title) throw new BadRequestException('TikTok template title is required')
    if (title.length > 40)
      throw new BadRequestException('TikTok template title exceeds 40 characters')

    const buttons = (template.buttons || []).reduce<
      Array<{ type: 'REPLY'; title: string; id?: string }>
    >((acc, button) => {
      const buttonTitle = button.title?.trim()
      if (!buttonTitle) return acc
      const id = button.id?.trim()
      acc.push(
        id ? { type: 'REPLY', title: buttonTitle, id } : { type: 'REPLY', title: buttonTitle },
      )
      return acc
    }, [])

    if (buttons.length < 1 || buttons.length > 3) {
      throw new BadRequestException('TikTok templates require 1 to 3 buttons')
    }

    const titleLimit = template.type === 'QA_BUTTON_CARD' ? 20 : 40
    for (const button of buttons) {
      if (button.title.length > titleLimit) {
        throw new BadRequestException(`TikTok button title exceeds ${titleLimit} characters`)
      }
      if (button.id && button.id.length > 40) {
        throw new BadRequestException('TikTok button id exceeds 40 characters')
      }
    }

    return {
      type: template.type,
      title,
      buttons,
    }
  }

  private async uploadTikTokImage(
    businessId: string,
    accessToken: string,
    mediaUrl: string,
    fileName?: string,
  ): Promise<string> {
    const mediaResponse = await fetch(mediaUrl)
    if (!mediaResponse.ok) {
      throw new BadRequestException(
        `Failed to download TikTok image media: ${mediaResponse.status}`,
      )
    }

    const contentType = mediaResponse.headers.get('content-type') || 'image/jpeg'
    const isSupported =
      contentType.includes('jpeg') || contentType.includes('jpg') || contentType.includes('png')
    if (!isSupported) throw new BadRequestException('TikTok image upload supports JPG and PNG only')

    const buffer = Buffer.from(await mediaResponse.arrayBuffer())
    if (buffer.length > 3 * 1024 * 1024) {
      throw new BadRequestException('TikTok image upload is limited to 3 MB')
    }

    const safeName =
      fileName?.replace(/[^a-zA-Z0-9._-]/g, '_') ||
      (contentType.includes('png') ? 'tiktok-image.png' : 'tiktok-image.jpg')
    const formData = new FormData()
    formData.append('business_id', businessId)
    formData.append('media_type', 'IMAGE')
    formData.append('file', new Blob([new Uint8Array(buffer)], { type: contentType }), safeName)

    const response = await fetch(
      'https://business-api.tiktok.com/open_api/v1.3/business/message/media/upload/',
      {
        method: 'POST',
        headers: { 'Access-Token': accessToken },
        body: formData,
      },
    )
    const data = await this.common.readTikTokResponse<{ media_id?: string }>(
      response,
      'upload image',
    )
    if (!data.data?.media_id)
      throw new BadRequestException('TikTok image upload returned no media_id')
    return data.data.media_id
  }

  private async assertTikTokMessagingWindow(conversationId: string) {
    const messages = await this.prisma.directMessage.findMany({
      where: { conversationId },
      orderBy: { createdTime: 'asc' },
      select: { isFromPage: true, createdTime: true, mediaType: true },
    })

    let lastInboundIndex = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (!messages[i].isFromPage) {
        lastInboundIndex = i
        break
      }
    }
    if (lastInboundIndex < 0) {
      throw new BadRequestException('TikTok requires an inbound user message before sending')
    }

    const lastInbound = messages[lastInboundIndex]
    const outboundAfterLastInbound = messages
      .slice(lastInboundIndex + 1)
      .filter((m) => m.isFromPage && m.mediaType !== 'sender_action').length
    const hasBusinessMessageBeforeLastInbound = messages
      .slice(0, lastInboundIndex)
      .some((m) => m.isFromPage && m.mediaType !== 'sender_action')
    const hoursSinceLastInbound =
      (Date.now() - lastInbound.createdTime.getTime()) / (1000 * 60 * 60)

    if (hoursSinceLastInbound <= 48) {
      if (!hasBusinessMessageBeforeLastInbound && outboundAfterLastInbound >= 10) {
        throw new BadRequestException('TikTok initial 48-hour window limit reached')
      }
      return
    }

    if (outboundAfterLastInbound >= 3) {
      throw new BadRequestException('TikTok inactive conversation limit reached')
    }
  }

  // ─── WhatsApp Cloud API ───

  private async sendWhatsAppMessage(
    phoneNumberId: string,
    recipientPhone: string,
    accessToken: string,
    message?: string,
    mediaUrl?: string,
    mediaType?: string,
    replyToMid?: string | null,
  ): Promise<string | null> {
    const url = `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${phoneNumberId}/messages`

    let body: Record<string, unknown>

    if (mediaUrl && mediaType) {
      let finalMediaUrl = mediaUrl

      // WhatsApp rejects video/mp4 for audio — convert to OGG/Opus
      if (mediaType === 'audio') {
        finalMediaUrl = await this.convertAudioForWhatsApp(mediaUrl)
      }

      const waType =
        mediaType === 'file'
          ? 'document'
          : mediaType === 'audio'
            ? 'audio'
            : mediaType === 'video'
              ? 'video'
              : 'image'

      body = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: waType,
        [waType]: {
          link: finalMediaUrl,
          ...(message && (waType === 'image' || waType === 'video') ? { caption: message } : {}),
        },
      }
    } else {
      body = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'text',
        text: { body: message || '' },
      }
    }

    if (replyToMid) {
      body.context = { message_id: replyToMid }
    }

    this.logger.log(`[WhatsApp] Sending to ${recipientPhone}`)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!response.ok) {
      this.logger.error(
        `[WhatsApp] Send failed (${response.status})\n` +
          `  Payload: ${JSON.stringify(body)}\n` +
          `  Response: ${JSON.stringify(data)}`,
      )
      throw new BadRequestException(
        `Failed to send WhatsApp message: ${JSON.stringify(data?.error?.message || data)}`,
      )
    }

    const messages = (data as { messages?: Array<{ id: string }> }).messages
    return messages?.[0]?.id || null
  }

  // ─── WhatsApp reaction send ───
  // Per Meta docs: POST /{phone-number-id}/messages with type=reaction.
  // An empty emoji string removes the previous reaction.
  private async sendWhatsAppReaction(
    phoneNumberId: string,
    recipientPhone: string,
    accessToken: string,
    targetMessageId: string,
    emoji: string,
  ): Promise<void> {
    const url = `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${phoneNumberId}/messages`

    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientPhone,
      type: 'reaction',
      reaction: {
        message_id: targetMessageId,
        emoji,
      },
    }

    this.logger.log(
      `[WhatsApp] Reaction ${emoji ? `"${emoji}"` : '(remove)'} on ${targetMessageId}`,
    )

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!response.ok) {
      this.logger.error(
        `[WhatsApp] Reaction failed (${response.status})\n` +
          `  Payload: ${JSON.stringify(body)}\n` +
          `  Response: ${JSON.stringify(data)}`,
      )
      throw new BadRequestException(
        `Failed to send WhatsApp reaction: ${JSON.stringify(data?.error?.message || data)}`,
      )
    }
  }

  async sendWhatsAppTemplatePayload(
    phoneNumberId: string,
    recipientPhone: string,
    accessToken: string,
    templateName: string,
    languageCode: string,
    variables?: Record<string, string>,
  ): Promise<string | null> {
    const url = `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${phoneNumberId}/messages`
    const variableEntries = Object.entries(variables ?? {}).sort(([a], [b]) => {
      const an = Number(a)
      const bn = Number(b)
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn
      return a.localeCompare(b)
    })

    const components =
      variableEntries.length > 0
        ? [
            {
              type: 'body',
              parameters: variableEntries.map(([name, text]) =>
                this.common.buildTemplateTextParameter(name, text ?? ''),
              ),
            },
          ]
        : undefined

    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientPhone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components ? { components } : {}),
      },
    }

    this.logger.log(
      `[WhatsApp] Sending template ${templateName}/${languageCode} to ${recipientPhone}`,
    )

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()
    if (!response.ok) {
      this.logger.error(
        `[WhatsApp] Template send failed (${response.status})\n` +
          `  Payload: ${JSON.stringify(body)}\n` +
          `  Response: ${JSON.stringify(data)}`,
      )
      throw new BadRequestException(
        `Failed to send WhatsApp template: ${JSON.stringify(data?.error?.message || data)}`,
      )
    }

    const messages = (data as { messages?: Array<{ id: string }> }).messages
    return messages?.[0]?.id || null
  }

  // ─── WhatsApp audio conversion ───

  /**
   * Download audio from our storage, convert to OGG/Opus (WhatsApp-compatible),
   * re-upload, and return the new URL.
   */
  private async convertAudioForWhatsApp(mediaUrl: string): Promise<string> {
    try {
      const res = await fetch(mediaUrl)
      if (!res.ok) {
        this.logger.warn(`[WhatsApp] Failed to download audio for conversion: ${res.status}`)
        return mediaUrl
      }

      const buffer = Buffer.from(await res.arrayBuffer())
      const contentType = res.headers.get('content-type') || 'audio/mp4'

      const converted = await this.mediaConverter.convertAudioToOgg(buffer, contentType)
      const uploadedUrl = await this.uploadService.uploadBuffer(
        converted.buffer,
        'whatsapp-audio',
        converted.mimetype,
        'chat-media',
      )

      if (uploadedUrl) {
        this.logger.log(`[WhatsApp] Audio converted to OGG/Opus: ${uploadedUrl}`)
        return uploadedUrl
      }
    } catch (error) {
      this.logger.error(`[WhatsApp] Audio conversion failed: ${error}`)
    }

    return mediaUrl
  }
}
