import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from '../auth/encryption.service'
import { FACEBOOK_GRAPH_API_VERSION } from '../common/config/facebook-scopes.config'

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name)

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
  ) {}

  // ─── Get conversations for a social account ───

  async getConversations(userId: string, accountId: string) {
    const account = await this.prisma.socialAccount.findUniqueOrThrow({
      where: { id: accountId },
      select: { organisationId: true, scopes: true },
    })
    await this.assertMembership(userId, account.organisationId)
    this.assertScope(account.scopes, 'messages')

    return this.prisma.conversation.findMany({
      where: { socialAccountId: accountId },
      orderBy: { lastMessageAt: 'desc' },
    })
  }

  // ─── Get messages for a conversation ───

  async getMessages(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: {
        socialAccount: { select: { organisationId: true } },
      },
    })
    await this.assertMembership(userId, conversation.socialAccount.organisationId)

    return this.prisma.directMessage.findMany({
      where: { conversationId },
      orderBy: { createdTime: 'asc' },
    })
  }

  // ─── Send a message ───

  async sendMessage(userId: string, conversationId: string, message: string) {
    const conversation = await this.prisma.conversation.findUniqueOrThrow({
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
    await this.assertMembership(userId, conversation.socialAccount.organisationId)
    this.assertScope(conversation.socialAccount.scopes, 'messages')

    const accessToken = await this.getDecryptedToken(conversation.socialAccount.id)
    const provider = conversation.socialAccount.provider

    let platformMsgId: string | null = null

    if (provider === 'FACEBOOK') {
      platformMsgId = await this.sendFacebookMessage(
        conversation.socialAccount.providerAccountId,
        conversation.participantId,
        message,
        accessToken,
      )
    } else if (provider === 'INSTAGRAM') {
      platformMsgId = await this.sendInstagramMessage(
        conversation.participantId,
        message,
        accessToken,
      )
    }

    // Save the sent message
    const savedMessage = await this.prisma.directMessage.create({
      data: {
        conversationId,
        platformMsgId,
        message,
        senderId: conversation.socialAccount.providerAccountId,
        senderName: 'Page',
        isFromPage: true,
        isRead: true,
        createdTime: new Date(),
      },
    })

    // Update conversation
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageText: message,
        lastMessageAt: new Date(),
      },
    })

    return savedMessage
  }

  // ─── Mark conversation as read ───

  async markConversationAsRead(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: { socialAccount: { select: { organisationId: true } } },
    })
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
    const account = await this.prisma.socialAccount.findUniqueOrThrow({
      where: { id: accountId },
      select: {
        id: true,
        provider: true,
        providerAccountId: true,
        organisationId: true,
        scopes: true,
      },
    })
    await this.assertMembership(userId, account.organisationId)
    this.assertScope(account.scopes, 'messages')

    const accessToken = await this.getDecryptedToken(accountId)

    if (account.provider === 'FACEBOOK') {
      await this.syncFacebookConversations(accountId, account.providerAccountId, accessToken)
    } else if (account.provider === 'INSTAGRAM') {
      await this.syncInstagramConversations(accountId, account.providerAccountId, accessToken)
    }

    return this.getConversations(userId, accountId)
  }

  // ─── Facebook Messenger API ───

  private async sendFacebookMessage(
    pageId: string,
    recipientId: string,
    message: string,
    accessToken: string,
  ): Promise<string | null> {
    const url = `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${pageId}/messages`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: message },
        messaging_type: 'RESPONSE',
        access_token: accessToken,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      this.logger.error(`[Messenger] Send failed: ${error}`)
      throw new BadRequestException('Failed to send message')
    }

    const data = (await response.json()) as { message_id?: string }
    return data.message_id || null
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
    message: string,
    accessToken: string,
  ): Promise<string | null> {
    const url = `https://graph.instagram.com/${FACEBOOK_GRAPH_API_VERSION}/me/messages`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: message },
        access_token: accessToken,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      this.logger.error(`[Instagram DM] Send failed: ${error}`)
      throw new BadRequestException('Failed to send Instagram message')
    }

    const data = (await response.json()) as { message_id?: string }
    return data.message_id || null
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
          lastMessageText: conv.messages?.data?.[0]?.message || null,
          lastMessageAt: new Date(conv.updated_time),
        },
        update: {
          platformThreadId: conv.id,
          participantName,
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
        lastMessageText: messageText || (mediaType ? `[${mediaType}]` : ''),
        lastMessageAt: timestamp,
        unreadCount: 1,
      },
      update: {
        participantName: senderName,
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

    await this.prisma.directMessage.create({
      data: {
        conversationId: conversation.id,
        platformMsgId,
        message: messageText || '',
        senderId: 'page',
        senderName: 'Page',
        isFromPage: true,
        isRead: true,
        createdTime: timestamp,
      },
    })

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageText: messageText,
        lastMessageAt: timestamp,
      },
    })
  }

  // ─── Helpers ───

  private async getDecryptedToken(socialAccountId: string): Promise<string> {
    const account = await this.prisma.socialAccount.findUniqueOrThrow({
      where: { id: socialAccountId },
      select: { accessToken: true },
    })
    return this.encryptionService.decrypt(account.accessToken)
  }

  private assertScope(scopes: string[], required: string) {
    if (!scopes.includes(required)) {
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
