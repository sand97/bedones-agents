import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Prisma } from 'generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from '../auth/encryption.service'
import { UploadService } from '../upload/upload.service'
import { AIService, type AIAnalysisResult } from './ai.service'
import { MessagingService, HISTORY_SYNC_WINDOW_DAYS } from './messaging.service'
import { CatalogService } from '../catalog/catalog.service'
import { EventsGateway } from '../gateway/events.gateway'
import { FACEBOOK_GRAPH_API_VERSION } from '../common/config/facebook-scopes.config'
import { SocialHealthService } from './social-health.service'
import { ReferralProductMatchingService } from '../image-processing/referral-product-matching.service'
import { setRequestContext } from '../posthog/request-context'

/**
 * Provenance captured when a WhatsApp customer messages us straight from an organic
 * social post (referral `source_type === 'post'`). Carried on the incoming-message
 * event so the agent can answer about the product the post was about.
 */
export interface PostReferralContext {
  sourceType: 'post'
  sourceId: string | null
  sourceUrl: string | null
  headline: string | null
  body: string | null
  imageUrl: string | null
  mediaType: string | null
}

export interface IncomingMessageEvent {
  conversationId: string
  socialAccountId: string
  provider: 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK'
  orgId: string
  message: {
    text: string
    mediaUrl: string | null
    mediaType: string | null
    senderId: string
    senderName: string
  }
  /** Set when the conversation was opened from a social post (WhatsApp only, best-effort). */
  referral?: PostReferralContext | null
}

/**
 * Error code returned in a Coexistence `history` webhook when the business chose
 * not to share its message history during Embedded Signup.
 * @see https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
 */
const HISTORY_NOT_SHARED_ERROR_CODE = 2593109

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
    private catalogService: CatalogService,
    private eventsGateway: EventsGateway,
    private eventEmitter: EventEmitter2,
    private socialHealth: SocialHealthService,
    private referralProductMatching: ReferralProductMatchingService,
  ) {
    this.facebookAppSecret = this.configService.getOrThrow<string>('FACEBOOK_APP_SECRET')
    this.instagramAppSecret = this.configService.getOrThrow<string>('INSTAGRAM_APP_SECRET')
    this.whatsappAppSecret = this.configService.getOrThrow<string>('FACEBOOK_APP_SECRET')
  }

  /**
   * Tie the webhook currently being processed to the conversation it resolved to.
   *
   * Called from each handler the moment a conversation is known. It does two things:
   *
   *  1. Enriches the current AsyncLocalStorage scope so EVERY remaining log line of
   *     this webhook's execution — and any synchronous `message.incoming` listener
   *     (contact language, loyalty…) — is stamped, in PostHog → Logs, with the
   *     `conversation_id` / `contact_id` / `social_account_id` / `organisation_id`
   *     / `provider` attributes. Those attributes are what let you pinpoint a
   *     single conversation by cross-referencing any of them.
   *  2. Writes one structured marker log line per (webhook, conversation). Filter
   *     PostHog → Logs by `conversation_id` (or search `[webhook:`) to see every
   *     webhook a conversation received; each line shares the execution's
   *     `request_id`, tying it to the rest of that webhook's logs.
   *
   * Note: a single Meta webhook can fan out to several conversations; the context's
   * `conversation_id` is therefore last-write-wins, but each call happens right
   * before that conversation's own log lines, so attribution stays correct.
   */
  private trackConversationWebhook(params: {
    conversationId: string
    provider: IncomingMessageEvent['provider']
    orgId: string
    eventType: 'message' | 'echo' | 'reaction' | 'status'
    contactId?: string
    socialAccountId?: string
  }): void {
    setRequestContext({
      conversationId: params.conversationId,
      contactId: params.contactId,
      socialAccountId: params.socialAccountId,
      provider: params.provider,
      organisationId: params.orgId,
    })

    this.logger.log(
      `[webhook:${params.provider}] ${params.eventType} → conversation ${params.conversationId}`,
    )
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

  async verifyTikTokSignature(rawBody: Buffer, signature: string): Promise<boolean> {
    const parsed = this.parseTikTokSignature(signature)
    if (!parsed) return false

    const configuredToleranceSeconds = Number(
      this.configService.get<string>('TIKTOK_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS', '300'),
    )
    const toleranceSeconds = Number.isFinite(configuredToleranceSeconds)
      ? configuredToleranceSeconds
      : 300
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - parsed.timestamp) > toleranceSeconds) {
      this.logger.warn('[TikTok Webhook] Signature timestamp outside tolerance')
      return false
    }

    const clientSecret = this.configService.getOrThrow<string>('TIKTOK_CLIENT_SECRET')
    const signedPayload = `${parsed.timestamp}.${rawBody.toString('utf8')}`
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(clientSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload))
    const computedSignature = Array.from(new Uint8Array(signed))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    return this.safeEqualHex(computedSignature, parsed.signature)
  }

  private parseTikTokSignature(signature: string): { timestamp: number; signature: string } | null {
    const parts = new Map(
      signature.split(',').map((part) => {
        const [key, ...value] = part.trim().split('=')
        return [key, value.join('=')] as const
      }),
    )
    const timestamp = Number(parts.get('t'))
    const signed = parts.get('s')
    if (!Number.isFinite(timestamp) || !signed) return null
    return { timestamp, signature: signed }
  }

  private safeEqualHex(left: string, right: string): boolean {
    if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) return false
    const leftBytes = new Uint8Array(left.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) ?? [])
    const rightBytes = new Uint8Array(right.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) ?? [])
    if (leftBytes.length !== rightBytes.length) return false
    let diff = 0
    for (let i = 0; i < leftBytes.length; i++) {
      diff |= leftBytes[i] ^ rightBytes[i]
    }
    return diff === 0
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

    await this.analyzeAndAct(socialAccountId, commentId, 'INSTAGRAM', orgId, {
      id: commentId,
      message: value.text || '',
      fromName: value.from?.username || 'Unknown',
      fromId: value.from?.id || 'unknown',
    })
  }

  // ─── Ad / referral detection ───
  // When an incoming message originates from an ad, we flag the conversation so the
  // agent's "activate on ad messages" scope can pick it up. Detection is best-effort
  // and platform-specific.

  /** Persist ad provenance on the conversation. No-op when `referral` is null. */
  private async markConversationFromAd(
    conversationId: string,
    referral: Prisma.InputJsonValue | null,
  ): Promise<void> {
    if (!referral) return
    try {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { fromAd: true, adReferral: referral },
      })
    } catch (error) {
      this.logger.warn(`Failed to flag conversation ${conversationId} as ad-sourced`, error)
    }
  }

  /**
   * Persist organic-post referral provenance on the conversation. Unlike ad referrals
   * this deliberately does NOT set `fromAd`: a post is not an ad, so it must not change
   * agent activation — it only enriches the agent's context for that message.
   */
  private async attachPostReferral(
    conversationId: string,
    referral: Prisma.InputJsonValue,
  ): Promise<void> {
    try {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { adReferral: referral },
      })
    } catch (error) {
      this.logger.warn(`Failed to attach post referral to conversation ${conversationId}`, error)
    }
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

  /** WhatsApp Click-to-WhatsApp ad referral. */
  private extractWhatsAppAdReferral(msg: WhatsAppMessage): Prisma.InputJsonValue | null {
    const ref = msg.referral
    if (!ref) return null
    // WhatsApp only attaches `referral` on CTWA ad messages, but guard the source type anyway.
    if (ref.source_type && ref.source_type !== 'ad') return null
    return {
      platform: 'WHATSAPP',
      sourceType: ref.source_type ?? 'ad',
      sourceId: ref.source_id ?? null,
      sourceUrl: ref.source_url ?? null,
      ctwaClid: ref.ctwa_clid ?? null,
      headline: ref.headline ?? null,
      body: ref.body ?? null,
    }
  }

  /**
   * WhatsApp organic-post referral (`source_type === 'post'`): the customer tapped
   * "Send message" on one of our Facebook/Instagram posts. Distinct from CTWA ads —
   * see {@link extractWhatsAppAdReferral} — and used to tell the agent which product
   * the post was about, without changing activation.
   */
  private extractWhatsAppPostReferral(msg: WhatsAppMessage): PostReferralContext | null {
    const ref = msg.referral
    if (!ref || ref.source_type !== 'post') return null
    return {
      sourceType: 'post',
      sourceId: ref.source_id ?? null,
      sourceUrl: ref.source_url ?? null,
      headline: ref.headline ?? null,
      body: ref.body ?? null,
      imageUrl: ref.image_url ?? null,
      mediaType: ref.media_type ?? null,
    }
  }

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

    this.trackConversationWebhook({
      conversationId: conversation.id,
      provider: 'FACEBOOK',
      orgId,
      contactId: senderId,
      socialAccountId,
      eventType: 'message',
    })

    await this.markConversationFromAd(conversation.id, this.extractMetaAdReferral(messaging))

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

    this.trackConversationWebhook({
      conversationId: conversation.id,
      provider: 'INSTAGRAM',
      orgId,
      contactId: senderId,
      socialAccountId,
      eventType: 'message',
    })

    await this.markConversationFromAd(conversation.id, this.extractMetaAdReferral(messaging))

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

    this.trackConversationWebhook({
      conversationId: targetMessage.conversationId,
      provider,
      orgId,
      contactId: senderId,
      eventType: 'reaction',
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

  // ─── WhatsApp reaction handling ───
  // WhatsApp sends reactions as a `messages` entry with `type: "reaction"`.
  // An empty emoji string means the user removed their reaction.
  private async handleWhatsAppReaction(msg: WhatsAppMessage, senderId: string, orgId: string) {
    const targetMsgId = msg.reaction?.message_id
    if (!targetMsgId) return

    const emoji = msg.reaction?.emoji ?? ''

    const targetMessage = await this.prisma.directMessage.findUnique({
      where: { platformMsgId: targetMsgId },
      select: { id: true, conversationId: true, reactions: true },
    })

    if (!targetMessage) {
      this.logger.warn(
        `[WhatsApp Reaction] Message ${targetMsgId} not found in DB, skipping reaction`,
      )
      return
    }

    const existing = (targetMessage.reactions as { senderId: string; emoji: string }[]) || []

    // WhatsApp only allows a single reaction per user — replace any previous one.
    const updated = existing.filter((r) => r.senderId !== senderId)
    if (emoji) {
      updated.push({ senderId, emoji })
    }

    await this.prisma.directMessage.update({
      where: { id: targetMessage.id },
      data: { reactions: updated },
    })

    if (emoji) {
      await this.prisma.conversation.update({
        where: { id: targetMessage.conversationId },
        data: {
          lastMessageText: `[reaction:${emoji}]`,
          lastMessageAt: new Date(),
        },
      })
    }

    this.trackConversationWebhook({
      conversationId: targetMessage.conversationId,
      provider: 'WHATSAPP',
      orgId,
      contactId: senderId,
      eventType: 'reaction',
    })

    this.logger.log(
      `[WhatsApp Reaction] ${emoji ? 'react' : 'unreact'} "${emoji}" on message ${targetMsgId} by ${senderId}`,
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
        const isMessageField = change.field === 'messages'
        const isMessageEchoField = change.field === 'smb_message_echoes'
        // Coexistence history sync. The WABA must be subscribed to the
        // `history` webhook field (configured in the Meta App Dashboard).
        const isHistoryField = change.field === 'history'
        // Coexistence contact sync: Meta pushes the business's WhatsApp Business
        // app address-book contacts (and later additions/changes) so we can show
        // the name the business saved instead of the raw phone number.
        const isAppStateSyncField = change.field === 'smb_app_state_sync'
        if (!isMessageField && !isMessageEchoField && !isHistoryField && !isAppStateSyncField)
          continue

        const value = change.value
        if (!value?.metadata?.phone_number_id) continue

        const phoneNumberId = value.metadata.phone_number_id

        // Inbound on the CORE Bedones number → not tied to any org's
        // SocialAccount. These are replies from members on the daily opt-in
        // template. Emit so WhatsappOptinService can refresh their window.
        const coreNumberId = process.env.CORE_WHATSAPP_NUMBER_ID
        if (isMessageField && coreNumberId && phoneNumberId === coreNumberId) {
          for (const msg of value.messages || []) {
            const reply = this.extractWhatsAppButtonReply(msg)
            // Réponse d'un WhatsApp Flow (enquête de départ `feedback_survey_form_1`).
            const flowResponse =
              msg.interactive?.type === 'nfm_reply'
                ? msg.interactive.nfm_reply?.response_json
                : undefined
            this.eventEmitter.emit('whatsapp.core.inbound', {
              senderPhone: msg.from,
              buttonId: reply?.id,
              buttonTitle: reply?.title,
              flowResponseJson: flowResponse,
            })
          }
          continue
        }

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

        // Coexistence: Meta pushes up to ~6 months of chat history through the
        // `history` field after onboarding. We backfill the configured window.
        if (isHistoryField) {
          await this.handleWhatsAppHistory(socialAccount.id, phoneNumberId, value, orgId)
          continue
        }

        // Coexistence contact sync (field: `smb_app_state_sync`).
        if (isAppStateSyncField) {
          await this.handleWhatsAppAppStateSync(socialAccount.id, value, orgId)
          continue
        }

        // Handle status updates (sent, delivered, read)
        for (const status of value.statuses || []) {
          await this.handleWhatsAppStatus(status, orgId)
        }

        // Handle incoming messages
        const ownNumber = value.metadata?.display_phone_number?.replace(/\D/g, '')
        for (const msg of value.messages || []) {
          // Defensive: never treat the page's OWN number as an inbound customer
          // message. Some coexistence setups echo self-sends into `messages`,
          // which would wrongly run — and bill — the agent on its own message.
          if (ownNumber && msg.from?.replace(/\D/g, '') === ownNumber) {
            this.logger.debug(`[WhatsApp] Ignoring self-message from ${msg.from}`)
            continue
          }
          await this.handleWhatsAppMessage(
            socialAccount.id,
            phoneNumberId,
            msg,
            value.contacts,
            orgId,
          )
        }

        // Handle messages sent from the WhatsApp Business app. Meta sends
        // those as "smb_message_echoes" instead of regular inbound messages.
        for (const msg of value.message_echoes || []) {
          await this.handleWhatsAppMessageEcho(
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

    // Get sender name from contacts array. A name synced from the business
    // address book (smb_app_state_sync) wins over the WhatsApp profile name.
    const contact = contacts?.find((c) => c.wa_id === senderId)
    const senderName =
      (await this.resolveWhatsAppContactName(
        socialAccountId,
        senderId,
        contact?.profile?.name || null,
      )) || senderId

    // Extract message content
    let messageText = ''
    let mediaUrl: string | null = null
    let mediaType: string | null = null
    let fileName: string | null = null
    let replyToMid: string | null = null
    let metadata: Record<string, unknown> | null = null

    if (msg.context?.id) {
      replyToMid = msg.context.id
    }

    // Product enquiry: WhatsApp tells us directly which catalog product the
    // customer is referring to (e.g. they tapped a product → "Message" and wrote
    // "celle-ci"). Persist it so the agent can cite the exact product even when we
    // never stored the quoted message ourselves. When absent, we still fall back to
    // resolving the quoted message by `context.id` (see agent message processor).
    const referredProduct = msg.context?.referred_product
    if (referredProduct?.product_retailer_id) {
      metadata = {
        ...(metadata ?? {}),
        referredProduct: {
          retailerId: referredProduct.product_retailer_id,
          catalogId: referredProduct.catalog_id ?? null,
        },
      }
    }

    if (msg.type === 'reaction') {
      await this.handleWhatsAppReaction(msg, senderId, orgId)
      return
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
      case 'order': {
        mediaType = 'order'
        const order = msg.order
        const rawItems = (order?.product_items || []).map((item) => ({
          productRetailerId: item.product_retailer_id,
          quantity: Number(item.quantity) || 1,
          itemPrice: Number(item.item_price) || 0,
          currency: item.currency,
        }))
        const total = rawItems.reduce((sum, it) => sum + it.itemPrice * it.quantity, 0)

        // Hydrate name/image from Meta catalog so the UI shows readable products.
        let enrichedItems = rawItems as Array<
          (typeof rawItems)[number] & {
            name: string | null
            imageUrl: string | null
          }
        >
        if (order?.catalog_id) {
          const hydrated = await this.messagingService.buildEnrichedItemsForSocialAccount(
            socialAccountId,
            order.catalog_id,
            rawItems.map((i) => i.productRetailerId),
          )
          const byId = new Map(hydrated.map((h) => [h.productRetailerId, h]))
          enrichedItems = rawItems.map((item) => {
            const h = byId.get(item.productRetailerId)
            return {
              ...item,
              name: h?.name ?? null,
              imageUrl: h?.imageUrl ?? null,
            }
          })
        }

        metadata = {
          kind: 'order',
          catalogId: order?.catalog_id || null,
          text: order?.text || undefined,
          items: enrichedItems,
          total,
          currency: rawItems[0]?.currency || null,
        }
        messageText = order?.text || ''
        break
      }
      case 'interactive': {
        const reply = this.extractWhatsAppButtonReply(msg)
        if (reply) {
          messageText = reply.title
          metadata = {
            kind: reply.kind,
            replyId: reply.id,
            replyTitle: reply.title,
            ...(reply.description ? { replyDescription: reply.description } : {}),
          }
        } else {
          messageText = '[interactive]'
        }
        break
      }
      case 'button': {
        const reply = this.extractWhatsAppButtonReply(msg)
        if (reply) {
          messageText = reply.title
          metadata = {
            kind: reply.kind,
            replyId: reply.id,
            replyTitle: reply.title,
          }
        } else {
          messageText = '[button]'
        }
        break
      }
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
      metadata,
    )
    if (!conversation) return

    this.trackConversationWebhook({
      conversationId: conversation.id,
      provider: 'WHATSAPP',
      orgId,
      contactId: senderId,
      socialAccountId,
      eventType: 'message',
    })

    await this.markConversationFromAd(conversation.id, this.extractWhatsAppAdReferral(msg))

    // Organic post referral: the customer wrote from one of our posts. Persist the
    // provenance (without touching `fromAd`/activation) and forward it so the agent
    // can resolve and answer about the product the post was about.
    const postReferral = this.extractWhatsAppPostReferral(msg)
    if (postReferral) {
      await this.attachPostReferral(
        conversation.id,
        postReferral as unknown as Prisma.InputJsonValue,
      )
    }

    await this.markOutboundMessagesAsRead(conversation.id, orgId, timestamp)

    this.logger.log(
      `[WhatsApp] New message from ${senderName} (${senderId}): "${messageText?.substring(0, 50) || '[media]'}"`,
    )

    this.eventsGateway.emitToOrg(orgId, 'message:new', {
      conversationId: conversation.id,
      socialAccountId,
      provider: 'WHATSAPP',
    })

    // WhatsApp envoie des messages « techniques » qui ne portent aucun contenu
    // client exploitable : on les persiste pour qu'ils restent visibles dans le
    // fil, mais on NE déclenche PAS l'agent (il n'aurait rien à quoi répondre) :
    //   - `unsupported` : contenus que la Cloud API ne sait pas relayer (sondages,
    //     messages éphémères / view-once, types récents non pris en charge…) ;
    //   - `system` : notifications de compte (le client a changé de numéro ou de
    //     code de sécurité) — c'est le message stocké sous la forme « [system] ».
    // Les changements de statut (sent/delivered/read) passent, eux, par
    // handleWhatsAppStatus et n'émettent jamais `message.incoming`.
    if (msg.type === 'unsupported' || msg.type === 'system') return

    this.eventEmitter.emit('message.incoming', {
      conversationId: conversation.id,
      socialAccountId,
      provider: 'WHATSAPP',
      orgId,
      message: { text: messageText, mediaUrl, mediaType, senderId, senderName },
      referral: postReferral,
    } satisfies IncomingMessageEvent)
  }

  private async handleWhatsAppMessageEcho(
    socialAccountId: string,
    phoneNumberId: string,
    msg: WhatsAppMessageEcho,
    contacts: WhatsAppContact[] | undefined,
    orgId: string,
  ) {
    const recipientId = msg.to || contacts?.[0]?.wa_id
    if (!recipientId) return

    const timestamp = new Date(parseInt(msg.timestamp) * 1000)
    const platformMsgId = msg.id
    const contact = contacts?.find((c) => c.wa_id === recipientId)
    // A name synced from the business address book (smb_app_state_sync) wins
    // over the WhatsApp profile name.
    const recipientName = await this.resolveWhatsAppContactName(
      socialAccountId,
      recipientId,
      contact?.profile?.name || null,
    )

    let messageText = ''
    let mediaUrl: string | null = null
    let mediaType: string | null = null
    let fileName: string | null = null
    let metadata: Record<string, unknown> | null = null

    if (msg.type === 'reaction') {
      // Echo on the business side = the owner reacted from the mobile app.
      // The sender of the reaction is the business phone number.
      await this.handleWhatsAppReaction(msg, phoneNumberId, orgId)
      return
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
      case 'interactive': {
        const reply = this.extractWhatsAppButtonReply(msg)
        if (reply) {
          messageText = reply.title
          metadata = {
            kind: reply.kind,
            replyId: reply.id,
            replyTitle: reply.title,
            ...(reply.description ? { replyDescription: reply.description } : {}),
          }
        } else {
          messageText = '[interactive]'
        }
        break
      }
      case 'button': {
        const reply = this.extractWhatsAppButtonReply(msg)
        if (reply) {
          messageText = reply.title
          metadata = {
            kind: reply.kind,
            replyId: reply.id,
            replyTitle: reply.title,
          }
        } else {
          messageText = '[button]'
        }
        break
      }
      default:
        messageText = `[${msg.type}]`
    }

    const saved = await this.messagingService.handleEchoMessage(
      socialAccountId,
      recipientId,
      messageText,
      platformMsgId,
      timestamp,
      mediaUrl,
      mediaType,
      fileName,
      null,
      {
        createConversation: true,
        recipientName,
        senderId: msg.from || phoneNumberId,
        senderName: 'WhatsApp',
        deliveryStatus: 'sent',
        metadata,
      },
    )

    if (!saved) return

    this.trackConversationWebhook({
      conversationId: saved.conversationId,
      provider: 'WHATSAPP',
      orgId,
      contactId: recipientId,
      socialAccountId,
      eventType: 'echo',
    })

    // Reply sent from the WhatsApp Business mobile app implies the owner
    // has read the inbound messages up to that point. Clear the badge.
    await this.markInboundMessagesAsRead(saved.conversationId, orgId, timestamp)

    this.logger.log(
      `[WhatsApp Echo] New outbound message to ${recipientName || recipientId}: "${messageText?.substring(0, 50) || '[media]'}"`,
    )

    this.eventsGateway.emitToOrg(orgId, 'message:new', {
      conversationId: saved.conversationId,
      socialAccountId,
      provider: 'WHATSAPP',
      isFromPage: true,
    })
  }

  private extractWhatsAppButtonReply(msg: WhatsAppMessage): {
    id: string
    title: string
    description?: string
    kind: 'whatsapp_button_reply' | 'whatsapp_list_reply' | 'whatsapp_template_button_reply'
  } | null {
    if (msg.interactive?.button_reply) {
      const reply = msg.interactive.button_reply
      return {
        id: reply.id,
        title: reply.title,
        kind: 'whatsapp_button_reply',
      }
    }

    if (msg.interactive?.list_reply) {
      const reply = msg.interactive.list_reply
      return {
        id: reply.id,
        title: reply.title,
        description: reply.description,
        kind: 'whatsapp_list_reply',
      }
    }

    if (msg.button) {
      const title = msg.button.text || msg.button.payload || ''
      if (!title) return null
      return {
        id: msg.button.payload || title,
        title,
        kind: 'whatsapp_template_button_reply',
      }
    }

    return null
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
      select: {
        id: true,
        conversationId: true,
        deliveryStatus: true,
        isFromPage: true,
        createdTime: true,
      },
    })

    if (!message) return

    this.trackConversationWebhook({
      conversationId: message.conversationId,
      provider: 'WHATSAPP',
      orgId,
      contactId: status.recipient_id,
      eventType: 'status',
    })

    // Read receipt on an inbound message → business owner read it from a
    // linked device (e.g. WhatsApp Business mobile app). Mark all earlier
    // inbound messages as read and refresh the conversation unread count.
    if (status.status === 'read' && !message.isFromPage) {
      await this.markInboundMessagesAsRead(message.conversationId, orgId, message.createdTime)
      return
    }

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

    this.eventEmitter.emit('campaign.whatsapp.status', {
      platformMsgId: status.id,
      status: status.status,
    })
  }

  /**
   * Persist a Coexistence history-sync webhook (field: `history`).
   *
   * Meta pushes up to ~6 months of chat history in chunked phases; we keep only
   * the trailing configured window (HISTORY_SYNC_WINDOW_DAYS). Every message is written through
   * {@link MessagingService.handleHistoricalMessage}, which dedups on the
   * provider message id (wamid) — so a live webhook arriving during the sync
   * never produces a duplicate. The account's history status is marked COMPLETED
   * once the final chunk reports 100% progress.
   */
  private async handleWhatsAppHistory(
    socialAccountId: string,
    phoneNumberId: string,
    value: WhatsAppWebhookValue,
    orgId: string,
  ) {
    // The business declined to share its history during Embedded Signup: Meta
    // sends a `history` webhook carrying error 2593109 instead of any messages.
    // Mark the account so the UI stops "awaiting history" forever.
    const errors = [
      ...(value.errors || []),
      ...(value.history || []).flatMap((c) => c.errors || []),
    ]
    const notSharedError = errors.find((e) => e.code === HISTORY_NOT_SHARED_ERROR_CODE)
    if (notSharedError) {
      this.logger.warn(
        `[WhatsApp History] Business declined to share history for account ${socialAccountId} (code ${notSharedError.code})`,
      )
      await this.prisma.socialAccount
        .update({
          where: { id: socialAccountId },
          data: {
            historySyncStatus: 'UNSUPPORTED',
            historySyncedAt: new Date(),
            historySyncError:
              notSharedError.message || 'Business declined to share message history',
          },
        })
        .catch(() => undefined)
      return
    }

    const contacts = value.contacts
    const cutoff = new Date(Date.now() - HISTORY_SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    let imported = 0
    let maxProgress = 0

    for (const chunk of value.history || []) {
      const progress = Number(chunk.metadata?.progress ?? 0)
      if (!Number.isNaN(progress)) maxProgress = Math.max(maxProgress, progress)

      for (const thread of chunk.threads || []) {
        const participantId = thread.id
        if (!participantId) continue
        const contact = contacts?.find((c) => c.wa_id === participantId)
        // A name synced from the business address book (smb_app_state_sync) wins
        // over the WhatsApp profile name.
        const participantName =
          (await this.resolveWhatsAppContactName(
            socialAccountId,
            participantId,
            contact?.profile?.name || null,
          )) || participantId

        for (const msg of thread.messages || []) {
          // Reactions are folded into their target message live; skip in history.
          if (msg.type === 'reaction') continue

          const timestamp = new Date(parseInt(msg.timestamp) * 1000)
          if (Number.isNaN(timestamp.getTime()) || timestamp < cutoff) continue

          // Direction: prefer Meta's explicit flag, fall back to sender identity.
          const fromMe =
            msg.history_context?.from_me === true ||
            (msg.from !== undefined && msg.from !== participantId)

          const content = await this.mapWhatsAppHistoryContent(socialAccountId, msg)
          const created = await this.messagingService.handleHistoricalMessage({
            socialAccountId,
            participantId,
            participantName,
            platformThreadId: participantId,
            platformMsgId: msg.id,
            message: content.messageText,
            senderId: fromMe ? phoneNumberId : participantId,
            senderName: fromMe ? 'WhatsApp' : participantName,
            isFromPage: fromMe,
            mediaUrl: content.mediaUrl,
            mediaType: content.mediaType,
            fileName: content.fileName,
            replyToMid: msg.context?.id || null,
            deliveryStatus: fromMe ? msg.history_context?.status?.toLowerCase() || null : null,
            metadata: content.metadata,
            timestamp,
          })
          if (created) imported++
        }
      }
    }

    if (maxProgress >= 100) {
      await this.prisma.socialAccount
        .update({
          where: { id: socialAccountId },
          data: {
            historySyncStatus: 'COMPLETED',
            historySyncedAt: new Date(),
            historySyncError: null,
          },
        })
        .catch(() => undefined)
    }

    this.logger.log(
      `[WhatsApp History] imported ${imported} message(s) for account ${socialAccountId} (progress=${maxProgress}%)`,
    )

    this.eventsGateway.emitToOrg(orgId, 'message:new', {
      socialAccountId,
      provider: 'WHATSAPP',
      historyImported: imported,
    })
  }

  /**
   * Persist a Coexistence contact-sync webhook (field: `smb_app_state_sync`).
   *
   * Meta delivers the contacts saved in the business's WhatsApp Business app
   * address book (right after onboarding) plus any later additions/changes, so
   * we can display the name the business chose instead of a bare phone number.
   * A "contact" in our model is a {@link Conversation} keyed by
   * (socialAccountId, participantId) — the participantId being the wa_id
   * (digits only) used everywhere else in the WhatsApp flows.
   *
   * - `add` / `update` (and any other non-removal action carrying a name):
   *   upsert the conversation, touching only `participantName`. An existing
   *   thread keeps its messages, unread count and last-message preview; a
   *   brand-new contact is created without a fake last message so it sorts
   *   below active chats (lastMessageAt stays null).
   * - `remove`: ignored — we never delete a contact or its message history.
   */
  private async handleWhatsAppAppStateSync(
    socialAccountId: string,
    value: WhatsAppWebhookValue,
    orgId: string,
  ) {
    let synced = 0

    for (const entry of value.state_sync || []) {
      if (entry.type !== 'contact' || !entry.contact) continue

      const action = (entry.action || '').toLowerCase()
      // Normalize the phone number to the wa_id format (digits only) that the
      // message/echo/history flows use as the conversation participantId.
      const participantId = (entry.contact.phone_number || '').replace(/\D+/g, '')
      if (!participantId) continue

      // Per product decision: contact removals are ignored — keep the
      // conversation (and any history) untouched.
      if (action === 'remove' || action === 'delete') {
        this.logger.log(`[WhatsApp StateSync] Ignoring "${action}" for ${participantId}`)
        continue
      }

      const name = (entry.contact.full_name || entry.contact.first_name || '').trim()
      if (!name) continue

      await this.prisma.conversation.upsert({
        where: {
          socialAccountId_participantId: { socialAccountId, participantId },
        },
        create: {
          socialAccountId,
          participantId,
          participantName: name,
          contactNameSynced: true,
        },
        update: {
          participantName: name,
          contactNameSynced: true,
        },
      })
      synced++
    }

    if (synced === 0) return

    this.logger.log(
      `[WhatsApp StateSync] Synced ${synced} contact name(s) for account ${socialAccountId}`,
    )

    // Refresh the conversation list so the new/updated names show up live.
    this.eventsGateway.emitToOrg(orgId, 'conversation:updated', {
      socialAccountId,
      provider: 'WHATSAPP',
    })
  }

  /**
   * Resolve the display name to persist for a WhatsApp contact on an inbound
   * message / echo / history item.
   *
   * Once a conversation's name comes from the business address-book sync
   * (smb_app_state_sync, {@link handleWhatsAppAppStateSync}), it is
   * authoritative: it must win over the WhatsApp profile name (or bare number)
   * carried by later messages, and only another contact sync may change it.
   * Returns the locked synced name when the conversation is flagged, otherwise
   * the candidate name extracted from the message.
   */
  private async resolveWhatsAppContactName(
    socialAccountId: string,
    participantId: string,
    candidateName: string | null,
  ): Promise<string | null> {
    const existing = await this.prisma.conversation.findUnique({
      where: { socialAccountId_participantId: { socialAccountId, participantId } },
      select: { participantName: true, contactNameSynced: true },
    })
    if (existing?.contactNameSynced) return existing.participantName
    return candidateName
  }

  /** Extract displayable content from a historical WhatsApp message. */
  private async mapWhatsAppHistoryContent(
    socialAccountId: string,
    msg: WhatsAppHistoryMessage,
  ): Promise<{
    messageText: string
    mediaUrl: string | null
    mediaType: string | null
    fileName: string | null
    metadata: Record<string, unknown> | null
  }> {
    let messageText = ''
    let mediaUrl: string | null = null
    let mediaType: string | null = null
    let fileName: string | null = null
    let metadata: Record<string, unknown> | null = null

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
      case 'interactive':
      case 'button': {
        const reply = this.extractWhatsAppButtonReply(msg)
        if (reply) {
          messageText = reply.title
          metadata = {
            kind: reply.kind,
            replyId: reply.id,
            replyTitle: reply.title,
            ...(reply.description ? { replyDescription: reply.description } : {}),
          }
        } else {
          messageText = `[${msg.type}]`
        }
        break
      }
      default:
        messageText = msg.text?.body || `[${msg.type}]`
    }

    return { messageText, mediaUrl, mediaType, fileName, metadata }
  }

  private async markInboundMessagesAsRead(conversationId: string, orgId: string, readAt: Date) {
    const result = await this.prisma.directMessage.updateMany({
      where: {
        conversationId,
        isFromPage: false,
        isRead: false,
        createdTime: { lte: readAt },
      },
      data: { isRead: true },
    })
    if (result.count === 0) return

    const unreadCount = await this.prisma.directMessage.count({
      where: { conversationId, isFromPage: false, isRead: false },
    })

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { unreadCount },
    })

    this.eventsGateway.emitToOrg(orgId, 'conversation:read', {
      conversationId,
      unreadCount,
    })
  }

  private async markOutboundMessagesAsRead(conversationId: string, orgId: string, readAt: Date) {
    const messages = await this.prisma.directMessage.findMany({
      where: {
        conversationId,
        isFromPage: true,
        createdTime: { lte: readAt },
        OR: [{ deliveryStatus: null }, { deliveryStatus: { not: 'read' } }],
      },
      select: { id: true, platformMsgId: true },
    })
    if (messages.length === 0) return

    await this.prisma.directMessage.updateMany({
      where: { id: { in: messages.map((message) => message.id) } },
      data: { deliveryStatus: 'read' },
    })

    for (const message of messages) {
      this.eventsGateway.emitToOrg(orgId, 'message:status', {
        conversationId,
        messageId: message.id,
        platformMsgId: message.platformMsgId,
        deliveryStatus: 'read',
      })
    }
  }

  private async downloadWhatsAppMedia(
    socialAccountId: string,
    mediaId?: string,
  ): Promise<string | null> {
    if (!mediaId) return null

    try {
      const account = await this.prisma.socialAccount.findUnique({
        where: { id: socialAccountId },
        select: { accessToken: true },
      })
      if (!account) throw new NotFoundException('Social account not found')
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

    await this.analyzeAndAct(socialAccount.id, commentId, 'TIKTOK', orgId, {
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

    this.trackConversationWebhook({
      conversationId: conversation.id,
      provider: 'TIKTOK',
      orgId: socialAccount.organisationId,
      contactId: participantId,
      socialAccountId: socialAccount.id,
      eventType: 'message',
    })

    await this.markConversationFromAd(conversation.id, this.extractTikTokAdReferral(content))

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

      if (!settings.isConfigured) {
        this.logger.log(`[AI] AI not configured for account ${socialAccountId}, skipping`)
        return
      }

      // Per-post agent override: a post toggled OFF disables agent replies to its comments.
      const dbComment = await this.prisma.comment.findUnique({
        where: { id: commentId },
        select: { postId: true },
      })
      if (dbComment) {
        const dbPost = await this.prisma.post.findUnique({
          where: { id: dbComment.postId },
          select: { aiOverride: true },
        })
        if (dbPost?.aiOverride === 'FORCE_OFF') {
          this.logger.log(
            `[AI] Agent disabled for post ${dbComment.postId}; skipping comment ${commentId}`,
          )
          return
        }
      }

      // Resolve access token once — used for the thread fetch and (later) for the action.
      const account = await this.prisma.socialAccount.findUnique({
        where: { id: socialAccountId },
        select: { accessToken: true, providerAccountId: true },
      })
      if (!account) throw new NotFoundException('Social account not found')
      const accessToken = await this.encryptionService.decrypt(account.accessToken)

      // Pull the parent reply chain from the platform so the agent can see what was
      // already said and avoid repeating the same canned answer.
      const { post, thread } = await this.fetchCommentThread({
        commentId,
        provider,
        socialAccountId,
        pageId: account.providerAccountId,
        accessToken,
      })

      // Resolve the products this post is about — the articles the merchant explicitly
      // linked to it (primary) plus any product code mentioned in the caption — so the
      // agent can answer price/availability/feature questions on the right item with the
      // seller's own description and custom context.
      const products = await this.resolvePostProducts({
        catalogId: settings.catalogId,
        organisationId: orgId,
        postId: dbComment?.postId ?? null,
        postMessage: post?.message ?? null,
        accessToken,
      })

      const result = await this.aiService.analyzeComment(
        {
          comment,
          post,
          thread,
          products,
          pageSettings: {
            undesiredCommentsAction: settings.undesiredCommentsAction,
            spamAction: settings.spamAction,
            customInstructions: settings.customInstructions,
            faqRules: settings.faqRules.map((r) => ({
              question: r.question,
              answer: r.answer,
            })),
          },
        },
        { organisationId: orgId, socialAccountId, provider, commentId },
      )

      this.logger.log(`[AI] Comment ${commentId}: action=${result.action}, reason=${result.reason}`)

      if (result.action === 'none') return

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

  // ─── Comment thread reconstruction ───

  /**
   * Walk the parent chain of the given comment so the AI can see the full
   * conversation up to (but not including) the comment being analyzed. The result
   * is ordered oldest → newest. The post itself is returned separately.
   *
   * Tries the platform API first (fresh data, includes parents we may never have
   * stored locally); falls back to walking local DB rows by `parentId` when the API
   * call fails.
   */
  private async fetchCommentThread(args: {
    commentId: string
    provider: 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK'
    socialAccountId: string
    pageId: string
    accessToken: string
  }): Promise<{
    post: { message: string | null; permalinkUrl: string | null } | undefined
    thread: Array<{ fromName: string; message: string; isPageReply: boolean }>
  }> {
    // Locate the comment + its post in DB so we always have post context, even if
    // the platform call fails.
    const localComment = await this.prisma.comment.findUnique({
      where: { id: args.commentId },
      select: {
        id: true,
        parentId: true,
        post: { select: { id: true, message: true, permalinkUrl: true } },
      },
    })

    const post = localComment?.post
      ? { message: localComment.post.message, permalinkUrl: localComment.post.permalinkUrl }
      : undefined

    // No parent → it's a top-level comment, no thread to surface.
    if (!localComment?.parentId) {
      return { post, thread: [] }
    }

    let thread: Array<{ fromName: string; message: string; isPageReply: boolean }> = []

    try {
      if (args.provider === 'FACEBOOK' || args.provider === 'INSTAGRAM') {
        thread = await this.fetchMetaCommentThread(
          localComment.parentId,
          args.provider,
          args.pageId,
          args.accessToken,
        )
      } else if (args.provider === 'TIKTOK') {
        thread = await this.fetchTikTokCommentThread(
          localComment.parentId,
          args.pageId,
          localComment.post?.id || '',
          args.accessToken,
        )
      }
    } catch (error) {
      this.logger.warn(
        `[AI] Thread fetch failed for ${args.commentId} on ${args.provider}: ${error instanceof Error ? error.message : error}`,
      )
    }

    // Fallback to local DB walk when the platform returned nothing usable.
    if (thread.length === 0) {
      thread = await this.walkLocalCommentThread(localComment.parentId)
    }

    return { post, thread }
  }

  /**
   * Facebook & Instagram: a single Graph call with nested `parent` selectors retrieves
   * up to 4 ancestors. Returns ordered oldest → newest.
   */
  private async fetchMetaCommentThread(
    startCommentId: string,
    provider: 'FACEBOOK' | 'INSTAGRAM',
    pageId: string,
    accessToken: string,
  ): Promise<Array<{ fromName: string; message: string; isPageReply: boolean }>> {
    const baseUrl =
      provider === 'INSTAGRAM'
        ? `https://graph.instagram.com/${FACEBOOK_GRAPH_API_VERSION}`
        : `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}`

    // Nested parent selector: each level adds one ancestor. 4 levels is enough for
    // virtually every real comment chain we'll encounter.
    const leaf = 'id,message,from{id,name,username},created_time'
    const fields = `${leaf},parent{${leaf},parent{${leaf},parent{${leaf}}}}`
    const url = `${baseUrl}/${startCommentId}?fields=${fields}&access_token=${accessToken}`

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Graph API ${response.status}: ${await response.text()}`)
    }

    type Node = {
      id?: string
      message?: string
      from?: { id?: string; name?: string; username?: string }
      created_time?: string
      parent?: Node
    }
    const data = (await response.json()) as Node

    const chain: Node[] = []
    let cursor: Node | undefined = data
    while (cursor && cursor.id) {
      chain.push(cursor)
      cursor = cursor.parent
    }

    // chain is currently newest → oldest (current parent first), reverse it.
    chain.reverse()

    return chain.map((n) => {
      const fromId = n.from?.id || ''
      return {
        fromName: n.from?.username || n.from?.name || (fromId === pageId ? 'Page' : 'User'),
        message: n.message || '',
        isPageReply: !!fromId && fromId === pageId,
      }
    })
  }

  /**
   * TikTok: walks up via `parent_comment_id`, fetching one comment per level via the
   * business comment list API. Capped at 5 levels to avoid runaway recursion on
   * pathological threads.
   */
  private async fetchTikTokCommentThread(
    startCommentId: string,
    openId: string,
    videoId: string,
    accessToken: string,
  ): Promise<Array<{ fromName: string; message: string; isPageReply: boolean }>> {
    if (!videoId) return []

    const visited = new Set<string>()
    const chain: Array<{ fromName: string; message: string; isPageReply: boolean }> = []
    let cursor: string | null = startCommentId

    for (let i = 0; i < 5 && cursor && !visited.has(cursor); i++) {
      visited.add(cursor)

      const params = new URLSearchParams({
        business_id: openId,
        video_id: videoId,
      })
      params.append('comment_ids', JSON.stringify([cursor]))
      const url = `https://business-api.tiktok.com/open_api/v1.3/business/comment/list/?${params}`

      const response = await fetch(url, {
        headers: { 'Access-Token': accessToken },
      })
      if (!response.ok) break

      const raw = await response.text()
      const body = JSON.parse(raw) as {
        code: number
        data?: {
          comments?: Array<{
            comment_id: string
            text: string
            owner?: boolean
            display_name?: string
            username?: string
          }>
        }
      }
      if (body.code !== 0) break
      const found = body.data?.comments?.[0]
      if (!found) break

      chain.push({
        fromName: found.display_name || found.username || (found.owner ? 'Page' : 'User'),
        message: found.text || '',
        isPageReply: found.owner === true,
      })

      // Extract the parent_comment_id straight from the raw JSON to avoid BigInt
      // precision loss on big TikTok IDs.
      const parentMatch = raw.match(/"parent_comment_id"\s*:\s*"?(\d+)"?/)
      const next = parentMatch?.[1] || null
      cursor = next && next !== '0' ? next : null
    }

    chain.reverse()
    return chain
  }

  /**
   * Last-resort fallback that uses whatever we already stored locally. Only useful
   * for comments we've previously upserted (so it's reliable for self-replies and
   * recently-active threads where every parent already passed through a webhook).
   */
  private async walkLocalCommentThread(
    startCommentId: string,
  ): Promise<Array<{ fromName: string; message: string; isPageReply: boolean }>> {
    const chain: Array<{ fromName: string; message: string; isPageReply: boolean }> = []
    const visited = new Set<string>()
    let cursor: string | null = startCommentId

    for (let i = 0; i < 5 && cursor && !visited.has(cursor); i++) {
      visited.add(cursor)
      const node: {
        parentId: string | null
        message: string
        fromName: string
        isPageReply: boolean
      } | null = await this.prisma.comment.findUnique({
        where: { id: cursor },
        select: { parentId: true, message: true, fromName: true, isPageReply: true },
      })
      if (!node) break
      chain.push({
        fromName: node.fromName,
        message: node.message,
        isPageReply: node.isPageReply,
      })
      cursor = node.parentId
    }

    chain.reverse()
    return chain
  }

  // ─── Products the post is about ───

  /**
   * Resolve the products a commented post is about, so the agent answers price /
   * availability / feature questions on the right item instead of replying generically.
   *
   * Two sources, merged (explicit links win, deduped by id):
   *  1. The catalog articles the merchant EXPLICITLY linked to this post
   *     (ProductPostLink) — the same source the WhatsApp agent uses. These carry the
   *     seller's name, price, description AND custom context (ProductContext).
   *  2. Product codes (retailer IDs) found in the post caption, resolved against Meta —
   *     a best-effort supplement for posts with no explicit link. Meta lets us look
   *     products up by `retailer_id` directly and CatalogService caches the lookup.
   *
   * Returns [] when nothing resolves. Best-effort throughout: a failure in one source
   * never drops the other.
   */
  private async resolvePostProducts(args: {
    catalogId: string | null
    organisationId: string
    postId: string | null
    postMessage: string | null
    accessToken: string
  }): Promise<
    Array<{
      retailerId: string
      name: string | null
      price: number | null
      currency: string | null
      description: string | null
      customContext: string | null
    }>
  > {
    const products: Array<{
      retailerId: string
      name: string | null
      price: number | null
      currency: string | null
      description: string | null
      customContext: string | null
    }> = []
    const seen = new Set<string>()

    // 1. Articles the merchant explicitly linked to this post (primary).
    if (args.postId) {
      const linked = await this.referralProductMatching.resolveLinkedProductsForPost({
        organisationId: args.organisationId,
        postId: args.postId,
      })
      for (const p of linked) {
        const key = (p.retailerId || p.productId).toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        products.push({
          retailerId: p.retailerId || p.productId,
          name: p.name ?? null,
          price: p.price ?? null,
          currency: p.currency ?? null,
          description: p.description ?? null,
          customContext: p.customContext ?? null,
        })
      }
    }

    // 2. Product codes mentioned in the caption (supplement, name/price only).
    if (args.catalogId && args.postMessage) {
      const codes = this.extractProductCodes(args.postMessage)
      if (codes.length > 0) {
        const catalog = await this.prisma.catalog.findUnique({
          where: { id: args.catalogId },
          select: { providerId: true },
        })
        if (catalog?.providerId) {
          try {
            const hydrated = await this.catalogService.hydrateProductsByRetailerIdsWithAccessToken(
              catalog.providerId,
              codes,
              args.accessToken,
            )
            // Keep only entries Meta actually resolved (a real product name means it matched).
            for (const p of hydrated) {
              if (!p.name) continue
              const key = p.retailerId.toLowerCase()
              if (seen.has(key)) continue
              seen.add(key)
              products.push({
                retailerId: p.retailerId,
                name: p.name,
                price: p.price,
                currency: p.currency,
                description: null,
                customContext: null,
              })
            }
          } catch (error) {
            this.logger.warn(
              `[AI] Product code resolution failed: ${error instanceof Error ? error.message : error}`,
            )
          }
        }
      }
    }

    return products
  }

  /**
   * Extract candidate product codes from a post caption. We look for codes that follow
   * a keyword (ref / réf / code / sku / art / article / produit / product) and for
   * hashtag-style tokens. Meta does the final matching against real retailer IDs, so
   * over-extracting a few extra candidates is harmless — we just cap the count.
   */
  private extractProductCodes(text: string): string[] {
    const codes = new Set<string>()

    const keywordRegex =
      /\b(?:r[ée]f(?:[ée]rence)?|code|sku|art(?:icle)?|produit|product)\s*(?:n[°o]\s*)?[:#-]?\s*([A-Za-z0-9][A-Za-z0-9_-]{1,40})/gi
    const hashtagRegex = /#([A-Za-z0-9][A-Za-z0-9_-]{1,40})/g

    let match: RegExpExecArray | null
    while ((match = keywordRegex.exec(text)) !== null) {
      if (match[1]) codes.add(match[1])
    }
    while ((match = hashtagRegex.exec(text)) !== null) {
      if (match[1]) codes.add(match[1])
    }

    // Cap to keep the Meta filter payload bounded.
    return Array.from(codes).slice(0, 15)
  }

  /**
   * Feeds the result of an automated moderation call into the circuit breaker:
   * a success resets the counter, a failure increments it (tripping past the
   * threshold) so a page that lost its permissions eventually stops being hit.
   */
  private async recordModerationOutcome(
    ok: boolean,
    socialAccountId: string,
    provider: 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK',
    action: string,
    errorText?: string,
  ) {
    if (ok) {
      await this.socialHealth.recordSuccess(socialAccountId)
      return
    }
    await this.socialHealth.recordError({
      socialAccountId,
      provider,
      operation: `aiModerate:${action}`,
      feature: 'COMMENT',
      resource: provider === 'INSTAGRAM' ? 'instagram' : provider === 'TIKTOK' ? 'tiktok' : 'page',
      error: new Error(errorText || `aiModerate ${action} failed`),
    })
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
    // Circuit breaker: keep ingesting the incoming comment, but skip the
    // automated outbound moderation when the account / COMMENT feature is
    // disabled after repeated errors or missing permissions.
    const health = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: { id: true, provider: true, disabled: true, featureDisabled: true },
    })
    if (!health) return
    try {
      this.socialHealth.ensureOutboundAllowed(health, 'COMMENT')
    } catch {
      this.logger.warn(
        `[AI] Skipping ${result.action} on disabled account ${socialAccountId} (provider=${provider})`,
      )
      return
    }

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
        await this.recordModerationOutcome(true, socialAccountId, provider, 'hide')
        this.eventsGateway.emitToOrg(orgId, 'comment:updated', {
          commentId,
          socialAccountId,
          provider,
          action: 'hide',
        })
      } else {
        const errorText = await response.text()
        this.logger.error(`[AI] Failed to hide comment: ${errorText}`)
        await this.recordModerationOutcome(false, socialAccountId, provider, 'hide', errorText)
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
        await this.recordModerationOutcome(true, socialAccountId, provider, 'delete')
        this.eventsGateway.emitToOrg(orgId, 'comment:updated', {
          commentId,
          socialAccountId,
          provider,
          action: 'delete',
        })
      } else {
        const errorText = await response.text()
        this.logger.error(`[AI] Failed to delete comment: ${errorText}`)
        await this.recordModerationOutcome(false, socialAccountId, provider, 'delete', errorText)
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
        await this.recordModerationOutcome(true, socialAccountId, provider, 'reply')
        this.eventsGateway.emitToOrg(orgId, 'comment:updated', {
          commentId,
          socialAccountId,
          provider,
          action: 'reply',
        })
      } else {
        const errorText = await response.text()
        this.logger.error(`[AI] Failed to reply to comment: ${errorText}`)
        await this.recordModerationOutcome(false, socialAccountId, provider, 'reply', errorText)
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

    // TikTok: hide via Business API
    if (result.action === 'hide') {
      const comment = await this.prisma.comment.findUnique({
        where: { id: commentId },
        select: { postId: true },
      })
      if (!comment) return

      const account = await this.prisma.socialAccount.findUnique({
        where: { id: socialAccountId },
        select: { providerAccountId: true },
      })
      if (!account) return

      try {
        const hideResponse = await fetch(
          'https://business-api.tiktok.com/open_api/v1.3/business/comment/hide/',
          {
            method: 'POST',
            headers: {
              'Access-Token': accessToken,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              business_id: account.providerAccountId,
              video_id: comment.postId,
              comment_id: commentId,
              action: 'HIDE',
            }),
          },
        )
        const hideBody = (await hideResponse.json()) as { code: number; message: string }
        if (hideBody.code !== 0) {
          this.logger.error(`[AI] TikTok hide failed: ${hideBody.code} — ${hideBody.message}`)
        }
      } catch (error) {
        this.logger.error(`[AI] TikTok hide error: ${error}`)
      }

      await this.prisma.comment.update({
        where: { id: commentId },
        data: { status: 'HIDDEN', action: 'HIDE', actionReason: result.reason, isRead: true },
      })
      this.logger.log(`[AI] Hidden TikTok comment ${commentId}`)
      this.eventsGateway.emitToOrg(orgId, 'comment:updated', {
        commentId,
        socialAccountId,
        provider,
        action: 'hide',
      })
    }

    // TikTok: delete via Business API
    if (result.action === 'delete') {
      const account = await this.prisma.socialAccount.findUnique({
        where: { id: socialAccountId },
        select: { providerAccountId: true },
      })

      if (account) {
        try {
          const deleteResponse = await fetch(
            'https://business-api.tiktok.com/open_api/v1.3/business/comment/delete/',
            {
              method: 'POST',
              headers: {
                'Access-Token': accessToken,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                business_id: account.providerAccountId,
                comment_id: commentId,
              }),
            },
          )
          const deleteBody = (await deleteResponse.json()) as { code: number; message: string }
          if (deleteBody.code !== 0) {
            this.logger.error(
              `[AI] TikTok delete failed: ${deleteBody.code} — ${deleteBody.message}`,
            )
          }
        } catch (error) {
          this.logger.error(`[AI] TikTok delete error: ${error}`)
        }
      }

      await this.prisma.comment.delete({
        where: { id: commentId },
      })
      this.logger.log(`[AI] Deleted TikTok comment ${commentId}`)
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
      const account = await this.prisma.socialAccount.findUnique({
        where: { id: socialAccountId },
        select: { providerAccountId: true },
      })
      if (!account) throw new NotFoundException('Social account not found')

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

// Meta (Messenger/Instagram) ad referral — present when a conversation starts from
// a Click-to-Messenger / Click-to-Instagram ad, an m.me ad link, or an icebreaker.
interface MetaReferral {
  ref?: string
  source?: string // e.g. 'ADS', 'SHORTLINK', 'CUSTOMER_CHAT_PLUGIN'
  type?: string // e.g. 'OPEN_THREAD', 'AD'
  ad_id?: string
  ads_context_data?: {
    ad_title?: string
    photo_url?: string
    video_url?: string
    post_id?: string
  }
}

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
    referral?: MetaReferral
  }
  referral?: MetaReferral
  postback?: { referral?: MetaReferral }
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
  message_echoes?: WhatsAppMessageEcho[]
  history?: WhatsAppHistoryEntry[]
  state_sync?: WhatsAppStateSync[]
  errors?: WhatsAppWebhookError[]
  statuses?: Array<{
    id: string
    status: string
    timestamp: string
    recipient_id: string
  }>
}

interface WhatsAppWebhookError {
  code: number
  title?: string
  message?: string
  error_data?: { details?: string }
}

interface WhatsAppContact {
  wa_id: string
  user_id?: string
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
  order?: {
    catalog_id: string
    text?: string
    product_items?: Array<{
      product_retailer_id: string
      quantity: number | string
      item_price: number | string
      currency: string
    }>
  }
  interactive?: {
    type: string
    button_reply?: { id: string; title: string }
    list_reply?: { id: string; title: string; description?: string }
    // Réponse d'un WhatsApp Flow (ex: enquête de départ). `response_json` est une
    // chaîne JSON contenant `flow_token` + les champs soumis du formulaire.
    nfm_reply?: { name?: string; body?: string; response_json?: string }
  }
  button?: { payload?: string; text?: string }
  reaction?: { message_id: string; emoji: string }
  context?: {
    id?: string
    from?: string
    // Product enquiry: the customer messaged ABOUT a specific catalog product
    // (tapped a product card → "Message"). WhatsApp gives us the product directly.
    referred_product?: { catalog_id?: string; product_retailer_id?: string }
  }
  // Present when the message originates from an ad (Click-to-WhatsApp) or an organic
  // post the customer tapped to message us from.
  referral?: {
    source_type?: string // e.g. 'ad', 'post'
    source_id?: string // ad / post id
    source_url?: string
    ctwa_clid?: string // Click-to-WhatsApp click id
    headline?: string
    body?: string
    media_type?: string // e.g. 'image', 'video'
    image_url?: string
  }
}

interface WhatsAppMessageEcho extends WhatsAppMessage {
  to?: string
  to_user_id?: string
  from_user_id?: string
}

// ─── Coexistence message history (field: "history") ───
interface WhatsAppHistoryEntry {
  metadata?: {
    phase?: string | number
    chunk_order?: string | number
    progress?: string | number
  }
  errors?: WhatsAppWebhookError[]
  threads?: Array<{ id: string; messages?: WhatsAppHistoryMessage[] }>
}

interface WhatsAppHistoryMessage extends WhatsAppMessage {
  to?: string
  history_context?: { status?: string; from_me?: boolean }
}

// ─── Coexistence contact sync (field: "smb_app_state_sync") ───
interface WhatsAppStateSync {
  type: string // "contact"
  contact?: {
    full_name?: string
    first_name?: string
    phone_number?: string
  }
  action?: string // "add" | "update" | "remove"
  metadata?: { timestamp?: string }
}

// ─── TikTok webhook payload types ───

interface TikTokWebhookPayload {
  client_key: string
  event: string
  create_time: number
  user_openid: string
  content: string | TikTokCommentContent | TikTokDirectMessageContent
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

interface TikTokDirectMessageContent {
  timestamp?: number | string
  unique_identifier?: string
  conversation_id: string
  message_id?: string
  message_type?: string
  type?: string
  from?: string
  to?: string
  from_user?: TikTokDirectMessageUser
  to_user?: TikTokDirectMessageUser
  text?: { body?: string }
  image?: { media_id?: string }
  video?: { media_id?: string }
  share_post?: { item_id?: string; embed_url?: string }
  template?: {
    type: 'QA_BUTTON_CARD' | 'QA_LINK_CARD'
    title: string
    buttons: Array<{ type?: 'REPLY'; title: string; id?: string }>
  }
  referenced_message_info?: { referenced_message_id?: string }
  reactions?: Array<{ sender_id?: string; emoji?: string }>
  read?: Record<string, string | number | undefined>
  scene_type?: number
  is_follower?: boolean
  message_tag?: Record<string, unknown>
}

interface TikTokDirectMessageUser {
  id?: string
  role?: string
  display_name?: string
  profile_image?: string
  avatar_url?: string
}
