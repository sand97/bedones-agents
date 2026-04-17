import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common'
import { Prisma } from 'generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from '../auth/encryption.service'
import { MediaConverterService } from '../upload/media-converter.service'
import { UploadService } from '../upload/upload.service'
import { CatalogService } from '../catalog/catalog.service'
import { FACEBOOK_GRAPH_API_VERSION } from '../common/config/facebook-scopes.config'

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name)

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private mediaConverter: MediaConverterService,
    private uploadService: UploadService,
    private catalogService: CatalogService,
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
    // Instagram API with Instagram Login does not support reply_to — only Facebook does
    let replyToPlatformMid: string | null = null
    if (replyToId && (provider === 'FACEBOOK' || provider === 'WHATSAPP')) {
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
      }
    } catch (error) {
      this.logger.error(
        `[${provider}] Failed to send message to platform: ${error instanceof Error ? error.message : error}`,
      )
      throw error
    }

    const displayText = message || (mediaType ? `[${mediaType}]` : '')

    // Save the sent message
    const savedMessage = await this.prisma.directMessage.create({
      data: {
        conversationId,
        platformMsgId,
        message: message || '',
        senderId: conversation.socialAccount.providerAccountId,
        senderName: 'Page',
        isFromPage: true,
        isRead: true,
        mediaUrl: mediaUrl || null,
        mediaType: mediaType || null,
        fileName: fileName || null,
        fileSize: fileSize || null,
        replyToId: replyToId || null,
        deliveryStatus: provider === 'WHATSAPP' ? 'sent' : null,
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

  // ─── Mark conversation as read ───

  async markConversationAsRead(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { socialAccount: { select: { organisationId: true } } },
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
        participantId: senderId,
        participantName: senderName,
        participantAvatar: senderAvatar || null,
        lastMessageText: messageText || (mediaType ? `[${mediaType}]` : ''),
        lastMessageAt: timestamp,
        unreadCount: 1,
      },
      update: {
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

    await this.prisma.directMessage.create({
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
      select: { accessToken: true },
    })
    if (!account) throw new NotFoundException('Social account not found')
    return this.encryptionService.decrypt(account.accessToken)
  }

  private assertScope(scopes: string[], required: string) {
    // WhatsApp uses platform-specific scopes instead of generic 'messages'
    const hasScope =
      scopes.includes(required) ||
      (required === 'messages' &&
        (scopes.includes('whatsapp_business_messaging') ||
          scopes.includes('whatsapp_business_management')))
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
