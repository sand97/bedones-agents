import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Prisma } from 'generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from '../auth/encryption.service'
import { UploadService } from '../upload/upload.service'
import { AIService, type AIAnalysisResult } from './ai.service'
import { MessagingService } from './messaging.service'
import { EventsGateway } from '../gateway/events.gateway'
import { FACEBOOK_GRAPH_API_VERSION } from '../common/config/facebook-scopes.config'

export interface IncomingMessageEvent {
  conversationId: string
  socialAccountId: string
  provider: 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK'
  orgId: string
  message: {
    text: string
    mediaUrl: string | null
    mediaType: string | null
    senderId: string
    senderName: string
  }
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name)
  private readonly facebookAppSecret: string
  private readonly instagramAppSecret: string
  private readonly whatsappAppSecret: string

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private encryptionService: EncryptionService,
    private uploadService: UploadService,
    private aiService: AIService,
    private messagingService: MessagingService,
    private eventsGateway: EventsGateway,
    private eventEmitter: EventEmitter2,
  ) {
    this.facebookAppSecret = this.configService.getOrThrow<string>('FACEBOOK_APP_SECRET')
    this.instagramAppSecret = this.configService.getOrThrow<string>('INSTAGRAM_APP_SECRET')
    this.whatsappAppSecret = this.configService.getOrThrow<string>('FACEBOOK_APP_SECRET')
  }

  // ─── Signature verification ───

  async verifyFacebookSignature(rawBody: Buffer, signature: string): Promise<boolean> {
    return this.verifySignature(rawBody, signature, this.facebookAppSecret)
  }

  async verifyInstagramSignature(rawBody: Buffer, signature: string): Promise<boolean> {
    return this.verifySignature(rawBody, signature, this.instagramAppSecret)
  }

  async verifyWhatsAppSignature(rawBody: Buffer, signature: string): Promise<boolean> {
    return this.verifySignature(rawBody, signature, this.whatsappAppSecret)
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

    // Handle reactions
    if (messaging.reaction) {
      await this.handleReaction(messaging.reaction, senderId, orgId, 'FACEBOOK')
      return
    }

    const message = messaging.message
    if (!message) return

    const timestamp = new Date(messaging.timestamp)

    // Echo = message sent by the page
    if (message.is_echo) {
      let echoMediaUrl: string | null = null
      let echoMediaType: string | null = null
      let echoFileName: string | null = null
      let echoFileSize: number | null = null
      if (message.attachments?.length) {
        const att = message.attachments[0]
        echoMediaType = att.type || null
        echoMediaUrl = att.payload?.url || null
        echoFileName = att.name || null
        echoFileSize = att.size || null
      }

      await this.messagingService.handleEchoMessage(
        socialAccountId,
        recipientId === pageId ? senderId : recipientId,
        message.text || '',
        message.mid || null,
        timestamp,
        echoMediaUrl,
        echoMediaType,
        echoFileName,
        echoFileSize,
      )
      return
    }

    // Incoming message from a user
    const isFromPage = senderId === pageId
    if (isFromPage) return

    // Get sender name and avatar from Graph API
    let senderName = 'Utilisateur'
    let senderAvatar: string | null = null
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
        senderAvatar = profile.profile_pic || null
      }
    } catch {
      // fallback to default name
    }

    let mediaUrl: string | null = null
    let mediaType: string | null = null
    let fileName: string | null = null
    let fileSize: number | null = null

    if (message.attachments?.length) {
      const attachment = message.attachments[0]
      mediaType = attachment.type || null
      mediaUrl = attachment.payload?.url || null
      fileName = attachment.name || null
      fileSize = attachment.size || null
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
      senderAvatar,
      fileName,
      fileSize,
      message.reply_to?.mid || null,
    )

    this.logger.log(
      `[Messenger] New message from ${senderName} (${senderId}): "${message.text?.substring(0, 50) || '[media]'}"`,
    )

    this.eventsGateway.emitToOrg(orgId, 'message:new', {
      conversationId: conversation.id,
      socialAccountId,
      provider: 'FACEBOOK',
    })

    this.eventEmitter.emit('message.incoming', {
      conversationId: conversation.id,
      socialAccountId,
      provider: 'FACEBOOK',
      orgId,
      message: {
        text: message.text || '',
        mediaUrl,
        mediaType,
        senderId,
        senderName,
      },
    } satisfies IncomingMessageEvent)
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

    // Handle reactions
    if (messaging.reaction) {
      await this.handleReaction(messaging.reaction, senderId, orgId, 'INSTAGRAM')
      return
    }

    const message = messaging.message
    if (!message) return

    const timestamp = new Date(messaging.timestamp)

    // Echo = message sent by the page
    if (message.is_echo) {
      let echoMediaUrl: string | null = null
      let echoMediaType: string | null = null
      let echoFileName: string | null = null
      let echoFileSize: number | null = null
      if (message.attachments?.length) {
        const att = message.attachments[0]
        echoMediaType = att.type || null
        echoMediaUrl = att.payload?.url || null
        echoFileName = att.name || null
        echoFileSize = att.size || null
      }

      await this.messagingService.handleEchoMessage(
        socialAccountId,
        recipientId === igAccountId ? senderId : recipientId,
        message.text || '',
        message.mid || null,
        timestamp,
        echoMediaUrl,
        echoMediaType,
        echoFileName,
        echoFileSize,
      )
      return
    }

    // Incoming message from a user
    const isFromPage = senderId === igAccountId
    if (isFromPage) return

    // Fetch sender profile from Instagram API
    let senderName = senderId
    let senderAvatar: string | null = null
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
        `https://graph.instagram.com/${FACEBOOK_GRAPH_API_VERSION}/${senderId}?fields=name,username,profile_pic&access_token=${accessToken}`,
      )
      if (profileRes.ok) {
        const profile = (await profileRes.json()) as {
          name?: string
          username?: string
          profile_pic?: string
        }
        senderName = profile.username || profile.name || senderName
        senderAvatar = profile.profile_pic || null
      }
    } catch {
      this.logger.warn(`[Instagram DM] Failed to fetch profile for ${senderId}`)
    }

    let mediaUrl: string | null = null
    let mediaType: string | null = null
    let fileName: string | null = null
    let fileSize: number | null = null

    if (message.attachments?.length) {
      const attachment = message.attachments[0]
      mediaType = attachment.type || null
      mediaUrl = attachment.payload?.url || null
      fileName = attachment.name || null
      fileSize = attachment.size || null
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
      senderAvatar,
      fileName,
      fileSize,
      message.reply_to?.mid || null,
    )

    this.logger.log(
      `[Instagram DM] New message from ${senderName} (${senderId}): "${message.text?.substring(0, 50) || '[media]'}"`,
    )

    this.eventsGateway.emitToOrg(orgId, 'message:new', {
      conversationId: conversation.id,
      socialAccountId,
      provider: 'INSTAGRAM',
    })

    this.eventEmitter.emit('message.incoming', {
      conversationId: conversation.id,
      socialAccountId,
      provider: 'INSTAGRAM',
      orgId,
      message: {
        text: message.text || '',
        mediaUrl,
        mediaType,
        senderId,
        senderName,
      },
    } satisfies IncomingMessageEvent)
  }

  // ─── Reaction handling ───

  private async handleReaction(
    reaction: NonNullable<MessagingEvent['reaction']>,
    senderId: string,
    orgId: string,
    provider: 'FACEBOOK' | 'INSTAGRAM',
  ) {
    const targetMsgId = reaction.mid
    if (!targetMsgId) return

    const targetMessage = await this.prisma.directMessage.findUnique({
      where: { platformMsgId: targetMsgId },
      select: { id: true, conversationId: true, reactions: true },
    })

    if (!targetMessage) {
      this.logger.warn(
        `[${provider} Reaction] Message ${targetMsgId} not found in DB, skipping reaction`,
      )
      return
    }

    const existing = (targetMessage.reactions as { senderId: string; emoji: string }[]) || []

    let updated: { senderId: string; emoji: string }[]

    if (reaction.action === 'unreact') {
      updated = existing.filter((r) => r.senderId !== senderId)
    } else {
      // Remove any previous reaction from same sender, then add new one
      updated = existing.filter((r) => r.senderId !== senderId)
      if (reaction.emoji) {
        updated.push({ senderId, emoji: reaction.emoji })
      }
    }

    await this.prisma.directMessage.update({
      where: { id: targetMessage.id },
      data: { reactions: updated },
    })

    this.logger.log(
      `[${provider} Reaction] ${reaction.action} "${reaction.emoji || ''}" on message ${targetMsgId} by ${senderId}`,
    )

    this.eventsGateway.emitToOrg(orgId, 'message:reaction', {
      conversationId: targetMessage.conversationId,
      messageId: targetMessage.id,
      reactions: updated,
    })
  }

  // ─── Process WhatsApp webhook ───

  async processWhatsAppWebhook(payload: WhatsAppWebhookPayload) {
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue

        const value = change.value
        if (!value?.metadata?.phone_number_id) continue

        const phoneNumberId = value.metadata.phone_number_id

        // Find the social account for this phone number
        const socialAccount = await this.prisma.socialAccount.findFirst({
          where: { provider: 'WHATSAPP', providerAccountId: phoneNumberId },
          select: { id: true, organisationId: true },
        })

        if (!socialAccount) {
          this.logger.warn(`[WhatsApp Webhook] No account found for phone ${phoneNumberId}`)
          continue
        }

        const orgId = socialAccount.organisationId

        // Handle status updates (sent, delivered, read)
        for (const status of value.statuses || []) {
          await this.handleWhatsAppStatus(status, orgId)
        }

        // Handle incoming messages
        for (const msg of value.messages || []) {
          await this.handleWhatsAppMessage(
            socialAccount.id,
            phoneNumberId,
            msg,
            value.contacts,
            orgId,
          )
        }
      }
    }
  }

  private async handleWhatsAppMessage(
    socialAccountId: string,
    phoneNumberId: string,
    msg: WhatsAppMessage,
    contacts: WhatsAppContact[] | undefined,
    orgId: string,
  ) {
    const senderId = msg.from // phone number of the sender
    const timestamp = new Date(parseInt(msg.timestamp) * 1000)
    const platformMsgId = msg.id

    // Get sender name from contacts array
    const contact = contacts?.find((c) => c.wa_id === senderId)
    const senderName = contact?.profile?.name || senderId

    // Extract message content
    let messageText = ''
    let mediaUrl: string | null = null
    let mediaType: string | null = null
    let fileName: string | null = null
    let replyToMid: string | null = null

    if (msg.context?.id) {
      replyToMid = msg.context.id
    }

    switch (msg.type) {
      case 'text':
        messageText = msg.text?.body || ''
        break
      case 'image':
        mediaType = 'image'
        mediaUrl = await this.downloadWhatsAppMedia(socialAccountId, msg.image?.id)
        messageText = msg.image?.caption || ''
        break
      case 'video':
        mediaType = 'video'
        mediaUrl = await this.downloadWhatsAppMedia(socialAccountId, msg.video?.id)
        messageText = msg.video?.caption || ''
        break
      case 'audio':
        mediaType = 'audio'
        mediaUrl = await this.downloadWhatsAppMedia(socialAccountId, msg.audio?.id)
        break
      case 'document':
        mediaType = 'file'
        mediaUrl = await this.downloadWhatsAppMedia(socialAccountId, msg.document?.id)
        fileName = msg.document?.filename || null
        break
      case 'sticker':
        mediaType = 'image'
        mediaUrl = await this.downloadWhatsAppMedia(socialAccountId, msg.sticker?.id)
        break
      default:
        messageText = `[${msg.type}]`
    }

    const conversation = await this.messagingService.handleIncomingMessage(
      socialAccountId,
      senderId,
      senderName,
      messageText,
      platformMsgId,
      mediaUrl,
      mediaType,
      timestamp,
      orgId,
      null,
      fileName,
      null,
      replyToMid,
    )

    this.logger.log(
      `[WhatsApp] New message from ${senderName} (${senderId}): "${messageText?.substring(0, 50) || '[media]'}"`,
    )

    this.eventsGateway.emitToOrg(orgId, 'message:new', {
      conversationId: conversation.id,
      socialAccountId,
      provider: 'WHATSAPP',
    })

    this.eventEmitter.emit('message.incoming', {
      conversationId: conversation.id,
      socialAccountId,
      provider: 'WHATSAPP',
      orgId,
      message: { text: messageText, mediaUrl, mediaType, senderId, senderName },
    } satisfies IncomingMessageEvent)
  }

  private async handleWhatsAppStatus(
    status: { id: string; status: string; timestamp: string; recipient_id: string },
    orgId: string,
  ) {
    const validStatuses = ['sent', 'delivered', 'read']
    if (!validStatuses.includes(status.status)) return

    this.logger.log(`[WhatsApp] Status: ${status.status} for ${status.id}`)

    // Find the message by platformMsgId
    const message = await this.prisma.directMessage.findUnique({
      where: { platformMsgId: status.id },
      select: { id: true, conversationId: true, deliveryStatus: true },
    })

    if (!message) return

    // Only upgrade status: sent → delivered → read (never downgrade)
    const statusOrder = { sent: 1, delivered: 2, read: 3 }
    const currentOrder =
      statusOrder[(message.deliveryStatus as keyof typeof statusOrder) || 'sent'] || 0
    const newOrder = statusOrder[status.status as keyof typeof statusOrder] || 0
    if (newOrder <= currentOrder) return

    await this.prisma.directMessage.update({
      where: { id: message.id },
      data: { deliveryStatus: status.status },
    })

    this.eventsGateway.emitToOrg(orgId, 'message:status', {
      conversationId: message.conversationId,
      messageId: message.id,
      platformMsgId: status.id,
      deliveryStatus: status.status,
    })
  }

  private async downloadWhatsAppMedia(
    socialAccountId: string,
    mediaId?: string,
  ): Promise<string | null> {
    if (!mediaId) return null

    try {
      const account = await this.prisma.socialAccount.findUniqueOrThrow({
        where: { id: socialAccountId },
        select: { accessToken: true },
      })
      const accessToken = await this.encryptionService.decrypt(account.accessToken)

      // 1. Get media URL from WhatsApp
      const metaRes = await fetch(
        `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${mediaId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      if (!metaRes.ok) return null

      const metaData = (await metaRes.json()) as { url?: string }
      if (!metaData.url) return null

      // 2. Download the media and upload to our storage
      const downloadRes = await fetch(metaData.url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!downloadRes.ok) return null

      const buffer = Buffer.from(await downloadRes.arrayBuffer())
      const uploaded = await this.uploadService.uploadBuffer(
        buffer,
        `whatsapp-${mediaId}`,
        downloadRes.headers.get('content-type') || 'application/octet-stream',
        'chat-media',
      )
      return uploaded || null
    } catch (error) {
      this.logger.error(`[WhatsApp] Failed to download media ${mediaId}: ${error}`)
      return null
    }
  }

  // ─── Process TikTok webhook ───

  async processTikTokWebhook(payload: TikTokWebhookPayload) {
    const { event } = payload

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

    // Fetch video details if we don't have them yet
    const existingPost = await this.prisma.post.findUnique({ where: { id: videoId } })
    const needsVideoFetch = !existingPost || !existingPost.imageUrl

    let postMessage = existingPost?.message || null
    let postImageUrl = existingPost?.imageUrl || null
    let postPermalinkUrl = existingPost?.permalinkUrl || null

    if (needsVideoFetch) {
      const videoData = await this.fetchTikTokVideo(accessToken, openId, videoId)
      if (videoData) {
        postMessage = videoData.title || postMessage
        postImageUrl = videoData.cover_image_url || postImageUrl
        postPermalinkUrl = videoData.share_url || postPermalinkUrl

        // Upload cover image to our storage
        if (videoData.cover_image_url && !existingPost?.imageUrl) {
          const uploaded = await this.uploadService.uploadFromUrl(
            videoData.cover_image_url,
            'posts',
          )
          if (uploaded) postImageUrl = uploaded
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

    await this.analyzeAndAct(socialAccount.id, commentId, 'TIKTOK', orgId, {
      id: commentId,
      message: commentText,
      fromName,
      fromId,
    })
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
    accessToken: string,
    _openId: string,
    videoId: string,
  ): Promise<{
    title?: string
    cover_image_url?: string
    share_url?: string
  } | null> {
    try {
      const url =
        'https://open.tiktokapis.com/v2/video/query/?fields=id,title,cover_image_url,share_url,video_description'

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filters: { video_ids: [videoId] },
        }),
      })

      if (!response.ok) {
        this.logger.error(`[TikTok Webhook] Fetch video failed: ${await response.text()}`)
        return null
      }

      const body = (await response.json()) as {
        data: {
          videos: Array<{
            id: string
            title?: string
            video_description?: string
            cover_image_url?: string
            share_url?: string
          }>
        }
        error: { code: string; message: string }
      }

      if (body.error?.code !== 'ok') {
        this.logger.error(
          `[TikTok Webhook] Fetch video error: ${body.error?.code} — ${body.error?.message}`,
        )
        return null
      }

      const found = body.data?.videos?.[0]
      if (!found) {
        this.logger.warn(`[TikTok Webhook] Video ${videoId} not found`)
        return null
      }

      this.logger.log(`[TikTok Webhook] Fetched video: ${JSON.stringify(found)}`)
      return {
        title: found.title || found.video_description,
        cover_image_url: found.cover_image_url,
        share_url: found.share_url,
      }
    } catch (error) {
      this.logger.error(`[TikTok Webhook] Error fetching video: ${error}`)
      return null
    }
  }

  // ─── AI analysis + auto-action ───

  private async analyzeAndAct(
    socialAccountId: string,
    commentId: string,
    provider: 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK',
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
    provider: 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK',
    result: AIAnalysisResult,
    accessToken: string,
    orgId: string,
    socialAccountId: string,
    comment: { fromName: string; fromId: string },
  ) {
    if (provider === 'TIKTOK') {
      await this.executeTikTokAIAction(commentId, result, accessToken, orgId, socialAccountId)
      return
    }

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

  private async executeTikTokAIAction(
    commentId: string,
    result: AIAnalysisResult,
    accessToken: string,
    orgId: string,
    socialAccountId: string,
  ) {
    const provider = 'TIKTOK' as const

    // TikTok: hide is not supported via API, mark locally only
    if (result.action === 'hide') {
      await this.prisma.comment.update({
        where: { id: commentId },
        data: { status: 'HIDDEN', action: 'HIDE', actionReason: result.reason, isRead: true },
      })
      this.logger.log(`[AI] Marked TikTok comment ${commentId} as hidden (local only)`)
      this.eventsGateway.emitToOrg(orgId, 'comment:updated', {
        commentId,
        socialAccountId,
        provider,
        action: 'hide',
      })
    }

    // TikTok: delete is not supported for comments via API, mark locally only
    if (result.action === 'delete') {
      await this.prisma.comment.update({
        where: { id: commentId },
        data: { status: 'DELETED', action: 'DELETE', actionReason: result.reason, isRead: true },
      })
      this.logger.log(`[AI] Marked TikTok comment ${commentId} as deleted (local only)`)
      this.eventsGateway.emitToOrg(orgId, 'comment:updated', {
        commentId,
        socialAccountId,
        provider,
        action: 'delete',
      })
    }

    if (result.action === 'reply' && result.replyMessage) {
      const replyComment = await this.prisma.comment.findUnique({
        where: { id: commentId },
        select: { postId: true },
      })
      if (!replyComment) return

      // Get the open_id (business_id) for the Business API
      const account = await this.prisma.socialAccount.findUniqueOrThrow({
        where: { id: socialAccountId },
        select: { providerAccountId: true },
      })

      const response = await fetch(
        'https://business-api.tiktok.com/open_api/v1.3/business/comment/reply/create/',
        {
          method: 'POST',
          headers: {
            'Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            business_id: account.providerAccountId,
            video_id: replyComment.postId,
            comment_id: commentId,
            text: result.replyMessage,
          }),
        },
      )

      const replyText = await response.text()
      this.logger.log(`[AI] TikTok reply response: ${replyText}`)

      // Extract comment_id from raw text to avoid BigInt precision loss
      const replyIdMatch = replyText.match(/"comment_id"\s*:\s*"?(\d+)"?/)
      const replyBody = JSON.parse(replyText) as {
        code: number
        message: string
      }

      if (replyBody.code === 0) {
        const replyId = replyIdMatch?.[1] || `tiktok_ai_reply_${Date.now()}_${commentId}`

        await this.prisma.comment.upsert({
          where: { id: replyId },
          create: {
            id: replyId,
            postId: replyComment.postId,
            parentId: commentId,
            message: result.replyMessage,
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

        await this.prisma.comment.update({
          where: { id: commentId },
          data: { action: 'REPLY', actionReason: result.reason, isRead: true },
        })

        this.logger.log(`[AI] Replied to TikTok comment ${commentId}`)
        this.eventsGateway.emitToOrg(orgId, 'comment:updated', {
          commentId,
          socialAccountId,
          provider,
          action: 'reply',
        })
      } else {
        this.logger.error(
          `[AI] Failed to reply to TikTok comment: ${replyBody.code} — ${replyBody.message}`,
        )
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
      name?: string
      size?: number
    }>
    reply_to?: {
      mid?: string
    }
  }
  reaction?: {
    mid: string
    action: 'react' | 'unreact'
    reaction?: string
    emoji?: string
  }
}

// ─── WhatsApp webhook payload types ───

interface WhatsAppWebhookPayload {
  object: string
  entry: Array<{
    id: string
    changes: Array<{
      field: string
      value: WhatsAppWebhookValue
    }>
  }>
}

interface WhatsAppWebhookValue {
  messaging_product: string
  metadata: {
    display_phone_number: string
    phone_number_id: string
  }
  contacts?: WhatsAppContact[]
  messages?: WhatsAppMessage[]
  statuses?: Array<{
    id: string
    status: string
    timestamp: string
    recipient_id: string
  }>
}

interface WhatsAppContact {
  wa_id: string
  profile?: { name?: string }
}

interface WhatsAppMessage {
  id: string
  from: string
  timestamp: string
  type: string
  text?: { body: string }
  image?: { id: string; caption?: string; mime_type?: string }
  video?: { id: string; caption?: string; mime_type?: string }
  audio?: { id: string; mime_type?: string }
  document?: { id: string; filename?: string; mime_type?: string }
  sticker?: { id: string; mime_type?: string }
  context?: { id?: string; from?: string }
}

// ─── TikTok webhook payload types ───

interface TikTokWebhookPayload {
  client_key: string
  event: string
  create_time: number
  user_openid: string
  content: string | TikTokCommentContent
}

interface TikTokCommentContent {
  comment_id: number | string
  video_id: number | string
  parent_comment_id: number | string
  comment_type: string
  comment_action: string // 'insert' | 'set_to_public' | 'delete' | etc.
  timestamp: number
  unique_identifier: string
}
