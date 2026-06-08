import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Prisma } from 'generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from '../auth/encryption.service'
import { UploadService } from '../upload/upload.service'
import { MessagingService } from './messaging.service'
import { EventsGateway } from '../gateway/events.gateway'
import { FACEBOOK_GRAPH_API_VERSION } from '../common/config/facebook-scopes.config'
import { WebhookCommonService } from './webhook-common.service'
import { CommentModerationService } from './comment-moderation.service'
import type {
  FacebookWebhookPayload,
  FacebookChangeValue,
  InstagramWebhookPayload,
  InstagramChangeValue,
  MessagingEvent,
  IncomingMessageEvent,
} from './webhook.types'

/**
 * Meta (Facebook + Instagram) webhook handling: feed/comment changes, Messenger
 * and Instagram DM messages, and reactions.
 */
@Injectable()
export class MetaWebhookService {
  private readonly logger = new Logger(MetaWebhookService.name)

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private uploadService: UploadService,
    private messagingService: MessagingService,
    private eventsGateway: EventsGateway,
    private eventEmitter: EventEmitter2,
    private webhookCommon: WebhookCommonService,
    private commentModeration: CommentModerationService,
  ) {}

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
    const rawFromAvatar =
      (commentData as { from?: { picture?: { data?: { url?: string } } } }).from?.picture?.data
        ?.url || null

    // Upload avatar to Minio for permanent storage
    let fromAvatar: string | null = null
    if (rawFromAvatar) {
      fromAvatar =
        (await this.uploadService.uploadFromUrl(rawFromAvatar, 'avatars')) || rawFromAvatar
    }

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

    await this.commentModeration.analyzeAndAct(socialAccountId, commentId, 'FACEBOOK', orgId, {
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
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: { accessToken: true },
    })
    if (!account) throw new NotFoundException('Social account not found')
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

    // Fetch commenter avatar from Instagram API
    let fromAvatar: string | null = null
    const commenterId = value.from?.id
    if (commenterId && !isOwnComment) {
      try {
        const profileRes = await fetch(
          `https://graph.instagram.com/${FACEBOOK_GRAPH_API_VERSION}/${commenterId}?fields=profile_pic&access_token=${accessToken}`,
        )
        if (profileRes.ok) {
          const profile = (await profileRes.json()) as { profile_pic?: string }
          if (profile.profile_pic) {
            fromAvatar =
              (await this.uploadService.uploadFromUrl(profile.profile_pic, 'avatars')) || null
          }
        }
      } catch {
        this.logger.warn(`[Instagram Comment] Failed to fetch avatar for ${commenterId}`)
      }
    }

    await this.prisma.comment.upsert({
      where: { id: commentId },
      create: {
        id: commentId,
        postId: mediaId,
        parentId: value.parent_id || null,
        message: value.text || '',
        fromId: commenterId || 'unknown',
        fromName: value.from?.username || 'Utilisateur Instagram',
        fromAvatar,
        createdTime,
        isRead: isOwnComment,
        isPageReply: isOwnComment,
      },
      update: {
        message: value.text || '',
        ...(fromAvatar ? { fromAvatar } : {}),
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

    await this.commentModeration.analyzeAndAct(socialAccountId, commentId, 'INSTAGRAM', orgId, {
      id: commentId,
      message: value.text || '',
      fromName: value.from?.username || 'Unknown',
      fromId: value.from?.id || 'unknown',
    })
  }

  /** Meta (Messenger / Instagram) ad referral — from message, top-level, or postback. */
  private extractMetaAdReferral(messaging: MessagingEvent): Prisma.InputJsonValue | null {
    const ref = messaging.message?.referral ?? messaging.referral ?? messaging.postback?.referral
    if (!ref) return null
    const isAd = ref.source === 'ADS' || ref.type === 'AD' || !!ref.ad_id
    if (!isAd) return null
    return {
      platform: 'META',
      source: ref.source ?? null,
      type: ref.type ?? null,
      adId: ref.ad_id ?? null,
      ref: ref.ref ?? null,
      adsContextData: (ref.ads_context_data as Prisma.InputJsonValue) ?? null,
    }
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

    // Get sender name via conversations API (direct /{PSID} requires extra permissions)
    let senderName = 'Utilisateur'
    let senderAvatar: string | null = null
    try {
      const _account = await this.prisma.socialAccount.findUnique({
        where: { id: socialAccountId },
        select: { accessToken: true },
      })
      if (!_account) throw new NotFoundException('Social account not found')
      const accessToken = await this.encryptionService.decrypt(_account.accessToken)

      // Check existing conversation first
      const existingConv = await this.prisma.conversation.findUnique({
        where: {
          socialAccountId_participantId: {
            socialAccountId,
            participantId: senderId,
          },
        },
        select: { participantName: true, participantAvatar: true },
      })

      const hasValidName =
        existingConv?.participantName &&
        existingConv.participantName !== 'Utilisateur' &&
        existingConv.participantName !== senderId
      if (hasValidName) {
        // Already have a valid name stored
        senderName = existingConv.participantName
        senderAvatar = existingConv.participantAvatar || null
      } else {
        // Fetch participant name from conversations API filtered by user_id
        const convRes = await fetch(
          `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${pageId}/conversations?fields=participants&user_id=${senderId}&access_token=${accessToken}`,
        )
        if (convRes.ok) {
          const convData = (await convRes.json()) as {
            data?: Array<{
              participants: { data: Array<{ id: string; name?: string }> }
            }>
          }
          const participant = convData.data?.[0]?.participants?.data?.find((p) => p.id === senderId)
          if (participant?.name) {
            senderName = participant.name
          }
        } else {
          const errorBody = await convRes.text()
          this.logger.warn(
            `[Messenger] Conversation fetch failed (${convRes.status}): ${errorBody}`,
          )
        }
      }
    } catch (error) {
      this.logger.warn(`[Messenger] Failed to fetch profile for ${senderId}`, error)
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
    if (!conversation) return

    await this.webhookCommon.markConversationFromAd(
      conversation.id,
      this.extractMetaAdReferral(messaging),
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
      const _account = await this.prisma.socialAccount.findUnique({
        where: { id: socialAccountId },
        select: { accessToken: true },
      })
      if (!_account) throw new NotFoundException('Social account not found')
      const accessToken = await this.encryptionService.decrypt(_account.accessToken)
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

        // Check if we already have a stored Minio avatar for this conversation
        const existingConv = await this.prisma.conversation.findUnique({
          where: {
            socialAccountId_participantId: {
              socialAccountId,
              participantId: senderId,
            },
          },
          select: { participantAvatar: true },
        })

        const hasMinioAvatar = existingConv?.participantAvatar?.includes('/avatars/')
        if (hasMinioAvatar) {
          senderAvatar = existingConv?.participantAvatar ?? null
        } else if (profile.profile_pic) {
          // Download avatar to Minio for permanent storage
          senderAvatar =
            (await this.uploadService.uploadFromUrl(profile.profile_pic, 'avatars')) || null
        }
      } else {
        const errorBody = await profileRes.text()
        this.logger.warn(`[Instagram DM] Profile fetch failed (${profileRes.status}): ${errorBody}`)
      }
    } catch (error) {
      this.logger.warn(`[Instagram DM] Failed to fetch profile for ${senderId}`, error)
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
    if (!conversation) return

    await this.webhookCommon.markConversationFromAd(
      conversation.id,
      this.extractMetaAdReferral(messaging),
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

    if (reaction.action === 'react' && reaction.emoji) {
      await this.prisma.conversation.update({
        where: { id: targetMessage.conversationId },
        data: {
          lastMessageText: `[reaction:${reaction.emoji}]`,
          lastMessageAt: new Date(),
        },
      })
    }

    this.logger.log(
      `[${provider} Reaction] ${reaction.action} "${reaction.emoji || ''}" on message ${targetMsgId} by ${senderId}`,
    )

    this.eventsGateway.emitToOrg(orgId, 'message:reaction', {
      conversationId: targetMessage.conversationId,
      messageId: targetMessage.id,
      reactions: updated,
    })
  }
}
