import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from '../auth/encryption.service'
import { UploadService } from '../upload/upload.service'
import { SocialCommonService } from './social-common.service'

@Injectable()
export class TikTokContentService {
  private readonly logger = new Logger(TikTokContentService.name)

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private encryptionService: EncryptionService,
    private uploadService: UploadService,
    private common: SocialCommonService,
  ) {}

  // ─── TikTok: Refresh token ───

  async refreshTikTokToken(socialAccountId: string): Promise<string> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: { refreshToken: true, tokenExpiresAt: true, accessToken: true },
    })
    if (!account) throw new NotFoundException('Social account not found')

    // Check if token is still valid
    if (account.tokenExpiresAt && account.tokenExpiresAt > new Date()) {
      return this.encryptionService.decrypt(account.accessToken)
    }

    if (!account.refreshToken) {
      throw new BadRequestException('TikTok token expired and no refresh token available')
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
      this.logger.error(`[TikTok] Token refresh failed: ${await response.text()}`)
      throw new BadRequestException('Failed to refresh TikTok token')
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

  // ─── TikTok: Fetch videos (posts) ───

  async syncTikTokVideos(userId: string, accountId: string) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        provider: true,
        username: true,
        organisationId: true,
        accessToken: true,
        refreshToken: true,
        tokenExpiresAt: true,
        providerAccountId: true,
      },
    })
    if (!account) throw new NotFoundException('Social account not found')
    if (account.provider !== 'TIKTOK') {
      throw new BadRequestException('Not a TikTok account')
    }
    await this.common.assertMembership(userId, account.organisationId)

    // Try Business API first, fallback to oEmbed
    const synced = await this.syncTikTokVideosViaBusinessApi(account)
    if (synced !== null) {
      this.logger.log(`[TikTok] ✓ Sync completed via Business API — ${synced.synced} videos`)
      return synced
    }
    const oembedResult = await this.syncTikTokVideosViaOEmbed(accountId, account.username)
    this.logger.log(`[TikTok] ✓ Sync completed via oEmbed fallback — ${oembedResult.synced} videos`)
    return oembedResult
  }

  /**
   * Sync TikTok video list and thumbnails via Business API
   */
  async syncTikTokVideosViaBusinessApi(account: {
    id: string
    accessToken: string
    refreshToken: string | null
    tokenExpiresAt: Date | null
    providerAccountId: string
    username: string | null
  }): Promise<{ synced: number } | null> {
    try {
      const accessToken = await this.getTikTokAccessToken(account)
      const businessId = account.providerAccountId

      const params = new URLSearchParams({
        business_id: businessId,
        fields: JSON.stringify(['item_id', 'caption', 'thumbnail_url', 'share_url']),
      })
      const url = `https://business-api.tiktok.com/open_api/v1.3/business/video/list/?${params}`

      this.logger.log(`[TikTok] Fetching videos via Business API`)
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

      if (body.code !== 0) {
        this.logger.warn(
          `[TikTok] Business API video list failed (code=${body.code}): ${body.message}`,
        )
        return null
      }

      const videos = body.data?.videos || []
      if (videos.length === 0) return { synced: 0 }

      let synced = 0
      for (const video of videos) {
        const existingPost = await this.prisma.post.findUnique({
          where: { id: video.item_id },
          select: { imageUrl: true },
        })

        const hasStoredCover = this.uploadService.isOwnUrl(existingPost?.imageUrl)
        if (existingPost && hasStoredCover) continue

        let imageUrl: string | null = null
        if (video.thumbnail_url) {
          imageUrl =
            (await this.uploadService.uploadFromUrl(video.thumbnail_url, 'posts')) ||
            video.thumbnail_url
        }

        await this.prisma.post.upsert({
          where: { id: video.item_id },
          create: {
            id: video.item_id,
            socialAccountId: account.id,
            message: video.caption || null,
            imageUrl,
            permalinkUrl: video.share_url || null,
          },
          update: {
            message: video.caption || undefined,
            imageUrl: imageUrl || undefined,
            permalinkUrl: video.share_url || undefined,
          },
        })
        synced++
      }

      this.logger.log(`[TikTok] Synced ${synced} videos via Business API for account ${account.id}`)
      return { synced }
    } catch (error) {
      this.logger.warn(`[TikTok] Business API sync error: ${error}, falling back to oEmbed`)
      return null
    }
  }

  async getTikTokAccessToken(account: {
    id: string
    accessToken: string
    refreshToken: string | null
    tokenExpiresAt: Date | null
  }): Promise<string> {
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
      this.logger.error(`[TikTok] Token refresh failed: ${await response.text()}`)
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

  /**
   * Update thumbnails for existing TikTok posts via oEmbed
   * (public API, no scope required). Only processes posts already in DB
   * that are missing a cover image.
   */
  async syncTikTokVideosViaOEmbed(
    accountId: string,
    username?: string | null,
  ): Promise<{ synced: number }> {
    const posts = await this.prisma.post.findMany({
      where: { socialAccountId: accountId },
      select: { id: true, imageUrl: true, message: true, permalinkUrl: true },
    })

    const needsUpdate = posts.filter((p) => !p.imageUrl || !this.uploadService.isOwnUrl(p.imageUrl))
    if (needsUpdate.length === 0) return { synced: 0 }

    const handle = username ? `@${username}` : '@_'
    let synced = 0

    for (const post of needsUpdate) {
      try {
        const videoUrl = `https://www.tiktok.com/${handle}/video/${post.id}`
        const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`)
        if (!res.ok) continue

        const data = (await res.json()) as {
          title?: string
          thumbnail_url?: string
        }
        if (!data.thumbnail_url) continue

        const uploaded =
          (await this.uploadService.uploadFromUrl(data.thumbnail_url, 'posts')) ||
          data.thumbnail_url

        await this.prisma.post.update({
          where: { id: post.id },
          data: {
            imageUrl: uploaded,
            message: post.message || data.title || undefined,
            permalinkUrl: post.permalinkUrl || `https://www.tiktok.com/${handle}/video/${post.id}`,
          },
        })
        synced++
      } catch {
        this.logger.warn(`[TikTok] oEmbed fallback failed for video ${post.id}`)
      }
    }

    this.logger.log(
      `[TikTok] Synced ${synced} video thumbnails via oEmbed for account ${accountId}`,
    )
    return { synced }
  }

  // ─── TikTok: Fetch comments for a video ───

  async syncTikTokComments(userId: string, accountId: string, videoId: string) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: accountId },
      select: { id: true, provider: true, providerAccountId: true, organisationId: true },
    })
    if (!account) throw new NotFoundException('Social account not found')
    if (account.provider !== 'TIKTOK') {
      throw new BadRequestException('Not a TikTok account')
    }
    await this.common.assertMembership(userId, account.organisationId)

    const accessToken = await this.refreshTikTokToken(accountId)

    const url = new URL('https://business-api.tiktok.com/open_api/v1.3/business/comment/list/')
    url.searchParams.set('business_id', account.providerAccountId)
    url.searchParams.set('video_id', videoId)
    url.searchParams.set('max_count', '100')

    const response = await fetch(url.toString(), {
      headers: { 'Access-Token': accessToken },
    })

    if (!response.ok) {
      const error = await response.text()
      this.logger.error(`[TikTok] Fetch comments failed: ${error}`)
      throw new BadRequestException('Failed to fetch TikTok comments')
    }

    const body = (await response.json()) as {
      code?: number
      message?: string
      data?: {
        comments: Array<{
          comment_id: string
          text: string
          create_time?: number
          owner?: boolean
          user_id?: string
          username?: string
          display_name?: string
          profile_image?: string
          parent_comment_id?: string
        }>
      }
    }

    if (body.code !== undefined && body.code !== 0) {
      this.logger.error(`[TikTok] Fetch business comments failed: ${body.code} — ${body.message}`)
      throw new BadRequestException('Failed to fetch TikTok comments')
    }

    // Upsert comments
    for (const comment of body.data?.comments || []) {
      const commentId = String(comment.comment_id)
      const existing = await this.prisma.comment.findUnique({ where: { id: commentId } })

      await this.prisma.comment.upsert({
        where: { id: commentId },
        create: {
          id: commentId,
          postId: videoId,
          parentId: comment.parent_comment_id || null,
          message: comment.text,
          fromId: comment.user_id || 'unknown',
          fromName: comment.display_name || comment.username || 'Utilisateur TikTok',
          fromAvatar: comment.profile_image || null,
          createdTime: new Date((comment.create_time || Math.floor(Date.now() / 1000)) * 1000),
          isRead: !!existing,
        },
        update: {
          message: comment.text,
        },
      })
    }

    this.logger.log(
      `[TikTok] Synced ${body.data?.comments?.length || 0} comments for video ${videoId}`,
    )
    return { synced: body.data?.comments?.length || 0 }
  }

  // ─── TikTok: Reply to a comment ───

  async replyTikTokComment(userId: string, commentId: string, message: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        post: {
          include: {
            socialAccount: {
              select: {
                id: true,
                provider: true,
                organisationId: true,
                disabled: true,
                featureDisabled: true,
              },
            },
          },
        },
      },
    })
    if (!comment) throw new NotFoundException('Comment not found')

    if (comment.post.socialAccount.provider !== 'TIKTOK') {
      throw new BadRequestException('Not a TikTok comment')
    }

    await this.common.assertMembership(userId, comment.post.socialAccount.organisationId)
    const accessToken = await this.refreshTikTokToken(comment.post.socialAccount.id)

    // Get the open_id (business_id) for the Business API
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: comment.post.socialAccount.id },
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
          video_id: comment.postId,
          comment_id: commentId,
          text: message,
        }),
      },
    )

    const replyText = await response.text()
    this.logger.log(`[TikTok] Reply response: ${replyText}`)

    // Extract comment_id from raw text to avoid BigInt precision loss
    const replyIdMatch = replyText.match(/"comment_id"\s*:\s*"?(\d+)"?/)
    const replyBody = JSON.parse(replyText) as {
      code: number
      message: string
    }

    if (replyBody.code !== 0) {
      this.logger.error(`[TikTok] Reply failed: ${replyBody.code} — ${replyBody.message}`)
      throw new BadRequestException(`Failed to reply to TikTok comment: ${replyBody.message}`)
    }

    // Use the real TikTok comment ID to avoid duplicates from webhooks
    const replyId = replyIdMatch?.[1] || `tiktok_reply_${Date.now()}_${commentId}`

    return this.prisma.comment.upsert({
      where: { id: replyId },
      create: {
        id: replyId,
        postId: comment.postId,
        parentId: commentId,
        message,
        fromId: comment.post.socialAccount.id,
        fromName: 'Page',
        createdTime: new Date(),
        isRead: true,
        isPageReply: true,
      },
      update: {},
    })
  }

  // ─── TikTok: Setup webhooks ───

  async setupTikTokWebhook() {
    return this.updateTikTokWebhook('COMMENT')
  }

  async setupTikTokDirectMessageWebhook() {
    return this.updateTikTokWebhook('DIRECT_MESSAGE')
  }

  async updateTikTokWebhook(eventType: 'COMMENT' | 'DIRECT_MESSAGE') {
    const appId = this.configService.getOrThrow<string>('TIKTOK_CLIENT_KEY')
    const secret = this.configService.getOrThrow<string>('TIKTOK_CLIENT_SECRET')
    const appUrl = this.configService.getOrThrow<string>('APP_URL')
    const callbackUrl = `${appUrl}/webhooks/tiktok`

    const response = await fetch(
      'https://business-api.tiktok.com/open_api/v1.3/business/webhook/update/',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: appId,
          secret,
          event_type: eventType,
          callback_url: callbackUrl,
        }),
      },
    )

    const body = await response.json()
    this.logger.log(`[TikTok Webhook] ${eventType} setup response: ${JSON.stringify(body)}`)

    if ((body as { code?: number }).code !== 0) {
      throw new BadRequestException(
        `TikTok ${eventType} webhook setup failed: ${(body as { message?: string }).message}`,
      )
    }

    return body
  }

  // ─── TikTok: List webhooks ───

  async listTikTokWebhooks() {
    const appId = this.configService.getOrThrow<string>('TIKTOK_CLIENT_KEY')
    const secret = this.configService.getOrThrow<string>('TIKTOK_CLIENT_SECRET')

    const bodies = await Promise.all(
      ['COMMENT', 'DIRECT_MESSAGE'].map((eventType) => {
        const params = new URLSearchParams({
          app_id: appId,
          secret,
          event_type: eventType,
        })
        return fetch(
          `https://business-api.tiktok.com/open_api/v1.3/business/webhook/list/?${params}`,
        ).then((res) => res.json().then((body) => ({ eventType, body })))
      }),
    )

    bodies.forEach(({ eventType, body }) => {
      this.logger.log(`[TikTok Webhook] ${eventType} list response: ${JSON.stringify(body)}`)
      if ((body as { code?: number }).code !== 0) {
        this.logger.error(
          `[TikTok Webhook] Failed to list ${eventType} webhooks: ${(body as { message?: string }).message}`,
        )
      }
    })

    return bodies
  }

  // ─── TikTok: Delete webhook (COMMENT) ───

  async deleteTikTokWebhook() {
    const appId = this.configService.getOrThrow<string>('TIKTOK_CLIENT_KEY')
    const secret = this.configService.getOrThrow<string>('TIKTOK_CLIENT_SECRET')

    const bodies = await Promise.all(
      ['COMMENT', 'DIRECT_MESSAGE'].map((eventType) =>
        fetch('https://business-api.tiktok.com/open_api/v1.3/business/webhook/delete/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            app_id: appId,
            secret,
            event_type: eventType,
          }),
        }).then((res) => res.json().then((body) => ({ eventType, body }))),
      ),
    )

    bodies.forEach(({ eventType, body }) => {
      this.logger.log(`[TikTok Webhook] ${eventType} delete response: ${JSON.stringify(body)}`)
      if ((body as { code?: number }).code !== 0) {
        this.logger.error(
          `[TikTok Webhook] Failed to delete ${eventType} webhook: ${(body as { message?: string }).message}`,
        )
      }
    })

    return bodies
  }
}
