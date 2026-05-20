import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from 'generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from '../auth/encryption.service'
import { MediaConverterService } from '../upload/media-converter.service'
import { UploadService } from '../upload/upload.service'
import { CatalogService } from '../catalog/catalog.service'
import { FACEBOOK_GRAPH_API_VERSION } from '../common/config/facebook-scopes.config'
import { ProductImageSyncService } from './product-image-sync.service'

type TikTokMessageType = 'TEXT' | 'IMAGE' | 'SHARE_POST' | 'TEMPLATE' | 'SENDER_ACTION'
type TikTokSenderAction = 'TYPING' | 'MARK_READ'
type TikTokTemplatePayload = {
  type: 'QA_BUTTON_CARD' | 'QA_LINK_CARD'
  title: string
  buttons: Array<{ type?: 'REPLY'; title: string; id?: string }>
}

interface TikTokSendResult {
  platformMsgId: string | null
  message: string
  displayText: string
  mediaUrl?: string | null
  mediaType?: string | null
  metadata?: Prisma.InputJsonValue
}

interface TikTokApiResponse<T> {
  code?: number
  message?: string
  request_id?: string
  data?: T
}

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name)

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private encryptionService: EncryptionService,
    private mediaConverter: MediaConverterService,
    private uploadService: UploadService,
    private catalogService: CatalogService,
    private productImageSyncService: ProductImageSyncService,
  ) {}

  // ─── Get conversations for a social account ───

  async getConversations(userId: string, accountId: string) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: accountId },
      select: { organisationId: true, scopes: true },
    })
    if (!account) throw new NotFoundException('Social account not found')
    await this.assertMembership(userId, account.organisationId)
    this.assertScope(account.scopes, 'messages')

    return this.prisma.conversation.findMany({
      where: { socialAccountId: accountId },
      orderBy: { lastMessageAt: 'desc' },
    })
  }

  // ─── Get messages for a conversation ───

  async getMessages(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        socialAccount: { select: { organisationId: true } },
      },
    })
    if (!conversation) throw new NotFoundException('Conversation not found')
    await this.assertMembership(userId, conversation.socialAccount.organisationId)

    const messages = await this.prisma.directMessage.findMany({
      where: { conversationId },
      orderBy: { createdTime: 'asc' },
      include: {
        replyTo: {
          select: { id: true, message: true, isFromPage: true, mediaType: true },
        },
      },
    })

    return messages.map((m) => ({
      ...m,
      replyTo: m.replyTo
        ? {
            id: m.replyTo.id,
            text: m.replyTo.message || (m.replyTo.mediaType ? `[${m.replyTo.mediaType}]` : ''),
            from: m.replyTo.isFromPage ? 'business' : 'customer',
          }
        : undefined,
      reactions: (m.reactions as { senderId: string; emoji: string }[]) || [],
      metadata: m.metadata ?? null,
    }))
  }

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
          },
        },
      },
    })
    if (!conversation) throw new NotFoundException('Conversation not found')
    await this.assertMembership(userId, conversation.socialAccount.organisationId)
    this.assertScope(conversation.socialAccount.scopes, 'messages')

    const accessToken = await this.getDecryptedToken(conversation.socialAccount.id)
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
      throw error
    }

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
          },
        },
      },
    })
    if (!conversation) throw new NotFoundException('Conversation not found')
    await this.assertMembership(userId, conversation.socialAccount.organisationId)
    this.assertScope(conversation.socialAccount.scopes, 'messages')

    if (conversation.socialAccount.provider !== 'WHATSAPP') {
      throw new BadRequestException('Template messages are only supported on WhatsApp')
    }

    const accessToken = await this.getDecryptedToken(conversation.socialAccount.id)
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
          },
        },
      },
    })
    if (!conversation) throw new NotFoundException('Conversation not found')

    const accessToken = await this.getDecryptedToken(conversation.socialAccount.id)
    const provider = conversation.socialAccount.provider

    let platformMsgId: string | null = null

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

  // ─── Per-conversation agent override ───

  /**
   * Returns the agent attached to this conversation's social account, whether it
   * would currently process an incoming message on this conversation, and the
   * per-conversation override (if any). Used by the chat header to decide between
   * "Activate" and "Deactivate" buttons.
   */
  async getAgentStatusForConversation(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        socialAccount: {
          select: {
            organisationId: true,
            agentLink: {
              include: {
                agent: {
                  select: { id: true, name: true, score: true, status: true },
                },
              },
            },
          },
        },
      },
    })
    if (!conversation) throw new NotFoundException('Conversation not found')
    await this.assertMembership(userId, conversation.socialAccount.organisationId)

    const agentLink = conversation.socialAccount.agentLink
    const agent = agentLink?.agent ?? null
    const override = conversation.aiOverride ?? null

    if (!agent || !agentLink) {
      return { agent: null, override: null, isActive: false }
    }

    const isActive = await this.computeConversationActive({
      conversationId,
      participantId: conversation.participantId,
      participantName: conversation.participantName,
      override,
      agentStatus: agent.status,
      mode: agentLink.aiActivationMode,
      activationContacts: agentLink.aiActivationContacts,
      activationLabels: agentLink.aiActivationLabels,
    })

    return { agent, override, isActive }
  }

  async setConversationAgentOverride(
    userId: string,
    conversationId: string,
    override: 'FORCE_ON' | 'FORCE_OFF',
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        socialAccount: {
          select: {
            organisationId: true,
            agentLink: {
              include: { agent: { select: { score: true, status: true } } },
            },
          },
        },
      },
    })
    if (!conversation) throw new NotFoundException('Conversation not found')
    await this.assertMembership(userId, conversation.socialAccount.organisationId)

    const agent = conversation.socialAccount.agentLink?.agent
    if (!agent) {
      throw new BadRequestException('No agent is attached to this social account')
    }
    if (agent.score < 80) {
      throw new BadRequestException(
        "L'agent n'a pas encore un score suffisant pour être activé sur une conversation.",
      )
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { aiOverride: override },
    })

    return this.getAgentStatusForConversation(userId, conversationId)
  }

  private async computeConversationActive(args: {
    conversationId: string
    participantId: string
    participantName: string
    override: 'FORCE_ON' | 'FORCE_OFF' | null
    agentStatus: string
    mode: string
    activationContacts: string[]
    activationLabels: string[]
  }): Promise<boolean> {
    if (args.override === 'FORCE_OFF') return false
    if (args.override === 'FORCE_ON') {
      return args.agentStatus !== 'DRAFT' && args.agentStatus !== 'CONFIGURING'
    }

    if (args.agentStatus !== 'ACTIVE') return false
    if (args.mode === 'OFF') return false
    if (args.mode === 'ALL') return true

    if (args.mode === 'CONTACTS') {
      if (args.activationContacts.length === 0) return false
      return args.activationContacts.some(
        (contact) =>
          args.participantId.includes(contact) ||
          contact.includes(args.participantId) ||
          (args.participantName &&
            args.participantName.toLowerCase().includes(contact.toLowerCase())),
      )
    }

    if (args.mode === 'LABELS' || args.mode === 'EXCLUDE_LABELS') {
      if (args.activationLabels.length === 0) return args.mode === 'EXCLUDE_LABELS'
      const conversationLabels = await this.prisma.conversationLabel.findMany({
        where: { conversationId: args.conversationId },
        select: { labelId: true },
      })
      const hasMatch = conversationLabels.some((cl) => args.activationLabels.includes(cl.labelId))
      return args.mode === 'LABELS' ? hasMatch : !hasMatch
    }

    return false
  }

  // ─── Mark conversation as read ───

  async markConversationAsRead(userId: string, conversationId: string) {
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
    if (!conversation) throw new NotFoundException('Conversation not found')
    await this.assertMembership(userId, conversation.socialAccount.organisationId)

    await this.prisma.directMessage.updateMany({
      where: { conversationId, isRead: false },
      data: { isRead: true },
    })

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { unreadCount: 0 },
    })

    if (conversation.socialAccount.provider === 'TIKTOK') {
      try {
        const accessToken = await this.getDecryptedToken(conversation.socialAccount.id)
        await this.sendTikTokMessage({
          conversationId,
          businessId: conversation.socialAccount.providerAccountId,
          conversationPlatformId: conversation.platformThreadId || conversation.participantId,
          accessToken,
          messageType: 'SENDER_ACTION',
          senderAction: 'MARK_READ',
        })
      } catch (error) {
        this.logger.warn(
          `[TikTok DM] Failed to send MARK_READ action: ${error instanceof Error ? error.message : error}`,
        )
      }
    }

    return { status: 'success' }
  }

  // ─── Sync conversations from platform ───

  async syncConversations(userId: string, accountId: string) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        provider: true,
        providerAccountId: true,
        organisationId: true,
        scopes: true,
      },
    })
    if (!account) throw new NotFoundException('Social account not found')
    await this.assertMembership(userId, account.organisationId)
    this.assertScope(account.scopes, 'messages')

    const accessToken = await this.getDecryptedToken(accountId)

    if (account.provider === 'FACEBOOK') {
      await this.syncFacebookConversations(accountId, account.providerAccountId, accessToken)
    } else if (account.provider === 'INSTAGRAM') {
      await this.syncInstagramConversations(accountId, account.providerAccountId, accessToken)
    } else if (account.provider === 'TIKTOK') {
      await this.syncTikTokConversations(accountId, account.providerAccountId, accessToken)
    } else if (account.provider === 'WHATSAPP') {
      // WhatsApp is webhook-driven — no sync API. Just return existing conversations.
      this.logger.log(`[WhatsApp] Sync skipped — WhatsApp uses webhooks for real-time messages`)
    }

    return this.getConversations(userId, accountId)
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

  private async syncFacebookConversations(
    socialAccountId: string,
    pageId: string,
    accessToken: string,
  ) {
    const url = `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${pageId}/conversations?fields=participants,messages.limit(10){message,from,created_time,attachments{mime_type,name,size,image_data}},updated_time,unread_count&limit=50&access_token=${accessToken}`

    const response = await fetch(url)
    if (!response.ok) {
      const error = await response.text()
      this.logger.error(`[Messenger] Sync conversations failed: ${error}`)
      return
    }

    const body = (await response.json()) as {
      data: Array<{
        id: string
        participants: { data: Array<{ id: string; name: string }> }
        messages: {
          data: Array<{
            id: string
            message?: string
            from: { id: string; name: string }
            created_time: string
            attachments?: {
              data: Array<{
                mime_type: string
                image_data?: { url: string }
              }>
            }
          }>
        }
        updated_time: string
        unread_count?: number
      }>
    }

    for (const conv of body.data || []) {
      // Find the participant that is NOT the page
      const participant = conv.participants.data.find((p) => p.id !== pageId)
      if (!participant) continue

      // Note: Facebook Messenger doesn't expose profile_pic via conversations API
      // and /{PSID}?fields=profile_pic requires "Business Asset User Profile Access"

      // Upsert conversation
      const conversation = await this.prisma.conversation.upsert({
        where: {
          socialAccountId_participantId: {
            socialAccountId,
            participantId: participant.id,
          },
        },
        create: {
          socialAccountId,
          platformThreadId: conv.id,
          participantId: participant.id,
          participantName: participant.name,
          lastMessageText: conv.messages?.data?.[0]?.message || null,
          lastMessageAt: new Date(conv.updated_time),
          unreadCount: conv.unread_count || 0,
        },
        update: {
          platformThreadId: conv.id,
          participantName: participant.name,
          lastMessageText: conv.messages?.data?.[0]?.message || undefined,
          lastMessageAt: new Date(conv.updated_time),
          unreadCount: conv.unread_count || 0,
        },
      })

      // Upsert messages
      for (const msg of conv.messages?.data || []) {
        const isFromPage = msg.from.id === pageId
        let mediaUrl: string | null = null
        let mediaType: string | null = null

        if (msg.attachments?.data?.[0]) {
          const attachment = msg.attachments.data[0]
          if (attachment.image_data?.url) {
            mediaUrl = attachment.image_data.url
            mediaType = 'image'
          }
        }

        await this.prisma.directMessage.upsert({
          where: { platformMsgId: msg.id },
          create: {
            conversationId: conversation.id,
            platformMsgId: msg.id,
            message: msg.message || '',
            senderId: msg.from.id,
            senderName: msg.from.name,
            isFromPage,
            mediaUrl,
            mediaType,
            createdTime: new Date(msg.created_time),
            isRead: isFromPage,
          },
          update: {},
        })
      }
    }

    this.logger.log(
      `[Messenger] Synced ${body.data?.length || 0} conversations for account ${socialAccountId}`,
    )
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

  private async syncInstagramConversations(
    socialAccountId: string,
    igAccountId: string,
    accessToken: string,
  ) {
    const url = `https://graph.instagram.com/${FACEBOOK_GRAPH_API_VERSION}/me/conversations?fields=participants,messages.limit(10){message,from,created_time,attachments{mime_type,image_data}},updated_time&platform=instagram&access_token=${accessToken}`

    const response = await fetch(url)
    if (!response.ok) {
      const error = await response.text()
      this.logger.error(`[Instagram DM] Sync conversations failed: ${error}`)
      return
    }

    const body = (await response.json()) as {
      data: Array<{
        id: string
        participants: { data: Array<{ id: string; username?: string; name?: string }> }
        messages: {
          data: Array<{
            id: string
            message?: string
            from: { id: string; username?: string; name?: string }
            created_time: string
            attachments?: {
              data: Array<{
                mime_type: string
                image_data?: { url: string }
              }>
            }
          }>
        }
        updated_time: string
      }>
    }

    for (const conv of body.data || []) {
      const participant = conv.participants.data.find((p) => p.id !== igAccountId)
      if (!participant) continue

      const participantName = participant.username || participant.name || 'Utilisateur Instagram'

      // Fetch avatar if not already stored
      let participantAvatar: string | null = null
      const existingConv = await this.prisma.conversation.findUnique({
        where: {
          socialAccountId_participantId: {
            socialAccountId,
            participantId: participant.id,
          },
        },
        select: { participantAvatar: true },
      })

      if (!existingConv?.participantAvatar) {
        try {
          const profileRes = await fetch(
            `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${participant.id}?fields=profile_pic&access_token=${accessToken}`,
          )
          if (profileRes.ok) {
            const profile = (await profileRes.json()) as { profile_pic?: string }
            if (profile.profile_pic) {
              participantAvatar =
                (await this.uploadService.uploadFromUrl(profile.profile_pic, 'avatars')) || null
            }
          }
        } catch {
          this.logger.warn(`[Instagram Sync] Failed to fetch avatar for ${participant.id}`)
        }
      }

      const conversation = await this.prisma.conversation.upsert({
        where: {
          socialAccountId_participantId: {
            socialAccountId,
            participantId: participant.id,
          },
        },
        create: {
          socialAccountId,
          platformThreadId: conv.id,
          participantId: participant.id,
          participantName,
          participantAvatar,
          lastMessageText: conv.messages?.data?.[0]?.message || null,
          lastMessageAt: new Date(conv.updated_time),
        },
        update: {
          platformThreadId: conv.id,
          participantName,
          ...(participantAvatar ? { participantAvatar } : {}),
          lastMessageText: conv.messages?.data?.[0]?.message || undefined,
          lastMessageAt: new Date(conv.updated_time),
        },
      })

      // Count unread (messages not from page that aren't read)
      let unreadCount = 0

      for (const msg of conv.messages?.data || []) {
        const isFromPage = msg.from.id === igAccountId
        if (!isFromPage) unreadCount++

        let mediaUrl: string | null = null
        let mediaType: string | null = null
        if (msg.attachments?.data?.[0]?.image_data?.url) {
          mediaUrl = msg.attachments.data[0].image_data.url
          mediaType = 'image'
        }

        await this.prisma.directMessage.upsert({
          where: { platformMsgId: msg.id },
          create: {
            conversationId: conversation.id,
            platformMsgId: msg.id,
            message: msg.message || '',
            senderId: msg.from.id,
            senderName: msg.from.username || msg.from.name || 'Utilisateur',
            isFromPage,
            mediaUrl,
            mediaType,
            createdTime: new Date(msg.created_time),
            isRead: isFromPage,
          },
          update: {},
        })
      }

      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { unreadCount },
      })
    }

    this.logger.log(
      `[Instagram DM] Synced ${body.data?.length || 0} conversations for account ${socialAccountId}`,
    )
  }

  // ─── TikTok Business Messaging API ───

  private async sendTikTokMessage(args: {
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
    const data = await this.readTikTokResponse<{ message?: { message_id?: string } }>(
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
    const data = await this.readTikTokResponse<{ media_id?: string }>(response, 'upload image')
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

  private async syncTikTokConversations(
    socialAccountId: string,
    businessId: string,
    accessToken: string,
  ) {
    let synced = 0
    for (const conversationType of ['SINGLE', 'STRANGER'] as const) {
      const url = new URL(
        'https://business-api.tiktok.com/open_api/v1.3/business/message/conversation/list/',
      )
      url.searchParams.set('business_id', businessId)
      url.searchParams.set('conversation_type', conversationType)
      url.searchParams.set('limit', '100')

      const response = await fetch(url.toString(), {
        headers: { 'Access-Token': accessToken },
      })
      const body = await this.readTikTokResponse<{
        conversations?: Array<{ conversation_id: string; update_time?: string | number }>
      }>(response, `sync ${conversationType} conversations`)

      for (const conversation of body.data?.conversations || []) {
        if (!conversation.conversation_id) continue
        await this.syncTikTokConversationMessages(
          socialAccountId,
          businessId,
          accessToken,
          conversation.conversation_id,
          conversation.update_time,
        )
        synced++
      }
    }

    this.logger.log(`[TikTok DM] Synced ${synced} conversations for account ${socialAccountId}`)
  }

  private async syncTikTokConversationMessages(
    socialAccountId: string,
    businessId: string,
    accessToken: string,
    conversationId: string,
    updateTime?: string | number,
  ) {
    const url = new URL(
      'https://business-api.tiktok.com/open_api/v1.3/business/message/content/list/',
    )
    url.searchParams.set('business_id', businessId)
    url.searchParams.set('conversation_id', conversationId)

    const response = await fetch(url.toString(), {
      headers: { 'Access-Token': accessToken },
    })
    const body = await this.readTikTokResponse<{
      messages?: Array<{
        sender?: string
        recipient?: string
        conversation_id?: string
        message_id?: string
        timestamp?: string | number
        message_type?: string
        text?: { body?: string }
        image?: { media_id?: string }
        video?: { media_id?: string }
        share_post?: { item_id?: string; embed_url?: string }
        template?: TikTokTemplatePayload
        from_user?: { id?: string; role?: string; display_name?: string }
        to_user?: { id?: string; role?: string; display_name?: string }
        referenced_message_info?: { referenced_message_id?: string }
        reactions?: Array<{ sender_id?: string; emoji?: string }>
      }>
      participants?: Array<{
        id?: string
        role?: string
        display_name?: string
        profile_image?: string
        is_follower?: boolean
      }>
    }>(response, 'sync conversation messages')

    const messages = (body.data?.messages || []).sort(
      (a, b) =>
        this.parseTikTokTimestamp(a.timestamp).getTime() -
        this.parseTikTokTimestamp(b.timestamp).getTime(),
    )
    const personalParticipant = body.data?.participants?.find((p) => p.role === 'PERSONAL_ACCOUNT')
    const fallbackUser = messages.find((m) => m.from_user?.role === 'PERSONAL_ACCOUNT')?.from_user
    const participantId =
      personalParticipant?.id ||
      fallbackUser?.id ||
      messages.find((m) => m.sender && m.sender !== businessId)?.sender ||
      conversationId
    const participantName =
      personalParticipant?.display_name ||
      fallbackUser?.display_name ||
      personalParticipant?.id ||
      'Utilisateur TikTok'

    const existingConversation = await this.prisma.conversation.findUnique({
      where: {
        socialAccountId_participantId: {
          socialAccountId,
          participantId,
        },
      },
      select: { participantAvatar: true },
    })

    let participantAvatar: string | null = null
    if (!existingConversation?.participantAvatar && personalParticipant?.profile_image) {
      try {
        participantAvatar =
          (await this.uploadService.uploadFromUrl(personalParticipant.profile_image, 'avatars')) ||
          null
      } catch {
        this.logger.warn(`[TikTok DM] Failed to mirror avatar for ${participantId}`)
      }
    }

    const latest = messages[messages.length - 1]
    const conversation = await this.prisma.conversation.upsert({
      where: {
        socialAccountId_participantId: {
          socialAccountId,
          participantId,
        },
      },
      create: {
        socialAccountId,
        platformThreadId: conversationId,
        participantId,
        participantName,
        participantAvatar,
        lastMessageText: latest ? this.getTikTokMessageDisplayText(latest) : null,
        lastMessageAt: this.parseTikTokTimestamp(updateTime ?? latest?.timestamp),
        unreadCount: 0,
      },
      update: {
        platformThreadId: conversationId,
        participantName,
        ...(participantAvatar ? { participantAvatar } : {}),
        lastMessageText: latest ? this.getTikTokMessageDisplayText(latest) : undefined,
        lastMessageAt: this.parseTikTokTimestamp(updateTime ?? latest?.timestamp),
      },
    })

    let newUnread = 0
    for (const msg of messages) {
      if (!msg.message_id) continue
      const existing = await this.prisma.directMessage.findUnique({
        where: { platformMsgId: msg.message_id },
        select: { id: true },
      })
      if (existing) continue

      const isFromPage = msg.from_user?.role === 'BUSINESS_ACCOUNT' || msg.sender === businessId
      const mapped = await this.mapTikTokMessageForStorage(
        businessId,
        accessToken,
        conversationId,
        msg,
      )
      const replyToId = msg.referenced_message_info?.referenced_message_id
        ? (
            await this.prisma.directMessage.findUnique({
              where: { platformMsgId: msg.referenced_message_info.referenced_message_id },
              select: { id: true },
            })
          )?.id || null
        : null

      await this.prisma.directMessage.create({
        data: {
          conversationId: conversation.id,
          platformMsgId: msg.message_id,
          message: mapped.message,
          senderId: msg.from_user?.id || msg.sender || (isFromPage ? businessId : participantId),
          senderName: isFromPage ? 'Page' : msg.from_user?.display_name || participantName,
          isFromPage,
          isRead: isFromPage,
          mediaUrl: mapped.mediaUrl,
          mediaType: mapped.mediaType,
          fileName: mapped.fileName,
          fileSize: mapped.fileSize,
          replyToId,
          reactions: mapped.reactions ?? Prisma.JsonNull,
          metadata: mapped.metadata ?? Prisma.JsonNull,
          createdTime: this.parseTikTokTimestamp(msg.timestamp),
        },
      })

      if (!isFromPage) newUnread++
    }

    if (newUnread > 0) {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { unreadCount: { increment: newUnread } },
      })
    }
  }

  async mapTikTokMessageForStorage(
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
    reactions?: Prisma.InputJsonValue
    metadata?: Prisma.InputJsonValue
  }> {
    const messageType = msg.message_type || 'OTHER'
    const reactions = msg.reactions?.length
      ? msg.reactions.map((reaction) => ({
          senderId: reaction.sender_id || '',
          emoji: reaction.emoji || '',
        }))
      : undefined

    if (messageType === 'TEXT') {
      return {
        message: msg.text?.body || '',
        mediaUrl: null,
        mediaType: null,
        fileName: null,
        fileSize: null,
        reactions: reactions as Prisma.InputJsonValue | undefined,
      }
    }

    if (messageType === 'IMAGE' || messageType === 'VIDEO') {
      const mediaId = messageType === 'IMAGE' ? msg.image?.media_id : msg.video?.media_id
      const media = mediaId
        ? await this.downloadTikTokMedia(
            businessId,
            accessToken,
            conversationId,
            msg.message_id || '',
            mediaId,
            messageType,
          )
        : null
      return {
        message: '',
        mediaUrl: media?.url ?? null,
        mediaType: messageType.toLowerCase(),
        fileName: media?.fileName ?? null,
        fileSize: media?.fileSize ?? null,
        reactions: reactions as Prisma.InputJsonValue | undefined,
      }
    }

    if (messageType === 'SHARE_POST') {
      const itemId = msg.share_post?.item_id || ''
      return {
        message: msg.share_post?.embed_url || itemId,
        mediaUrl: null,
        mediaType: 'tiktok_post',
        fileName: null,
        fileSize: null,
        reactions: reactions as Prisma.InputJsonValue | undefined,
        metadata: {
          kind: 'tiktok_post',
          itemId,
          embedUrl: msg.share_post?.embed_url || null,
        } satisfies Prisma.InputJsonValue,
      }
    }

    if (messageType === 'TEMPLATE' && msg.template) {
      return {
        message: msg.template.title,
        mediaUrl: null,
        mediaType: 'button',
        fileName: null,
        fileSize: null,
        reactions: reactions as Prisma.InputJsonValue | undefined,
        metadata: {
          kind: 'tiktok_template',
          template: msg.template,
        } satisfies Prisma.InputJsonValue,
      }
    }

    return {
      message: `[${messageType.toLowerCase()}]`,
      mediaUrl: null,
      mediaType: messageType.toLowerCase(),
      fileName: null,
      fileSize: null,
      reactions: reactions as Prisma.InputJsonValue | undefined,
      metadata: {
        kind: 'tiktok_unsupported',
        messageType,
      } satisfies Prisma.InputJsonValue,
    }
  }

  private async downloadTikTokMedia(
    businessId: string,
    accessToken: string,
    conversationId: string,
    messageId: string,
    mediaId: string,
    mediaType: 'IMAGE' | 'VIDEO',
  ): Promise<{ url: string | null; fileName: string; fileSize: number } | null> {
    const body = {
      business_id: businessId,
      conversation_id: conversationId,
      message_id: messageId,
      media_id: mediaId,
      media_type: mediaType,
    }
    const response = await fetch(
      'https://business-api.tiktok.com/open_api/v1.3/business/message/media/download/',
      {
        method: 'POST',
        headers: {
          'Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    )
    const data = await this.readTikTokResponse<{ download_url?: string }>(
      response,
      'download media',
      body,
    )
    if (!data.data?.download_url) return null

    const mediaResponse = await fetch(data.data.download_url, {
      headers: { 'x-user': accessToken },
    })
    if (!mediaResponse.ok) {
      this.logger.warn(`[TikTok DM] Media download failed (${mediaResponse.status}) for ${mediaId}`)
      return null
    }

    const contentType =
      mediaResponse.headers.get('content-type') ||
      (mediaType === 'IMAGE' ? 'image/jpeg' : 'video/mp4')
    const buffer = Buffer.from(await mediaResponse.arrayBuffer())
    const fileName = `tiktok-${mediaType.toLowerCase()}`
    const uploadedUrl = await this.uploadService.uploadBuffer(
      buffer,
      fileName,
      contentType,
      'chat-media',
    )

    return { url: uploadedUrl, fileName, fileSize: buffer.length }
  }

  private getTikTokMessageDisplayText(msg?: {
    message_type?: string
    text?: { body?: string }
    share_post?: { item_id?: string; embed_url?: string }
    template?: { title?: string }
  }): string {
    if (!msg) return ''
    if (msg.message_type === 'TEXT') return msg.text?.body || ''
    if (msg.message_type === 'IMAGE') return '[image]'
    if (msg.message_type === 'VIDEO') return '[video]'
    if (msg.message_type === 'SHARE_POST') return msg.share_post?.embed_url || '[tiktok post]'
    if (msg.message_type === 'TEMPLATE') return msg.template?.title || '[template]'
    return `[${(msg.message_type || 'message').toLowerCase()}]`
  }

  private parseTikTokTimestamp(timestamp?: string | number | null): Date {
    const value = Number(timestamp)
    if (!Number.isFinite(value) || value <= 0) return new Date()
    return new Date(value > 1_000_000_000_000 ? value : value * 1000)
  }

  private async readTikTokResponse<T>(
    response: Response,
    operation: string,
    payload?: unknown,
  ): Promise<TikTokApiResponse<T>> {
    const raw = await response.text()
    let data: TikTokApiResponse<T>
    try {
      data = JSON.parse(raw) as TikTokApiResponse<T>
    } catch {
      this.logger.error(`[TikTok DM] ${operation} returned invalid JSON: ${raw}`)
      throw new BadRequestException(`TikTok ${operation} failed`)
    }

    if (!response.ok || data.code !== 0) {
      this.logger.error(
        `[TikTok DM] ${operation} failed (${response.status})\n` +
          `  Payload: ${payload ? JSON.stringify(payload) : '-'}\n` +
          `  Response: ${raw}`,
      )
      throw new BadRequestException(`TikTok ${operation} failed: ${data.message || raw}`)
    }

    return data
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
                this.buildTemplateTextParameter(name, text ?? ''),
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

  private buildTemplateTextParameter(name: string, text: string) {
    const parameter: Record<string, string> = { type: 'text', text }
    if (!/^\d+$/.test(name)) {
      parameter.parameter_name = name
    }
    return parameter
  }

  // ─── Handle incoming webhook message ───

  async handleIncomingMessage(
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
  ) {
    // Upsert conversation
    const conversation = await this.prisma.conversation.upsert({
      where: {
        socialAccountId_participantId: {
          socialAccountId,
          participantId: senderId,
        },
      },
      create: {
        socialAccountId,
        platformThreadId: platformThreadId || null,
        participantId: senderId,
        participantName: senderName,
        participantAvatar: senderAvatar || null,
        lastMessageText: messageText || (mediaType ? `[${mediaType}]` : ''),
        lastMessageAt: timestamp,
        unreadCount: 1,
      },
      update: {
        ...(platformThreadId ? { platformThreadId } : {}),
        participantName: senderName,
        ...(senderAvatar ? { participantAvatar: senderAvatar } : {}),
        lastMessageText: messageText || (mediaType ? `[${mediaType}]` : undefined),
        lastMessageAt: timestamp,
        unreadCount: { increment: 1 },
      },
    })

    // Create message (skip if already exists)
    if (platformMsgId) {
      const existing = await this.prisma.directMessage.findUnique({
        where: { platformMsgId },
      })
      if (existing) return conversation
    }

    // Resolve reply_to mid → id
    let replyToId: string | null = null
    if (replyToMid) {
      const repliedMsg = await this.prisma.directMessage.findUnique({
        where: { platformMsgId: replyToMid },
        select: { id: true },
      })
      replyToId = repliedMsg?.id || null
    }

    const savedMessage = await this.prisma.directMessage.create({
      data: {
        conversationId: conversation.id,
        platformMsgId,
        message: messageText || '',
        senderId,
        senderName,
        isFromPage: false,
        mediaUrl,
        mediaType,
        fileName: fileName || null,
        fileSize: fileSize || null,
        replyToId,
        metadata: (metadata as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        createdTime: timestamp,
      },
    })
    await this.productImageSyncService.enqueueIfProductMessage(savedMessage.id, metadata)

    return conversation
  }

  // ─── Handle echo message (sent by page) ───

  async handleEchoMessage(
    socialAccountId: string,
    recipientId: string,
    messageText: string,
    platformMsgId: string | null,
    timestamp: Date,
    mediaUrl?: string | null,
    mediaType?: string | null,
    fileName?: string | null,
    fileSize?: number | null,
  ) {
    // Check if message already exists (e.g. sent from our app)
    if (platformMsgId) {
      const existing = await this.prisma.directMessage.findUnique({
        where: { platformMsgId },
      })
      if (existing) return
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: {
        socialAccountId_participantId: {
          socialAccountId,
          participantId: recipientId,
        },
      },
    })

    if (!conversation) return

    const displayText = messageText || (mediaType ? `[${mediaType}]` : '')

    await this.prisma.directMessage.create({
      data: {
        conversationId: conversation.id,
        platformMsgId,
        message: messageText || '',
        senderId: 'page',
        senderName: 'Page',
        isFromPage: true,
        isRead: true,
        mediaUrl: mediaUrl || null,
        mediaType: mediaType || null,
        fileName: fileName || null,
        fileSize: fileSize || null,
        createdTime: timestamp,
      },
    })

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageText: displayText,
        lastMessageAt: timestamp,
      },
    })
  }

  // ─── WhatsApp Product Message ───

  async sendProductMessage(
    userId: string,
    conversationId: string,
    productRetailerIds: string[],
    catalogId: string,
    format: 'product' | 'product_list' | 'carousel' | 'catalog_message',
    headerText?: string,
    bodyText?: string,
    footerText?: string,
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
          },
        },
      },
    })
    if (!conversation) throw new NotFoundException('Conversation not found')
    await this.assertMembership(userId, conversation.socialAccount.organisationId)
    this.assertScope(conversation.socialAccount.scopes, 'messages')

    if (conversation.socialAccount.provider !== 'WHATSAPP') {
      throw new BadRequestException('Product messages are only supported on WhatsApp')
    }

    const accessToken = await this.getDecryptedToken(conversation.socialAccount.id)

    const { sends, effectiveFormat } = await this.dispatchWhatsAppProductMessage(
      conversation.socialAccount.providerAccountId,
      conversation.participantId,
      accessToken,
      productRetailerIds,
      catalogId,
      format,
      headerText,
      bodyText,
      footerText,
    )

    const savedMessages = await this.persistProductSends(
      conversationId,
      conversation.socialAccount.providerAccountId,
      'Page',
      sends,
      effectiveFormat,
      catalogId,
      headerText,
      bodyText,
      footerText,
    )

    const lastSaved = savedMessages[savedMessages.length - 1] ?? null
    if (lastSaved) {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageText: lastSaved.message,
          lastMessageAt: new Date(),
        },
      })
    }

    // Contract preserved: return a single message. For single-product format with
    // multiple products, this is the LAST one saved — the frontend invalidates and
    // re-fetches the whole thread anyway.
    return lastSaved ?? savedMessages[0]
  }

  // ─── Send product message as AI agent (no user auth check) ───

  async sendProductMessageAsAgent(
    conversationId: string,
    productRetailerIds: string[],
    catalogId: string,
    format: 'product' | 'product_list' | 'carousel' | 'catalog_message',
    headerText?: string,
    bodyText?: string,
    footerText?: string,
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
          },
        },
      },
    })
    if (!conversation) throw new NotFoundException('Conversation not found')

    if (conversation.socialAccount.provider !== 'WHATSAPP') {
      throw new BadRequestException('Product messages are only supported on WhatsApp')
    }

    const accessToken = await this.getDecryptedToken(conversation.socialAccount.id)

    const { sends, effectiveFormat } = await this.dispatchWhatsAppProductMessage(
      conversation.socialAccount.providerAccountId,
      conversation.participantId,
      accessToken,
      productRetailerIds,
      catalogId,
      format,
      headerText,
      bodyText,
      footerText,
    )

    const savedMessages = await this.persistProductSends(
      conversationId,
      conversation.socialAccount.providerAccountId,
      'AI Agent',
      sends,
      effectiveFormat,
      catalogId,
      headerText,
      bodyText,
      footerText,
    )

    const lastSaved = savedMessages[savedMessages.length - 1] ?? null
    if (lastSaved) {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageText: lastSaved.message,
          lastMessageAt: new Date(),
        },
      })
    }

    const first = lastSaved ?? savedMessages[0]
    return { id: first.id, message: first.message }
  }

  /**
   * Persist dispatch results as DirectMessage rows. Creates one row per `send` entry —
   * so when a customer cites a single product in their reply, WhatsApp's context.id will
   * map back to a specific row (not a grouped bundle).
   */
  private async persistProductSends(
    conversationId: string,
    senderId: string,
    senderName: string,
    sends: Array<{ platformMsgId: string | null; retailerIds: string[]; displayText: string }>,
    effectiveFormat: 'product' | 'product_list' | 'carousel' | 'catalog_message',
    catalogId: string,
    headerText?: string,
    bodyText?: string,
    footerText?: string,
  ) {
    const mediaType = effectiveFormat === 'catalog_message' ? 'catalog_message' : 'catalog'
    const trimmedHeader = headerText?.trim() || null
    const trimmedBody = bodyText?.trim() || null
    const trimmedFooter = footerText?.trim() || null
    const now = new Date()

    const saved = []
    for (const entry of sends) {
      const enrichedItems = await this.buildEnrichedItems(catalogId, entry.retailerIds)
      const row = await this.prisma.directMessage.create({
        data: {
          conversationId,
          platformMsgId: entry.platformMsgId || null,
          message: trimmedBody || entry.displayText,
          senderId,
          senderName,
          isFromPage: true,
          isRead: true,
          mediaType,
          metadata: {
            kind: 'catalog',
            format: effectiveFormat,
            catalogId,
            productRetailerIds: entry.retailerIds,
            items: enrichedItems,
            header: trimmedHeader,
            body: trimmedBody,
            footer: trimmedFooter,
          } satisfies Prisma.InputJsonValue,
          deliveryStatus: 'sent',
          createdTime: now,
        },
      })
      await this.productImageSyncService.enqueueIfProductMessage(
        row.id,
        row.metadata as Record<string, unknown> | null,
      )
      saved.push(row)
    }
    return saved
  }

  /**
   * Dispatch the product message to WhatsApp. Handles format-specific payload
   * building and the single-product loop (when format=product and N>1).
   */
  /**
   * Hydrate product retailer IDs into `items` with name/image/price for storage in
   * message metadata. Meta is the source of truth; any retailer ID that Meta does
   * not return is kept with null fields so the UI can fall back to the ID itself.
   */
  async buildEnrichedItems(
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
    if (retailerIds.length === 0) return []
    const hydrated = await this.catalogService.hydrateProductsByRetailerIds(
      catalogProviderId,
      retailerIds,
    )
    const byRetailerId = new Map(hydrated.map((p) => [p.retailerId, p]))
    return retailerIds.map((retailerId) => {
      const p = byRetailerId.get(retailerId)
      return {
        productRetailerId: retailerId,
        name: p?.name ?? null,
        imageUrl: p?.imageUrl ?? null,
        price: p?.price ?? null,
        currency: p?.currency ?? null,
      }
    })
  }

  async buildEnrichedItemsForSocialAccount(
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
    if (retailerIds.length === 0) return []
    const accessToken = await this.getDecryptedToken(socialAccountId)
    const hydrated = await this.catalogService.hydrateProductsByRetailerIdsWithAccessToken(
      catalogProviderId,
      retailerIds,
      accessToken,
    )
    const byRetailerId = new Map(hydrated.map((p) => [p.retailerId, p]))
    return retailerIds.map((retailerId) => {
      const p = byRetailerId.get(retailerId)
      return {
        productRetailerId: retailerId,
        name: p?.name ?? null,
        imageUrl: p?.imageUrl ?? null,
        price: p?.price ?? null,
        currency: p?.currency ?? null,
      }
    })
  }

  private async dispatchWhatsAppProductMessage(
    phoneNumberId: string,
    recipientPhone: string,
    accessToken: string,
    productRetailerIds: string[],
    catalogId: string,
    format: 'product' | 'product_list' | 'carousel' | 'catalog_message',
    headerText?: string,
    bodyText?: string,
    footerText?: string,
  ): Promise<{
    /**
     * One entry per WhatsApp message actually sent. `product` format yields N entries
     * (one per retailer ID) so each can be persisted as its own DirectMessage — that way
     * a customer quoting a single product in a reply maps to the right row.
     * Other formats always yield a single entry covering all retailer IDs.
     */
    sends: Array<{ platformMsgId: string | null; retailerIds: string[]; displayText: string }>
    effectiveFormat: 'product' | 'product_list' | 'carousel' | 'catalog_message'
  }> {
    // Meta WhatsApp carousel supports up to 10 cards. Above that, fall back to product_list.
    let effectiveFormat = format
    if (effectiveFormat === 'carousel' && productRetailerIds.length > 10) {
      this.logger.warn(
        `Carousel requested with ${productRetailerIds.length} products (>10). Falling back to product_list.`,
      )
      effectiveFormat = 'product_list'
    }

    if (effectiveFormat === 'product') {
      // Single product format: loop through every retailer ID and send each as its own
      // WhatsApp message. We collect one `send` entry per retailer ID so the caller can
      // persist one DirectMessage row per product (matches WhatsApp's own behaviour).
      const sends: Array<{
        platformMsgId: string | null
        retailerIds: string[]
        displayText: string
      }> = []
      for (const retailerId of productRetailerIds) {
        const interactive: Record<string, unknown> = {
          type: 'product',
          action: {
            catalog_id: catalogId,
            product_retailer_id: retailerId,
          },
        }
        const trimmedBody = bodyText?.trim()
        if (trimmedBody) interactive.body = { text: trimmedBody }
        const trimmedFooter = footerText?.trim()
        if (trimmedFooter) interactive.footer = { text: trimmedFooter }

        const msgId = await this.sendWhatsAppInteractivePayload(
          phoneNumberId,
          recipientPhone,
          accessToken,
          interactive,
          `product (${retailerId})`,
        )
        sends.push({ platformMsgId: msgId, retailerIds: [retailerId], displayText: '[product]' })
      }
      return { sends, effectiveFormat }
    }

    if (effectiveFormat === 'product_list') {
      // Per Meta spec: header (required, text), body (required), footer (optional).
      const interactive: Record<string, unknown> = {
        type: 'product_list',
        header: { type: 'text', text: headerText?.trim() || 'Products' },
        body: { text: bodyText?.trim() || headerText?.trim() || 'Here are the products:' },
        action: {
          catalog_id: catalogId,
          sections: [
            {
              title: headerText?.trim() || 'Products',
              product_items: productRetailerIds.map((id) => ({ product_retailer_id: id })),
            },
          ],
        },
      }
      const trimmedFooter = footerText?.trim()
      if (trimmedFooter) interactive.footer = { text: trimmedFooter }

      const msgId = await this.sendWhatsAppInteractivePayload(
        phoneNumberId,
        recipientPhone,
        accessToken,
        interactive,
        `product_list (${productRetailerIds.length} items)`,
      )
      return {
        sends: [
          {
            platformMsgId: msgId,
            retailerIds: productRetailerIds,
            displayText: `[${productRetailerIds.length} products]`,
          },
        ],
        effectiveFormat,
      }
    }

    if (effectiveFormat === 'carousel') {
      const interactive: Record<string, unknown> = {
        type: 'carousel',
        body: { text: bodyText?.trim() || headerText?.trim() || 'Here are the products:' },
        action: {
          cards: productRetailerIds.map((retailerId, index) => ({
            card_index: index,
            type: 'product',
            action: {
              product_retailer_id: retailerId,
              catalog_id: catalogId,
            },
          })),
        },
      }
      const msgId = await this.sendWhatsAppInteractivePayload(
        phoneNumberId,
        recipientPhone,
        accessToken,
        interactive,
        `carousel (${productRetailerIds.length} items)`,
      )
      return {
        sends: [
          {
            platformMsgId: msgId,
            retailerIds: productRetailerIds,
            displayText: `[${productRetailerIds.length} products]`,
          },
        ],
        effectiveFormat,
      }
    }

    // effectiveFormat === 'catalog_message'
    const action: Record<string, unknown> = { name: 'catalog_message' }
    if (productRetailerIds[0]) {
      action.parameters = { thumbnail_product_retailer_id: productRetailerIds[0] }
    }
    const interactive: Record<string, unknown> = {
      type: 'catalog_message',
      body: { text: bodyText?.trim() || 'View our catalog' },
      action,
    }
    const footer = footerText?.trim()
    if (footer) interactive.footer = { text: footer }

    const msgId = await this.sendWhatsAppInteractivePayload(
      phoneNumberId,
      recipientPhone,
      accessToken,
      interactive,
      'catalog_message',
    )
    return {
      sends: [{ platformMsgId: msgId, retailerIds: productRetailerIds, displayText: '[catalog]' }],
      effectiveFormat,
    }
  }

  private async sendWhatsAppInteractivePayload(
    phoneNumberId: string,
    recipientPhone: string,
    accessToken: string,
    interactive: Record<string, unknown>,
    logLabel: string,
  ): Promise<string | null> {
    const url = `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${phoneNumberId}/messages`
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientPhone,
      type: 'interactive',
      interactive,
    }

    this.logger.log(`[WhatsApp] Sending ${logLabel} message to ${recipientPhone}`)

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
        `[WhatsApp] Product send failed (${response.status})\n` +
          `  Payload: ${JSON.stringify(body)}\n` +
          `  Response: ${JSON.stringify(data)}`,
      )
      throw new BadRequestException(
        `Failed to send WhatsApp product message: ${JSON.stringify(data?.error?.message || data)}`,
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

  // ─── Helpers ───

  private async getDecryptedToken(socialAccountId: string): Promise<string> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: {
        provider: true,
        accessToken: true,
        refreshToken: true,
        tokenExpiresAt: true,
      },
    })
    if (!account) throw new NotFoundException('Social account not found')

    if (account.provider === 'TIKTOK') {
      if (account.tokenExpiresAt && account.tokenExpiresAt > new Date()) {
        return this.encryptionService.decrypt(account.accessToken)
      }

      if (!account.refreshToken) {
        return this.encryptionService.decrypt(account.accessToken)
      }

      const clientKey = this.configService.getOrThrow<string>('TIKTOK_CLIENT_KEY')
      const clientSecret = this.configService.getOrThrow<string>('TIKTOK_CLIENT_SECRET')
      const refreshToken = await this.encryptionService.decrypt(account.refreshToken)

      const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: clientKey,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      })

      if (!response.ok) {
        this.logger.error(`[TikTok DM] Token refresh failed: ${await response.text()}`)
        return this.encryptionService.decrypt(account.accessToken)
      }

      const data = (await response.json()) as {
        access_token: string
        refresh_token?: string
        expires_in: number
      }

      const encryptedToken = await this.encryptionService.encrypt(data.access_token)
      const encryptedRefresh = data.refresh_token
        ? await this.encryptionService.encrypt(data.refresh_token)
        : account.refreshToken

      await this.prisma.socialAccount.update({
        where: { id: socialAccountId },
        data: {
          accessToken: encryptedToken,
          refreshToken: encryptedRefresh,
          tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
        },
      })

      return data.access_token
    }

    return this.encryptionService.decrypt(account.accessToken)
  }

  private assertScope(scopes: string[], required: string) {
    // WhatsApp uses platform-specific scopes instead of generic 'messages'
    const hasScope =
      scopes.includes(required) ||
      (required === 'messages' &&
        (scopes.includes('whatsapp_business_messaging') ||
          scopes.includes('whatsapp_business_management') ||
          scopes.includes('message.list.read') ||
          scopes.includes('message.list.send') ||
          scopes.includes('message.list.manage')))
    if (!hasScope) {
      throw new BadRequestException(
        `This account does not have the "${required}" scope. Please reconnect with the required permissions.`,
      )
    }
  }

  private async assertMembership(userId: string, organisationId: string) {
    const membership = await this.prisma.organisationMember.findUnique({
      where: { userId_organisationId: { userId, organisationId } },
    })
    if (!membership) {
      throw new BadRequestException('Not a member of this organisation')
    }
  }
}
