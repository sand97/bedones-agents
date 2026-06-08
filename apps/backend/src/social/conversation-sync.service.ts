import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Prisma } from 'generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { UploadService } from '../upload/upload.service'
import { FACEBOOK_GRAPH_API_VERSION } from '../common/config/facebook-scopes.config'
import { SocialHealthService } from './social-health.service'
import { MessagingCommonService } from './messaging-common.service'
import { ConversationService } from './conversation.service'
import { TikTokTemplatePayload } from './messaging.types'

@Injectable()
export class ConversationSyncService {
  private readonly logger = new Logger(ConversationSyncService.name)

  constructor(
    private prisma: PrismaService,
    private uploadService: UploadService,
    private socialHealth: SocialHealthService,
    private common: MessagingCommonService,
    private conversation: ConversationService,
  ) {}

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
        disabled: true,
        featureDisabled: true,
      },
    })
    if (!account) throw new NotFoundException('Social account not found')
    await this.common.assertMembership(userId, account.organisationId)
    this.common.assertScope(account.scopes, 'messages')

    const accessToken = await this.common.getDecryptedToken(accountId)

    // Outbound history fetch — gated by the circuit breaker.
    await this.socialHealth.wrapOutbound(
      account,
      { operation: 'syncConversations', feature: 'MESSAGE', resource: 'page' },
      async () => {
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
      },
    )

    return this.conversation.getConversations(userId, accountId)
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
      const body = await this.common.readTikTokResponse<{
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

  async fetchTikTokDirectMessageParticipantProfile(
    businessId: string,
    accessToken: string,
    conversationId: string,
    participantId: string,
  ): Promise<{ displayName: string | null; profileImage: string | null } | null> {
    try {
      const body = await this.common.fetchTikTokConversationContent(
        businessId,
        accessToken,
        conversationId,
        'fetch participant profile',
      )
      const participant = this.common.findTikTokConversationParticipant(
        body.data?.participants || [],
        participantId,
      )
      if (!participant) return null

      return {
        displayName: participant.display_name || null,
        profileImage: participant.profile_image || null,
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('Business account') || msg.includes('40002')) {
        this.logger.warn(
          `[TikTok DM] Message API not authorized — cannot fetch participant profile. ` +
            `Enable "Direct Message" permission in TikTok Developer Portal.`,
        )
      } else {
        this.logger.warn(`[TikTok DM] Failed to fetch participant profile: ${msg}`)
      }
      return null
    }
  }

  async mirrorTikTokParticipantAvatar(
    socialAccountId: string,
    participantId: string,
    candidateAvatar: string | null,
  ): Promise<string | null> {
    const existingConversation = await this.prisma.conversation.findUnique({
      where: {
        socialAccountId_participantId: {
          socialAccountId,
          participantId,
        },
      },
      select: { participantAvatar: true },
    })

    const existingAvatar = existingConversation?.participantAvatar || null
    if (existingAvatar && this.uploadService.isOwnUrl(existingAvatar)) {
      return existingAvatar
    }

    const sourceAvatar = candidateAvatar || existingAvatar
    if (!sourceAvatar) return existingAvatar

    const uploaded = await this.uploadService.uploadFromUrl(sourceAvatar, 'avatars')
    return uploaded || existingAvatar || sourceAvatar
  }

  private async syncTikTokConversationMessages(
    socialAccountId: string,
    businessId: string,
    accessToken: string,
    conversationId: string,
    updateTime?: string | number,
  ) {
    const body = await this.common.fetchTikTokConversationContent(
      businessId,
      accessToken,
      conversationId,
      'sync conversation messages',
    )

    const messages = (body.data?.messages || []).sort(
      (a, b) =>
        this.common.parseTikTokTimestamp(a.timestamp).getTime() -
        this.common.parseTikTokTimestamp(b.timestamp).getTime(),
    )
    const personalParticipant = this.common.findTikTokConversationParticipant(
      body.data?.participants || [],
    )
    const fallbackUser = messages.find((m) =>
      this.common.isTikTokPersonalRole(m.from_user?.role),
    )?.from_user
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

    const participantAvatar = await this.mirrorTikTokParticipantAvatar(
      socialAccountId,
      participantId,
      personalParticipant?.profile_image || null,
    )

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
        lastMessageText: latest ? this.common.getTikTokMessageDisplayText(latest) : null,
        lastMessageAt: this.common.parseTikTokTimestamp(updateTime ?? latest?.timestamp),
        unreadCount: 0,
      },
      update: {
        platformThreadId: conversationId,
        participantName,
        ...(participantAvatar ? { participantAvatar } : {}),
        lastMessageText: latest ? this.common.getTikTokMessageDisplayText(latest) : undefined,
        lastMessageAt: this.common.parseTikTokTimestamp(updateTime ?? latest?.timestamp),
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

      const isFromPage =
        this.common.isTikTokBusinessRole(msg.from_user?.role) || msg.sender === businessId
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
          createdTime: this.common.parseTikTokTimestamp(msg.timestamp),
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
        ? await this.common.downloadTikTokMedia(
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
}
