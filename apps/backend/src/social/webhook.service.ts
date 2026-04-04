import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from '../auth/encryption.service'
import { UploadService } from '../upload/upload.service'
import { AIService, type AIAnalysisResult } from './ai.service'
import { MessagingService } from './messaging.service'
import { EventsGateway } from '../gateway/events.gateway'
import { FACEBOOK_GRAPH_API_VERSION } from '../common/config/facebook-scopes.config'

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name)
  private readonly facebookAppSecret: string
  private readonly instagramAppSecret: string

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private encryptionService: EncryptionService,
    private uploadService: UploadService,
    private aiService: AIService,
    private messagingService: MessagingService,
    private eventsGateway: EventsGateway,
  ) {
    this.facebookAppSecret = this.configService.getOrThrow<string>('FACEBOOK_APP_SECRET')
    this.instagramAppSecret = this.configService.getOrThrow<string>('INSTAGRAM_APP_SECRET')
  }

  // ─── Signature verification ───

  async verifyFacebookSignature(rawBody: Buffer, signature: string): Promise<boolean> {
    return this.verifySignature(rawBody, signature, this.facebookAppSecret)
  }

  async verifyInstagramSignature(rawBody: Buffer, signature: string): Promise<boolean> {
    return this.verifySignature(rawBody, signature, this.instagramAppSecret)
  }

  private async verifySignature(
    rawBody: Buffer,
    signature: string,
    secret: string,
  ): Promise<boolean> {
    if (!signature?.startsWith('sha256=')) return false

    const expectedSignature = signature.slice(7) // Remove "sha256=" prefix
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )

    const signed = await crypto.subtle.sign('HMAC', key, new Uint8Array(rawBody))
    const computedSignature = Array.from(new Uint8Array(signed))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    return computedSignature === expectedSignature
  }

  // ─── Process Facebook webhook ───

  async processFacebookWebhook(payload: FacebookWebhookPayload) {
    for (const entry of payload.entry) {
      const pageId = entry.id

      // Find the social account for this page
      const socialAccount = await this.prisma.socialAccount.findFirst({
        where: { provider: 'FACEBOOK', providerAccountId: pageId },
        select: { id: true, providerAccountId: true, accessToken: true, organisationId: true },
      })

      if (!socialAccount) {
        this.logger.warn(`[Facebook Webhook] No social account found for page ${pageId}`)
        continue
      }

      const accessToken = await this.encryptionService.decrypt(socialAccount.accessToken)
      const orgId = socialAccount.organisationId

      // ─── Feed/comment changes ───
      for (const change of entry.changes || []) {
        if (change.field !== 'feed') continue

        const value = change.value
        if (!value || value.item !== 'comment') continue

        if (value.verb === 'remove') {
          await this.handleFacebookCommentRemoved(value, orgId)
          continue
        }

        if (value.verb === 'add' || value.verb === 'edited') {
          await this.handleFacebookComment(socialAccount.id, pageId, value, accessToken, orgId)
        }
      }

      // ─── Messenger messages ───
      for (const messaging of entry.messaging || []) {
        await this.handleMessengerMessage(socialAccount.id, pageId, messaging, orgId)
      }
    }
  }

  private async handleFacebookCommentRemoved(value: FacebookChangeValue, orgId: string) {
    const commentId = value.comment_id
    if (!commentId) return

    try {
      const existing = await this.prisma.comment.findUnique({
        where: { id: commentId },
        select: { status: true },
      })

      if (!existing) {
        this.logger.warn(`[Facebook Webhook] Comment ${commentId} not found in DB, skipping`)
        return
      }

      // If we already marked it as deleted from the dashboard, keep it in DB
      if (existing.status === 'DELETED') {
        this.logger.log(
          `[Facebook Webhook] Comment ${commentId} already marked DELETED, skipping removal`,
        )
        return
      }

      await this.prisma.comment.delete({ where: { id: commentId } })
      this.logger.log(`[Facebook Webhook] Deleted comment ${commentId}`)
      this.eventsGateway.emitToOrg(orgId, 'comment:removed', { commentId })
    } catch (error) {
      this.logger.error(`[Facebook Webhook] Error handling comment removal ${commentId}:`, error)
    }
  }

  private async handleFacebookComment(
    socialAccountId: string,
    pageId: string,
    value: FacebookChangeValue,
    accessToken: string,
    orgId: string,
  ) {
    const postId = value.post_id
    const commentId = value.comment_id
    if (!postId || !commentId) return

    const baseUrl = `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}`

    // ─── Fetch comment details from Graph API ───
    const commentUrl = `${baseUrl}/${commentId}?fields=message,from{id,name,picture},created_time,parent{id}&access_token=${accessToken}`
    const commentRes = await fetch(commentUrl)
    const commentData = await commentRes.json()
    this.logger.log(
      `[Facebook Webhook] Comment API response: ${JSON.stringify(commentData, null, 2)}`,
    )

    if (!commentRes.ok) {
      this.logger.error(
        `[Facebook Webhook] Failed to fetch comment ${commentId}: ${JSON.stringify(commentData)}`,
      )
      return
    }

    const commentMessage = (commentData as { message?: string }).message || ''
    const commentFrom = (commentData as { from?: { id: string; name: string } }).from
    const commentParentId = (commentData as { parent?: { id: string } }).parent?.id
    const commentCreatedTime = (commentData as { created_time?: string }).created_time
    const fromAvatar =
      (commentData as { from?: { picture?: { data?: { url?: string } } } }).from?.picture?.data
        ?.url || null

    const isOwnComment = commentFrom?.id === pageId

    // ─── Fetch post details (always, to ensure we have real data) ───
    const existingPost = await this.prisma.post.findUnique({ where: { id: postId } })
    const needsPostFetch = !existingPost || !existingPost.imageUrl

    let postMessage = existingPost?.message || null
    let postImageUrl = existingPost?.imageUrl || null
    let postPermalinkUrl = existingPost?.permalinkUrl || value.post?.permalink_url || null

    if (needsPostFetch) {
      const postUrl = `${baseUrl}/${postId}?fields=message,permalink_url,full_picture&access_token=${accessToken}`
      const postRes = await fetch(postUrl)
      const postData = await postRes.json()
      this.logger.log(`[Facebook Webhook] Post API response: ${JSON.stringify(postData, null, 2)}`)

      if (postRes.ok) {
        postMessage = (postData as { message?: string }).message || null
        postPermalinkUrl =
          (postData as { permalink_url?: string }).permalink_url || postPermalinkUrl
        const fullPicture = (postData as { full_picture?: string }).full_picture

        // Upload post image to Minio if we don't have one yet (fallback to original URL)
        if (fullPicture && !postImageUrl) {
          postImageUrl =
            (await this.uploadService.uploadFromUrl(fullPicture, 'posts')) || fullPicture
        }
      }
    }

    // ─── Upsert the post ───
    await this.prisma.post.upsert({
      where: { id: postId },
      create: {
        id: postId,
        socialAccountId,
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

    // ─── Upsert the comment ───
    await this.prisma.comment.upsert({
      where: { id: commentId },
      create: {
        id: commentId,
        postId,
        parentId: commentParentId !== postId ? commentParentId : null,
        message: commentMessage,
        fromId: commentFrom?.id || value.from?.id || 'unknown',
        fromName: commentFrom?.name || value.from?.name || 'Utilisateur Facebook',
        fromAvatar,
        createdTime: commentCreatedTime
          ? new Date(commentCreatedTime)
          : new Date(value.created_time * 1000),
        isRead: isOwnComment,
        isPageReply: isOwnComment,
      },
      update: {
        message: commentMessage,
        fromAvatar,
      },
    })

    this.logger.log(
      `[Facebook Webhook] ${value.verb === 'edited' ? 'Updated' : 'New'} comment "${commentMessage}" from ${commentFrom?.name || 'unknown'}${isOwnComment ? ' (page)' : ''} on post ${postId}`,
    )

    // Emit real-time events
    this.eventsGateway.emitToOrg(
      orgId,
      value.verb === 'edited' ? 'comment:updated' : 'comment:new',
      {
        commentId,
        postId,
        socialAccountId,
        provider: 'FACEBOOK',
      },
    )

    // Don't analyze our own comments with AI
    if (isOwnComment) return

    await this.analyzeAndAct(socialAccountId, commentId, 'FACEBOOK', orgId, {
      id: commentId,
      message: commentMessage,
      fromName: commentFrom?.name || 'Unknown',
      fromId: commentFrom?.id || 'unknown',
    })
  }

  // ─── Process Instagram webhook ───

  async processInstagramWebhook(payload: InstagramWebhookPayload) {
    for (const entry of payload.entry) {
      const accountId = entry.id

      const socialAccount = await this.prisma.socialAccount.findFirst({
        where: { provider: 'INSTAGRAM', providerAccountId: accountId },
        select: { id: true, providerAccountId: true, organisationId: true },
      })

      if (!socialAccount) {
        this.logger.warn(`[Instagram Webhook] No social account found for account ${accountId}`)
        continue
      }

      const orgId = socialAccount.organisationId

      // ─── Comment changes ───
      for (const change of entry.changes || []) {
        if (change.field !== 'comments') continue

        const value = change.value
        if (!value) continue

        const isOwnComment = value.from?.id === accountId

        await this.handleInstagramComment(socialAccount.id, accountId, value, isOwnComment, orgId)
      }

      // ─── Instagram DM messages ───
      for (const messaging of entry.messaging || []) {
        await this.handleInstagramDM(socialAccount.id, accountId, messaging, orgId)
      }
    }
  }

  private async handleInstagramComment(
    socialAccountId: string,
    accountId: string,
    value: InstagramChangeValue,
    isOwnComment: boolean,
    orgId: string,
  ) {
    const mediaId = value.media?.id
    if (!mediaId) return

    const baseUrl = `https://graph.instagram.com/${FACEBOOK_GRAPH_API_VERSION}`

    // Fetch access token for API calls
    const account = await this.prisma.socialAccount.findUniqueOrThrow({
      where: { id: socialAccountId },
      select: { accessToken: true },
    })
    const accessToken = await this.encryptionService.decrypt(account.accessToken)

    // Fetch media details if we don't have them yet
    const existingPost = await this.prisma.post.findUnique({ where: { id: mediaId } })
    const needsMediaFetch = !existingPost || !existingPost.imageUrl

    let postMessage = existingPost?.message || null
    let postImageUrl = existingPost?.imageUrl || null
    let postPermalinkUrl = existingPost?.permalinkUrl || null

    if (needsMediaFetch) {
      const mediaUrl = `${baseUrl}/${mediaId}?fields=caption,media_url,permalink,thumbnail_url,media_type&access_token=${accessToken}`
      const mediaRes = await fetch(mediaUrl)
      const mediaData = (await mediaRes.json()) as {
        caption?: string
        media_url?: string
        permalink?: string
        thumbnail_url?: string
        media_type?: string
      }
      this.logger.log(
        `[Instagram Webhook] Media API response: ${JSON.stringify(mediaData, null, 2)}`,
      )

      if (mediaRes.ok) {
        postMessage = mediaData.caption || null
        postPermalinkUrl = mediaData.permalink || postPermalinkUrl
        const imageSource =
          mediaData.media_type === 'VIDEO' ? mediaData.thumbnail_url : mediaData.media_url

        if (imageSource && !postImageUrl) {
          postImageUrl =
            (await this.uploadService.uploadFromUrl(imageSource, 'posts')) || imageSource
        }
      }
    }

    // Upsert the post (Instagram media)
    await this.prisma.post.upsert({
      where: { id: mediaId },
      create: {
        id: mediaId,
        socialAccountId,
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

    // Upsert the comment
    const commentId = value.id
    if (!commentId) return

    const createdTime = value.timestamp ? new Date(value.timestamp) : new Date()

    await this.prisma.comment.upsert({
      where: { id: commentId },
      create: {
        id: commentId,
        postId: mediaId,
        parentId: value.parent_id || null,
        message: value.text || '',
        fromId: value.from?.id || 'unknown',
        fromName: value.from?.username || 'Utilisateur Instagram',
        createdTime,
        isRead: isOwnComment,
        isPageReply: isOwnComment,
      },
      update: {
        message: value.text || '',
      },
    })

    this.logger.log(
      `[Instagram Webhook] Comment ${commentId} on media ${mediaId} from ${value.from?.username}${isOwnComment ? ' (page)' : ''}\n` +
        `  change.value: ${JSON.stringify(value, null, 2)}`,
    )

    // Emit real-time event
    this.eventsGateway.emitToOrg(orgId, 'comment:new', {
      commentId,
      postId: mediaId,
      socialAccountId,
      provider: 'INSTAGRAM',
    })

    // Don't analyze our own comments with AI
    if (isOwnComment) return

    await this.analyzeAndAct(socialAccountId, commentId, 'INSTAGRAM', orgId, {
      id: commentId,
      message: value.text || '',
      fromName: value.from?.username || 'Unknown',
      fromId: value.from?.id || 'unknown',
    })
  }

  // ─── Messenger message handling ───

  private async handleMessengerMessage(
    socialAccountId: string,
    pageId: string,
    messaging: MessagingEvent,
    orgId: string,
  ) {
    const senderId = messaging.sender?.id
    const recipientId = messaging.recipient?.id
    if (!senderId || !recipientId) return

    const message = messaging.message
    if (!message) return

    const timestamp = new Date(messaging.timestamp)

    // Echo = message sent by the page
    if (message.is_echo) {
      await this.messagingService.handleEchoMessage(
        socialAccountId,
        recipientId === pageId ? senderId : recipientId,
        message.text || '',
        message.mid || null,
        timestamp,
      )
      return
    }

    // Incoming message from a user
    const isFromPage = senderId === pageId
    if (isFromPage) return

    // Get sender name from Graph API
    let senderName = 'Utilisateur'
    try {
      const accessToken = await this.encryptionService.decrypt(
        (
          await this.prisma.socialAccount.findUniqueOrThrow({
            where: { id: socialAccountId },
            select: { accessToken: true },
          })
        ).accessToken,
      )
      const profileRes = await fetch(
        `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${senderId}?fields=name,profile_pic&access_token=${accessToken}`,
      )
      if (profileRes.ok) {
        const profile = (await profileRes.json()) as { name?: string; profile_pic?: string }
        senderName = profile.name || senderName
      }
    } catch {
      // fallback to default name
    }

    let mediaUrl: string | null = null
    let mediaType: string | null = null

    if (message.attachments?.length) {
      const attachment = message.attachments[0]
      mediaType = attachment.type || null
      mediaUrl = attachment.payload?.url || null
    }

    const conversation = await this.messagingService.handleIncomingMessage(
      socialAccountId,
      senderId,
      senderName,
      message.text || '',
      message.mid || null,
      mediaUrl,
      mediaType,
      timestamp,
      orgId,
    )

    this.logger.log(
      `[Messenger] New message from ${senderName} (${senderId}): "${message.text?.substring(0, 50) || '[media]'}"`,
    )

    this.eventsGateway.emitToOrg(orgId, 'message:new', {
      conversationId: conversation.id,
      socialAccountId,
      provider: 'FACEBOOK',
    })
  }

  // ─── Instagram DM handling ───

  private async handleInstagramDM(
    socialAccountId: string,
    igAccountId: string,
    messaging: MessagingEvent,
    orgId: string,
  ) {
    const senderId = messaging.sender?.id
    const recipientId = messaging.recipient?.id
    if (!senderId || !recipientId) return

    const message = messaging.message
    if (!message) return

    const timestamp = new Date(messaging.timestamp)

    // Echo = message sent by the page
    if (message.is_echo) {
      await this.messagingService.handleEchoMessage(
        socialAccountId,
        recipientId === igAccountId ? senderId : recipientId,
        message.text || '',
        message.mid || null,
        timestamp,
      )
      return
    }

    // Incoming message from a user
    const isFromPage = senderId === igAccountId
    if (isFromPage) return

    // For Instagram DMs, sender name is not in the webhook — use sender ID
    // The sync will fetch proper names from the conversations API
    const senderName = `instagram_user_${senderId}`

    let mediaUrl: string | null = null
    let mediaType: string | null = null

    if (message.attachments?.length) {
      const attachment = message.attachments[0]
      mediaType = attachment.type || null
      mediaUrl = attachment.payload?.url || null
    }

    const conversation = await this.messagingService.handleIncomingMessage(
      socialAccountId,
      senderId,
      senderName,
      message.text || '',
      message.mid || null,
      mediaUrl,
      mediaType,
      timestamp,
      orgId,
    )

    this.logger.log(
      `[Instagram DM] New message from ${senderId}: "${message.text?.substring(0, 50) || '[media]'}"`,
    )

    this.eventsGateway.emitToOrg(orgId, 'message:new', {
      conversationId: conversation.id,
      socialAccountId,
      provider: 'INSTAGRAM',
    })
  }

  // ─── AI analysis + auto-action ───

  private async analyzeAndAct(
    socialAccountId: string,
    commentId: string,
    provider: 'FACEBOOK' | 'INSTAGRAM',
    orgId: string,
    comment: { id: string; message: string; fromName: string; fromId: string },
  ) {
    try {
      // Load page settings + FAQ rules
      const settings = await this.prisma.pageSettings.findUnique({
        where: { socialAccountId },
        include: { faqRules: true },
      })

      if (!settings) {
        this.logger.warn(`[AI] No settings found for account ${socialAccountId}, skipping AI`)
        return
      }

      const result = await this.aiService.analyzeComment({
        comment,
        pageSettings: {
          undesiredCommentsAction: settings.undesiredCommentsAction,
          spamAction: settings.spamAction,
          customInstructions: settings.customInstructions,
          faqRules: settings.faqRules.map((r) => ({
            question: r.question,
            answer: r.answer,
          })),
        },
      })

      this.logger.log(`[AI] Comment ${commentId}: action=${result.action}, reason=${result.reason}`)

      if (result.action === 'none') return

      // Get access token for API calls
      const account = await this.prisma.socialAccount.findUniqueOrThrow({
        where: { id: socialAccountId },
        select: { accessToken: true },
      })
      const accessToken = await this.encryptionService.decrypt(account.accessToken)

      await this.executeAIAction(
        commentId,
        provider,
        result,
        accessToken,
        orgId,
        socialAccountId,
        comment,
      )
    } catch (error) {
      this.logger.error(`[AI] Failed to analyze/act on comment ${commentId}:`, error)
    }
  }

  private async executeAIAction(
    commentId: string,
    provider: 'FACEBOOK' | 'INSTAGRAM',
    result: AIAnalysisResult,
    accessToken: string,
    orgId: string,
    socialAccountId: string,
    comment: { fromName: string; fromId: string },
  ) {
    const baseUrl =
      provider === 'INSTAGRAM'
        ? `https://graph.instagram.com/${FACEBOOK_GRAPH_API_VERSION}`
        : `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}`

    if (result.action === 'hide') {
      const hideUrl =
        provider === 'INSTAGRAM'
          ? `${baseUrl}/${commentId}?hide=true&access_token=${accessToken}`
          : `${baseUrl}/${commentId}?access_token=${accessToken}`

      const body = provider === 'FACEBOOK' ? JSON.stringify({ is_hidden: true }) : undefined
      const response = await fetch(hideUrl, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body,
      })

      if (response.ok) {
        await this.prisma.comment.update({
          where: { id: commentId },
          data: { status: 'HIDDEN', action: 'HIDE', actionReason: result.reason, isRead: true },
        })
        this.logger.log(`[AI] Hidden comment ${commentId}`)
        this.eventsGateway.emitToOrg(orgId, 'comment:updated', {
          commentId,
          socialAccountId,
          provider,
          action: 'hide',
        })
      } else {
        this.logger.error(`[AI] Failed to hide comment: ${await response.text()}`)
      }
    }

    if (result.action === 'delete') {
      const response = await fetch(`${baseUrl}/${commentId}?access_token=${accessToken}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        await this.prisma.comment.update({
          where: { id: commentId },
          data: { status: 'DELETED', action: 'DELETE', actionReason: result.reason, isRead: true },
        })
        this.logger.log(`[AI] Deleted comment ${commentId}`)
        this.eventsGateway.emitToOrg(orgId, 'comment:updated', {
          commentId,
          socialAccountId,
          provider,
          action: 'delete',
        })
      } else {
        this.logger.error(`[AI] Failed to delete comment: ${await response.text()}`)
      }
    }

    if (result.action === 'reply' && result.replyMessage) {
      // Tag the user so they get a notification
      const taggedMessage =
        provider === 'FACEBOOK'
          ? `@[${comment.fromId}] ${result.replyMessage}`
          : `@${comment.fromName} ${result.replyMessage}`

      const replyUrl =
        provider === 'INSTAGRAM'
          ? `${baseUrl}/${commentId}/replies?access_token=${accessToken}`
          : `${baseUrl}/${commentId}/comments?access_token=${accessToken}`

      const response = await fetch(replyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: taggedMessage }),
      })

      if (response.ok) {
        // Use the real Facebook/Instagram comment ID to avoid duplicates with incoming webhooks
        const responseData = (await response.json()) as { id?: string }
        const replyId = responseData.id || `ai_reply_${Date.now()}_${commentId}`

        const replyComment = await this.prisma.comment.findUnique({
          where: { id: commentId },
          select: { postId: true },
        })

        if (replyComment) {
          await this.prisma.comment.upsert({
            where: { id: replyId },
            create: {
              id: replyId,
              postId: replyComment.postId,
              parentId: commentId,
              message: taggedMessage,
              fromId: 'ai',
              fromName: 'Page (IA)',
              createdTime: new Date(),
              isRead: true,
              isPageReply: true,
              action: 'REPLY',
              actionReason: result.reason,
              replyMessage: result.replyMessage,
            },
            update: {},
          })
        }

        await this.prisma.comment.update({
          where: { id: commentId },
          data: { action: 'REPLY', actionReason: result.reason, isRead: true },
        })

        this.logger.log(`[AI] Replied to comment ${commentId}`)
        this.eventsGateway.emitToOrg(orgId, 'comment:updated', {
          commentId,
          socialAccountId,
          provider,
          action: 'reply',
        })
      } else {
        this.logger.error(`[AI] Failed to reply to comment: ${await response.text()}`)
      }
    }
  }
}

// ─── Webhook payload types ───

interface FacebookWebhookPayload {
  object: string
  entry: Array<{
    id: string
    time: number
    changes?: Array<{
      field: string
      value: FacebookChangeValue
    }>
    messaging?: MessagingEvent[]
  }>
}

interface FacebookChangeValue {
  from?: { id: string; name: string }
  post_id?: string
  comment_id?: string
  parent_id?: string
  message?: string
  created_time: number
  item?: string
  verb?: string
  post?: {
    id?: string
    permalink_url?: string
    status_type?: string
    is_published?: boolean
  }
}

interface InstagramWebhookPayload {
  object: string
  entry: Array<{
    id: string
    time: number
    changes?: Array<{
      field: string
      value: InstagramChangeValue
    }>
    messaging?: MessagingEvent[]
  }>
}

interface InstagramChangeValue {
  id?: string
  text?: string
  parent_id?: string
  from?: { id: string; username: string }
  media?: {
    id: string
    media_product_type?: string
    permalink?: string
  }
  timestamp?: string
}

// ─── Messaging event types (Messenger + Instagram DM) ───

interface MessagingEvent {
  sender?: { id: string }
  recipient?: { id: string }
  timestamp: number
  message?: {
    mid?: string
    text?: string
    is_echo?: boolean
    attachments?: Array<{
      type?: string
      payload?: {
        url?: string
      }
    }>
  }
}
