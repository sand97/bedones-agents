import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common'
import { Prisma } from 'generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ProductImageSyncService } from './product-image-sync.service'
import { MessagingCommonService } from './messaging-common.service'
import { MessageSenderService } from './message-sender.service'
import { EchoMessageOptions, EchoMessageResult } from './messaging.types'

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name)

  constructor(
    private prisma: PrismaService,
    private productImageSyncService: ProductImageSyncService,
    private common: MessagingCommonService,
    private sender: MessageSenderService,
  ) {}

  // ─── Get conversations for a social account ───

  async getConversations(userId: string, accountId: string) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: accountId },
      select: { organisationId: true, scopes: true },
    })
    if (!account) throw new NotFoundException('Social account not found')
    await this.common.assertMembership(userId, account.organisationId)
    this.common.assertScope(account.scopes, 'messages')

    return this.prisma.conversation.findMany({
      where: { socialAccountId: accountId },
      // `nulls: 'last'` keeps contact-only entries (synced from the address book
      // via smb_app_state_sync, no message yet) below active chats instead of
      // sorting them first (PostgreSQL puts NULLs first on a DESC sort).
      orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
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
    await this.common.assertMembership(userId, conversation.socialAccount.organisationId)

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
    await this.common.assertMembership(userId, conversation.socialAccount.organisationId)

    const agentLink = conversation.socialAccount.agentLink
    const agent = agentLink?.agent ?? null
    const override = conversation.aiOverride ?? null

    if (!agent || !agentLink) {
      return { agent: null, override: null, isActive: false }
    }

    const isActive = this.computeConversationActive({
      override,
      agentStatus: agent.status,
      link: agentLink,
      conversation,
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
    await this.common.assertMembership(userId, conversation.socialAccount.organisationId)

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

  /**
   * Whether the agent would currently process a new message on this conversation.
   * Combinable scopes (contacts / ads / new conversations) are OR'd; `aiActivateAll`
   * short-circuits to true. Kept in sync with
   * AgentMessageProcessorService.isActivatedForConversation.
   */
  private computeConversationActive(args: {
    override: 'FORCE_ON' | 'FORCE_OFF' | null
    agentStatus: string
    link: {
      aiActivateAll: boolean
      aiActivateAds: boolean
      aiActivateNewConversations: boolean
      aiActivatedAt: Date | null
      aiActivationContacts: string[]
    }
    conversation: {
      participantId: string
      participantName: string
      fromAd: boolean
      createdAt: Date
    }
  }): boolean {
    if (args.override === 'FORCE_OFF') return false
    if (args.override === 'FORCE_ON') {
      return args.agentStatus !== 'DRAFT' && args.agentStatus !== 'CONFIGURING'
    }

    if (args.agentStatus !== 'ACTIVE') return false

    const { link, conversation } = args
    if (link.aiActivateAll) return true

    const contacts = link.aiActivationContacts || []
    if (
      contacts.length > 0 &&
      contacts.some(
        (contact) =>
          conversation.participantId.includes(contact) ||
          contact.includes(conversation.participantId) ||
          (conversation.participantName &&
            conversation.participantName.toLowerCase().includes(contact.toLowerCase())),
      )
    ) {
      return true
    }

    if (link.aiActivateAds && conversation.fromAd) return true

    if (
      link.aiActivateNewConversations &&
      link.aiActivatedAt &&
      conversation.createdAt >= link.aiActivatedAt
    ) {
      return true
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
    await this.common.assertMembership(userId, conversation.socialAccount.organisationId)

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
        const accessToken = await this.common.getDecryptedToken(conversation.socialAccount.id)
        await this.sender.sendTikTokMessage({
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
    participantUsername?: string | null,
  ) {
    if (platformMsgId) {
      const existing = await this.prisma.directMessage.findUnique({
        where: { platformMsgId },
        select: { id: true },
      })
      if (existing) return null
    }

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
        participantUsername: participantUsername || null,
        participantAvatar: senderAvatar || null,
        lastMessageText: messageText || (mediaType ? `[${mediaType}]` : ''),
        lastMessageAt: timestamp,
        unreadCount: 1,
      },
      update: {
        ...(platformThreadId ? { platformThreadId } : {}),
        participantName: senderName,
        ...(participantUsername ? { participantUsername } : {}),
        ...(senderAvatar ? { participantAvatar: senderAvatar } : {}),
        lastMessageText: messageText || (mediaType ? `[${mediaType}]` : undefined),
        lastMessageAt: timestamp,
        unreadCount: { increment: 1 },
      },
    })

    // Create message (skip if it was inserted concurrently)
    if (platformMsgId) {
      const existing = await this.prisma.directMessage.findUnique({
        where: { platformMsgId },
      })
      if (existing) return null
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
    options?: EchoMessageOptions,
  ): Promise<EchoMessageResult | null> {
    // Check if message already exists (e.g. sent from our app)
    if (platformMsgId) {
      const existing = await this.prisma.directMessage.findUnique({
        where: { platformMsgId },
      })
      if (existing) return null
    }

    const displayText = messageText || (mediaType ? `[${mediaType}]` : '')
    const conversation = options?.createConversation
      ? await this.prisma.conversation.upsert({
          where: {
            socialAccountId_participantId: {
              socialAccountId,
              participantId: recipientId,
            },
          },
          create: {
            socialAccountId,
            participantId: recipientId,
            participantName: options.recipientName || recipientId,
            lastMessageText: displayText,
            lastMessageAt: timestamp,
            unreadCount: 0,
          },
          update: {
            ...(options.recipientName ? { participantName: options.recipientName } : {}),
            lastMessageText: displayText,
            lastMessageAt: timestamp,
            unreadCount: 0,
          },
        })
      : await this.prisma.conversation.findUnique({
          where: {
            socialAccountId_participantId: {
              socialAccountId,
              participantId: recipientId,
            },
          },
        })

    if (!conversation) return null

    const savedMessage = await this.prisma.directMessage.create({
      data: {
        conversationId: conversation.id,
        platformMsgId,
        message: messageText || '',
        senderId: options?.senderId || 'page',
        senderName: options?.senderName || 'Page',
        isFromPage: true,
        isRead: true,
        mediaUrl: mediaUrl || null,
        mediaType: mediaType || null,
        fileName: fileName || null,
        fileSize: fileSize || null,
        deliveryStatus: options?.deliveryStatus || null,
        metadata: (options?.metadata as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        createdTime: timestamp,
      },
    })

    await this.prisma.directMessage.updateMany({
      where: { conversationId: conversation.id, isFromPage: false, isRead: false },
      data: { isRead: true },
    })

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageText: displayText,
        lastMessageAt: timestamp,
        unreadCount: 0,
      },
    })

    return { conversationId: conversation.id, messageId: savedMessage.id }
  }
}
