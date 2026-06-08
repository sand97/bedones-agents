import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from 'generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from '../auth/encryption.service'
import { UploadService } from '../upload/upload.service'
import { MessagingService } from './messaging.service'
import { EventsGateway } from '../gateway/events.gateway'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { WebhookCommonService } from './webhook-common.service'
import { CommentModerationService } from './comment-moderation.service'
import type {
  TikTokWebhookPayload,
  TikTokDirectMessageContent,
  IncomingMessageEvent,
} from './webhook.types'

/**
 * TikTok webhook handling: comment moderation events plus direct-message receive
 * / send / read-receipt events from the Business Messaging API.
 */
@Injectable()
export class TikTokWebhookService {
  private readonly logger = new Logger(TikTokWebhookService.name)

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private encryptionService: EncryptionService,
    private uploadService: UploadService,
    private messagingService: MessagingService,
    private eventsGateway: EventsGateway,
    private eventEmitter: EventEmitter2,
    private webhookCommon: WebhookCommonService,
    private commentModeration: CommentModerationService,
  ) {}

  /** TikTok DM ad provenance — best effort via message_tag (TikTok has no CTWA equivalent). */
  private extractTikTokAdReferral(
    content: TikTokDirectMessageContent,
  ): Prisma.InputJsonValue | null {
    const tag = content.message_tag as Record<string, unknown> | undefined
    const adId = (tag?.ad_id ?? tag?.adId ?? tag?.advertiser_id) as string | undefined
    if (!adId) return null
    return {
      platform: 'TIKTOK',
      adId,
      sceneType: content.scene_type ?? null,
      messageTag: (tag as Prisma.InputJsonValue) ?? null,
    }
  }

  // ─── Process TikTok webhook ───

  async processTikTokWebhook(payload: TikTokWebhookPayload) {
    const { event } = payload

    // Ignore webhooks from other apps (e.g. old app still sending events)
    const expectedClientKey = this.configService.getOrThrow<string>('TIKTOK_CLIENT_KEY')
    if (payload.client_key && payload.client_key !== expectedClientKey) {
      this.logger.log(
        `[TikTok Webhook] Ignoring event from unknown client_key ${payload.client_key}`,
      )
      return
    }

    if (event === 'im_receive_msg' || event === 'im_send_msg') {
      await this.handleTikTokDirectMessage(payload)
      return
    }

    if (event === 'im_mark_read_msg') {
      await this.handleTikTokReadReceipt(payload)
      return
    }

    if (event !== 'comment.update') {
      this.logger.log(`[TikTok Webhook] Ignoring event type: ${event}`)
      return
    }

    const rawContent =
      typeof payload.content === 'string' ? payload.content : JSON.stringify(payload.content)

    // Extract IDs from raw string to avoid JSON.parse losing precision on big integers
    const commentIdMatch = rawContent.match(/"comment_id"\s*:\s*(\d+)/)
    const videoIdMatch = rawContent.match(/"video_id"\s*:\s*(\d+)/)
    const parentIdMatch = rawContent.match(/"parent_comment_id"\s*:\s*(\d+)/)
    const actionMatch = rawContent.match(/"comment_action"\s*:\s*"([^"]+)"/)
    const timestampMatch = rawContent.match(/"timestamp"\s*:\s*(\d+)/)

    const commentAction = actionMatch?.[1] || ''

    // Handle comment deletion
    if (commentAction === 'delete') {
      const deletedCommentId = commentIdMatch?.[1] || ''
      if (deletedCommentId) {
        const deleted = await this.prisma.comment.deleteMany({
          where: { id: deletedCommentId },
        })
        if (deleted.count > 0) {
          this.logger.log(`[TikTok Webhook] Deleted comment ${deletedCommentId} from DB`)
        }
      }
      return
    }

    // Only process new comments becoming public
    if (commentAction !== 'set_to_public') {
      this.logger.log(`[TikTok Webhook] Ignoring comment action: ${commentAction}`)
      return
    }

    const openId = payload.user_openid
    if (!openId) {
      this.logger.warn('[TikTok Webhook] No user_openid in payload')
      return
    }

    // Find the TikTok social account by open_id
    const socialAccount = await this.prisma.socialAccount.findFirst({
      where: { provider: 'TIKTOK', providerAccountId: openId },
      select: {
        id: true,
        organisationId: true,
        username: true,
        accessToken: true,
        refreshToken: true,
        tokenExpiresAt: true,
      },
    })

    if (!socialAccount) {
      this.logger.warn(`[TikTok Webhook] No social account found for open_id ${openId}`)
      return
    }

    const orgId = socialAccount.organisationId
    const videoId = videoIdMatch?.[1] || ''
    const commentId = commentIdMatch?.[1] || ''
    const parentCommentId = parentIdMatch?.[1] && parentIdMatch[1] !== '0' ? parentIdMatch[1] : null
    const timestamp = timestampMatch?.[1] ? parseInt(timestampMatch[1]) : Date.now()

    if (!videoId || !commentId) {
      this.logger.warn('[TikTok Webhook] Missing video_id or comment_id')
      return
    }

    // Fetch comment details from TikTok API (text, author info)
    const accessToken = await this.getTikTokAccessToken(socialAccount)

    const commentData = await this.fetchTikTokComment(accessToken, openId, videoId, commentId)

    // Fetch video details if we don't have them yet, or if the stored cover is
    // still a temporary TikTok URL that must be mirrored to our own storage.
    const existingPost = await this.prisma.post.findUnique({ where: { id: videoId } })
    const hasStoredCover = this.uploadService.isOwnUrl(existingPost?.imageUrl)
    const needsVideoFetch =
      !existingPost || !existingPost.message || !existingPost.imageUrl || !hasStoredCover

    let postMessage = existingPost?.message || null
    let postImageUrl = existingPost?.imageUrl || null
    let postPermalinkUrl = existingPost?.permalinkUrl || null

    if (needsVideoFetch) {
      const videoData = await this.fetchTikTokVideo(
        videoId,
        accessToken,
        openId,
        socialAccount.username,
      )
      if (videoData) {
        postMessage = videoData.video_description || postMessage
        postPermalinkUrl = videoData.share_url || postPermalinkUrl

        if (videoData.cover_image_url && !this.uploadService.isOwnUrl(postImageUrl)) {
          const uploaded = await this.uploadService.uploadFromUrl(
            videoData.cover_image_url,
            'posts',
          )
          postImageUrl = uploaded || videoData.cover_image_url
        }
      }
    }

    // Upsert the post (video)
    await this.prisma.post.upsert({
      where: { id: videoId },
      create: {
        id: videoId,
        socialAccountId: socialAccount.id,
        message: postMessage,
        imageUrl: postImageUrl,
        permalinkUrl: postPermalinkUrl,
      },
      update: {
        message: postMessage || undefined,
        imageUrl: postImageUrl || undefined,
        permalinkUrl: postPermalinkUrl || undefined,
      },
    })

    const commentText = commentData?.text || ''

    // Skip empty comments — don't save, don't run AI
    if (!commentText.trim()) {
      this.logger.log(`[TikTok Webhook] Empty comment ${commentId}, skipping`)
      return
    }

    const fromId = commentData?.user?.open_id || 'unknown'
    const isOwnComment = commentData?.owner === true
    const fromName = commentData?.user?.display_name || 'Utilisateur TikTok'
    const fromAvatar = commentData?.user?.avatar_url || null

    // Own comment — already saved locally when we replied
    if (isOwnComment) {
      this.logger.log(`[TikTok Webhook] Own comment ${commentId}, merging with local entry`)

      // Try to create with real ID — if it already exists, just ignore
      try {
        await this.prisma.comment.create({
          data: {
            id: commentId,
            postId: videoId,
            parentId: parentCommentId,
            message: commentText,
            fromId: socialAccount.id,
            fromName: 'Page',
            fromAvatar,
            createdTime: new Date(timestamp),
            isRead: true,
            isPageReply: true,
          },
        })

        // Created successfully — delete any leftover fake-ID entry
        await this.prisma.comment
          .deleteMany({
            where: {
              postId: videoId,
              parentId: parentCommentId,
              isPageReply: true,
              id: { startsWith: 'tiktok_' },
            },
          })
          .then((r) => {
            if (r.count > 0) this.logger.log(`[TikTok Webhook] Cleaned ${r.count} fake entries`)
          })
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          // Already exists with real ID — nothing to do
          this.logger.log(`[TikTok Webhook] Own comment ${commentId} already exists, skipping`)
        } else {
          throw e
        }
      }
      return
    }

    // External comment — upsert and run AI moderation
    await this.prisma.comment.upsert({
      where: { id: commentId },
      create: {
        id: commentId,
        postId: videoId,
        parentId: parentCommentId,
        message: commentText,
        fromId,
        fromName,
        fromAvatar,
        createdTime: new Date(timestamp),
        isRead: false,
        isPageReply: false,
      },
      update: {
        message: commentText,
        fromName,
        fromAvatar,
      },
    })

    this.logger.log(`[TikTok Webhook] Comment ${commentId} on video ${videoId} from ${fromName}`)

    // Emit real-time event
    this.eventsGateway.emitToOrg(orgId, 'comment:new', {
      commentId,
      postId: videoId,
      socialAccountId: socialAccount.id,
      provider: 'TIKTOK',
    })

    await this.commentModeration.analyzeAndAct(socialAccount.id, commentId, 'TIKTOK', orgId, {
      id: commentId,
      message: commentText,
      fromName,
      fromId,
    })
  }

  private async handleTikTokDirectMessage(payload: TikTokWebhookPayload) {
    const content = this.parseTikTokDirectMessageContent(payload.content)
    if (!content) {
      this.logger.warn('[TikTok DM Webhook] Invalid direct message content')
      return
    }

    const businessUserId = this.getTikTokBusinessUserId(content) || payload.user_openid
    if (!businessUserId) {
      this.logger.warn('[TikTok DM Webhook] Missing business user id')
      return
    }

    const socialAccount = await this.prisma.socialAccount.findFirst({
      where: {
        provider: 'TIKTOK',
        providerAccountId: businessUserId,
      },
      select: {
        id: true,
        organisationId: true,
        providerAccountId: true,
        accessToken: true,
        refreshToken: true,
        tokenExpiresAt: true,
      },
    })

    if (!socialAccount) {
      this.logger.warn(
        `[TikTok DM Webhook] No social account found for business_id ${businessUserId}`,
      )
      return
    }

    const personalUser = this.getTikTokPersonalUser(content)
    const participantId =
      personalUser?.id ||
      (this.isTikTokBusinessRole(content.from_user?.role)
        ? content.to_user?.id
        : content.from_user?.id) ||
      content.unique_identifier ||
      content.conversation_id
    if (!participantId) {
      this.logger.warn('[TikTok DM Webhook] Missing participant id')
      return
    }

    const timestamp = this.parseTikTokTimestamp(content.timestamp ?? payload.create_time)
    const messageType = this.normalizeTikTokMessageType(content.message_type || content.type)
    const accessToken = await this.getTikTokAccessToken(socialAccount)
    const isFromPage = this.isTikTokBusinessRole(content.from_user?.role)
    const participantProfile =
      await this.messagingService.fetchTikTokDirectMessageParticipantProfile(
        socialAccount.providerAccountId,
        accessToken,
        content.conversation_id,
        participantId,
      )
    const participantAvatar = await this.messagingService.mirrorTikTokParticipantAvatar(
      socialAccount.id,
      participantId,
      participantProfile?.profileImage ||
        personalUser?.profile_image ||
        personalUser?.avatar_url ||
        null,
    )
    const senderName = isFromPage
      ? 'Page'
      : personalUser?.display_name ||
        participantProfile?.displayName ||
        content.from ||
        'Utilisateur TikTok'
    const participantUsername = isFromPage ? content.to || null : content.from || null
    const mapped = await this.messagingService.mapTikTokMessageForStorage(
      socialAccount.providerAccountId,
      accessToken,
      content.conversation_id,
      {
        message_id: content.message_id,
        message_type: messageType,
        text: content.text,
        image: content.image,
        video: content.video,
        share_post: content.share_post,
        template: content.template,
        reactions: content.reactions,
      },
    )

    if (isFromPage) {
      await this.handleTikTokSentMessage({
        socialAccountId: socialAccount.id,
        orgId: socialAccount.organisationId,
        participantId,
        participantName:
          personalUser?.display_name ||
          participantProfile?.displayName ||
          content.to ||
          participantId,
        participantUsername,
        participantAvatar,
        platformThreadId: content.conversation_id,
        platformMsgId: content.message_id || null,
        message: mapped.message,
        timestamp,
        mediaUrl: mapped.mediaUrl,
        mediaType: mapped.mediaType,
        fileName: mapped.fileName,
        fileSize: mapped.fileSize,
        metadata: (mapped.metadata as Record<string, unknown> | undefined) ?? null,
      })
      return
    }

    const conversation = await this.messagingService.handleIncomingMessage(
      socialAccount.id,
      participantId,
      senderName,
      mapped.message,
      content.message_id || null,
      mapped.mediaUrl,
      mapped.mediaType,
      timestamp,
      socialAccount.organisationId,
      participantAvatar,
      mapped.fileName,
      mapped.fileSize,
      content.referenced_message_info?.referenced_message_id || null,
      (mapped.metadata as Record<string, unknown> | undefined) ?? null,
      content.conversation_id,
      participantUsername,
    )
    if (!conversation) return

    await this.webhookCommon.markConversationFromAd(
      conversation.id,
      this.extractTikTokAdReferral(content),
    )

    this.logger.log(
      `[TikTok DM] New message from ${senderName} (${participantId}): "${
        mapped.message?.substring(0, 50) || mapped.mediaType || '[message]'
      }"`,
    )

    this.eventsGateway.emitToOrg(socialAccount.organisationId, 'message:new', {
      conversationId: conversation.id,
      socialAccountId: socialAccount.id,
      provider: 'TIKTOK',
    })

    this.eventEmitter.emit('message.incoming', {
      conversationId: conversation.id,
      socialAccountId: socialAccount.id,
      provider: 'TIKTOK',
      orgId: socialAccount.organisationId,
      message: {
        text: mapped.message,
        mediaUrl: mapped.mediaUrl,
        mediaType: mapped.mediaType,
        senderId: participantId,
        senderName,
      },
    } satisfies IncomingMessageEvent)
  }

  private async handleTikTokSentMessage(params: {
    socialAccountId: string
    orgId: string
    participantId: string
    participantName: string
    participantUsername: string | null
    participantAvatar: string | null
    platformThreadId: string
    platformMsgId: string | null
    message: string
    timestamp: Date
    mediaUrl: string | null
    mediaType: string | null
    fileName: string | null
    fileSize: number | null
    metadata: Record<string, unknown> | null
  }) {
    if (params.platformMsgId) {
      const existing = await this.prisma.directMessage.findUnique({
        where: { platformMsgId: params.platformMsgId },
        select: { id: true, conversationId: true, deliveryStatus: true },
      })

      if (existing) {
        if (existing.deliveryStatus !== 'read' && existing.deliveryStatus !== 'delivered') {
          await this.prisma.directMessage.update({
            where: { id: existing.id },
            data: { deliveryStatus: 'delivered' },
          })
        }

        this.eventsGateway.emitToOrg(params.orgId, 'message:status', {
          conversationId: existing.conversationId,
          messageId: existing.id,
          platformMsgId: params.platformMsgId,
          deliveryStatus: existing.deliveryStatus === 'read' ? 'read' : 'delivered',
        })
        return
      }
    }

    const displayText = params.message || (params.mediaType ? `[${params.mediaType}]` : '')
    const conversation = await this.prisma.conversation.upsert({
      where: {
        socialAccountId_participantId: {
          socialAccountId: params.socialAccountId,
          participantId: params.participantId,
        },
      },
      create: {
        socialAccountId: params.socialAccountId,
        platformThreadId: params.platformThreadId,
        participantId: params.participantId,
        participantName: params.participantName,
        participantUsername: params.participantUsername,
        participantAvatar: params.participantAvatar,
        lastMessageText: displayText,
        lastMessageAt: params.timestamp,
        unreadCount: 0,
      },
      update: {
        platformThreadId: params.platformThreadId,
        participantName: params.participantName,
        ...(params.participantUsername ? { participantUsername: params.participantUsername } : {}),
        ...(params.participantAvatar ? { participantAvatar: params.participantAvatar } : {}),
        lastMessageText: displayText,
        lastMessageAt: params.timestamp,
      },
    })

    await this.prisma.directMessage.create({
      data: {
        conversationId: conversation.id,
        platformMsgId: params.platformMsgId,
        message: params.message,
        senderId: 'page',
        senderName: 'Page',
        isFromPage: true,
        isRead: true,
        mediaUrl: params.mediaUrl,
        mediaType: params.mediaType,
        fileName: params.fileName,
        fileSize: params.fileSize,
        metadata: (params.metadata as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        deliveryStatus: 'delivered',
        createdTime: params.timestamp,
      },
    })

    this.eventsGateway.emitToOrg(params.orgId, 'message:new', {
      conversationId: conversation.id,
      socialAccountId: params.socialAccountId,
      provider: 'TIKTOK',
    })
  }

  private async handleTikTokReadReceipt(payload: TikTokWebhookPayload) {
    const content = this.parseTikTokDirectMessageContent(payload.content)
    if (!content) {
      this.logger.warn('[TikTok Read Webhook] Invalid read receipt content')
      return
    }

    const businessUserId = this.getTikTokBusinessUserId(content) || payload.user_openid
    if (!businessUserId) {
      this.logger.warn('[TikTok Read Webhook] Missing business user id')
      return
    }

    const socialAccount = await this.prisma.socialAccount.findFirst({
      where: { provider: 'TIKTOK', providerAccountId: businessUserId },
      select: { id: true, organisationId: true },
    })
    if (!socialAccount) {
      this.logger.warn(
        `[TikTok Read Webhook] No social account found for business_id ${businessUserId}`,
      )
      return
    }

    const personalUser = this.getTikTokPersonalUser(content)
    const participantId =
      personalUser?.id ||
      (this.isTikTokBusinessRole(content.from_user?.role)
        ? content.to_user?.id
        : content.from_user?.id) ||
      content.unique_identifier

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        socialAccountId: socialAccount.id,
        OR: [
          { platformThreadId: content.conversation_id },
          ...(participantId ? [{ participantId }] : []),
        ],
      },
      select: { id: true },
    })

    if (!conversation) {
      this.logger.warn(`[TikTok Read Webhook] Conversation not found: ${content.conversation_id}`)
      return
    }

    const lastReadAt = this.parseTikTokTimestamp(this.getTikTokLastReadTimestamp(content))
    const readerIsBusiness = this.isTikTokBusinessRole(content.from_user?.role)

    if (readerIsBusiness) {
      await this.prisma.directMessage.updateMany({
        where: {
          conversationId: conversation.id,
          isFromPage: false,
          createdTime: { lte: lastReadAt },
        },
        data: { isRead: true },
      })
      const unreadCount = await this.prisma.directMessage.count({
        where: { conversationId: conversation.id, isFromPage: false, isRead: false },
      })
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { unreadCount },
      })
      return
    }

    const messages = await this.prisma.directMessage.findMany({
      where: {
        conversationId: conversation.id,
        isFromPage: true,
        createdTime: { lte: lastReadAt },
        NOT: { deliveryStatus: 'read' },
      },
      select: { id: true, platformMsgId: true },
    })

    if (messages.length === 0) return

    await this.prisma.directMessage.updateMany({
      where: { id: { in: messages.map((message) => message.id) } },
      data: { deliveryStatus: 'read' },
    })

    for (const message of messages) {
      this.eventsGateway.emitToOrg(socialAccount.organisationId, 'message:status', {
        conversationId: conversation.id,
        messageId: message.id,
        platformMsgId: message.platformMsgId,
        deliveryStatus: 'read',
      })
    }
  }

  private parseTikTokDirectMessageContent(
    rawContent: TikTokWebhookPayload['content'],
  ): TikTokDirectMessageContent | null {
    if (typeof rawContent !== 'string') {
      return this.isTikTokDirectMessageContent(rawContent) ? rawContent : null
    }

    try {
      const parsed = JSON.parse(rawContent) as unknown
      return this.isTikTokDirectMessageContent(parsed) ? parsed : null
    } catch (error) {
      this.logger.warn(
        `[TikTok DM Webhook] Failed to parse content: ${error instanceof Error ? error.message : error}`,
      )
      return null
    }
  }

  private isTikTokDirectMessageContent(value: unknown): value is TikTokDirectMessageContent {
    if (!value || typeof value !== 'object') return false
    const candidate = value as Partial<TikTokDirectMessageContent>
    return typeof candidate.conversation_id === 'string'
  }

  private getTikTokBusinessUserId(content: TikTokDirectMessageContent): string | null {
    if (this.isTikTokBusinessRole(content.to_user?.role) && content.to_user?.id) {
      return content.to_user.id
    }
    if (this.isTikTokBusinessRole(content.from_user?.role) && content.from_user?.id) {
      return content.from_user.id
    }
    return null
  }

  private getTikTokPersonalUser(content: TikTokDirectMessageContent) {
    if (this.isTikTokPersonalRole(content.from_user?.role)) return content.from_user
    if (this.isTikTokPersonalRole(content.to_user?.role)) return content.to_user
    return null
  }

  private isTikTokBusinessRole(role?: string) {
    return role?.toUpperCase() === 'BUSINESS_ACCOUNT'
  }

  private isTikTokPersonalRole(role?: string) {
    return role?.toUpperCase() === 'PERSONAL_ACCOUNT'
  }

  private normalizeTikTokMessageType(type?: string): string {
    return (type || 'text').replace(/-/g, '_').toUpperCase()
  }

  private parseTikTokTimestamp(timestamp?: string | number | null): Date {
    const value = Number(timestamp)
    if (!Number.isFinite(value) || value <= 0) return new Date()
    return new Date(value > 1_000_000_000_000 ? value : value * 1000)
  }

  private getTikTokLastReadTimestamp(content: TikTokDirectMessageContent): string | number | null {
    if (!content.read) return content.timestamp ?? null
    const entry = Object.entries(content.read).find(([key]) => key.trim() === 'last_read_timestamp')
    return entry?.[1] ?? content.timestamp ?? null
  }

  private async getTikTokAccessToken(account: {
    id: string
    accessToken: string
    refreshToken: string | null
    tokenExpiresAt: Date | null
  }): Promise<string> {
    // Check if token is still valid
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
      this.logger.error(`[TikTok Webhook] Token refresh failed: ${await response.text()}`)
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
      where: { id: account.id },
      data: {
        accessToken: encryptedToken,
        refreshToken: encryptedRefresh,
        tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
      },
    })

    return data.access_token
  }

  private async fetchTikTokComment(
    accessToken: string,
    openId: string,
    videoId: string,
    commentId: string,
  ): Promise<{
    text: string
    owner: boolean
    user?: { open_id: string; display_name: string; avatar_url?: string }
  } | null> {
    try {
      const params = new URLSearchParams({
        business_id: openId,
        video_id: videoId,
      })
      params.append('comment_ids', JSON.stringify([commentId]))
      const url = `https://business-api.tiktok.com/open_api/v1.3/business/comment/list/?${params}`

      this.logger.log(`[TikTok Webhook] Fetching comments: ${url}`)

      const response = await fetch(url, {
        headers: { 'Access-Token': accessToken },
      })

      const body = (await response.json()) as {
        code: number
        message: string
        data?: {
          comments?: Array<{
            comment_id: string
            text: string
            owner?: boolean
            user_id?: string
            username?: string
            display_name?: string
            profile_image?: string
            create_time?: number
          }>
        }
      }

      if (body.code !== 0) {
        this.logger.error(`[TikTok Webhook] Fetch comments failed: ${body.code} — ${body.message}`)
        return null
      }

      const found = body.data?.comments?.[0]
      if (!found) {
        this.logger.warn(`[TikTok Webhook] Comment ${commentId} not found in video ${videoId}`)
        return null
      }

      this.logger.log(`[TikTok Webhook] Fetched comment: ${JSON.stringify(found)}`)

      return {
        text: found.text,
        owner: found.owner === true,
        user: {
          open_id: found.user_id || 'unknown',
          display_name: found.display_name || found.username || 'Utilisateur TikTok',
          avatar_url: found.profile_image,
        },
      }
    } catch (error) {
      this.logger.error(`[TikTok Webhook] Error fetching comment: ${error}`)
      return null
    }
  }

  private async fetchTikTokVideo(
    videoId: string,
    accessToken: string,
    businessId: string,
    username?: string | null,
  ): Promise<{
    video_description?: string
    cover_image_url?: string
    share_url?: string
    strategy: 'business_api' | 'oembed'
  } | null> {
    // Try Business API first
    try {
      const params = new URLSearchParams({
        business_id: businessId,
        filters: JSON.stringify({ video_ids: [videoId] }),
        fields: JSON.stringify(['item_id', 'caption', 'thumbnail_url', 'share_url']),
      })
      const url = `https://business-api.tiktok.com/open_api/v1.3/business/video/list/?${params}`

      this.logger.log(`[TikTok Webhook] Fetching video via Business API`)
      const response = await fetch(url, {
        headers: { 'Access-Token': accessToken },
      })

      const body = (await response.json()) as {
        code: number
        message: string
        data?: {
          videos?: Array<{
            item_id: string
            caption?: string
            thumbnail_url?: string
            share_url?: string
          }>
        }
      }

      if (body.code === 0 && body.data?.videos?.[0]) {
        const video = body.data.videos[0]
        this.logger.log(
          `[TikTok Webhook] ✓ Video fetched via Business API — title="${video.caption}", cover=${video.thumbnail_url ? 'yes' : 'no'}`,
        )
        return {
          video_description: video.caption,
          cover_image_url: video.thumbnail_url,
          share_url: video.share_url,
          strategy: 'business_api',
        }
      }

      this.logger.warn(
        `[TikTok Webhook] Business API failed (code=${body.code}): ${body.message}, falling back to oEmbed`,
      )
    } catch (error) {
      this.logger.warn(`[TikTok Webhook] Business API error: ${error}, falling back to oEmbed`)
    }

    // Fallback to oEmbed
    try {
      const handle = username ? `@${username}` : '@_'
      const videoUrl = `https://www.tiktok.com/${handle}/video/${videoId}`
      const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`

      this.logger.log(`[TikTok Webhook] Trying oEmbed fallback`)
      const response = await fetch(oembedUrl)

      if (!response.ok) {
        this.logger.error(`[TikTok Webhook] oEmbed failed (HTTP ${response.status})`)
        return null
      }

      const data = (await response.json()) as {
        title?: string
        thumbnail_url?: string
      }

      this.logger.log(
        `[TikTok Webhook] ✓ Video fetched via oEmbed — title="${data.title}", thumbnail=${data.thumbnail_url ? 'yes' : 'no'}`,
      )

      return {
        video_description: data.title,
        cover_image_url: data.thumbnail_url,
        share_url: `https://www.tiktok.com/${handle}/video/${videoId}`,
        strategy: 'oembed',
      }
    } catch (error) {
      this.logger.error(`[TikTok Webhook] oEmbed fetch error: ${error}`)
      return null
    }
  }
}
