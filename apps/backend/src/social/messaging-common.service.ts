import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from '../auth/encryption.service'
import { UploadService } from '../upload/upload.service'
import {
  HISTORY_SYNC_WINDOW_DAYS,
  TikTokApiResponse,
  TikTokConversationContent,
  TikTokConversationParticipant,
} from './messaging.types'

/**
 * Low-level helpers shared across the focused messaging sub-services: token
 * decryption/refresh, scope/membership guards, TikTok request plumbing and
 * media download, and history-window helpers.
 */
@Injectable()
export class MessagingCommonService {
  private readonly logger = new Logger(MessagingCommonService.name)

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private encryptionService: EncryptionService,
    private uploadService: UploadService,
  ) {}

  // ─── Helpers ───

  async getDecryptedToken(socialAccountId: string): Promise<string> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: {
        provider: true,
        accessToken: true,
        refreshToken: true,
        tokenExpiresAt: true,
      },
    })
    if (!account) throw new NotFoundException('Social account not found')

    if (account.provider === 'TIKTOK') {
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
        this.logger.error(`[TikTok DM] Token refresh failed: ${await response.text()}`)
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
        where: { id: socialAccountId },
        data: {
          accessToken: encryptedToken,
          refreshToken: encryptedRefresh,
          tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
        },
      })

      return data.access_token
    }

    return this.encryptionService.decrypt(account.accessToken)
  }

  assertScope(scopes: string[], required: string) {
    // WhatsApp uses platform-specific scopes instead of generic 'messages'
    const hasScope =
      scopes.includes(required) ||
      (required === 'messages' &&
        (scopes.includes('whatsapp_business_messaging') ||
          scopes.includes('whatsapp_business_management') ||
          scopes.includes('message.list.read') ||
          scopes.includes('message.list.send') ||
          scopes.includes('message.list.manage')))
    if (!hasScope) {
      throw new BadRequestException(
        `This account does not have the "${required}" scope. Please reconnect with the required permissions.`,
      )
    }
  }

  async assertMembership(userId: string, organisationId: string) {
    const membership = await this.prisma.organisationMember.findUnique({
      where: { userId_organisationId: { userId, organisationId } },
    })
    if (!membership) {
      throw new BadRequestException('Not a member of this organisation')
    }
  }

  /** Cutoff for the rolling history window (now − HISTORY_SYNC_WINDOW_DAYS). */
  historyCutoff(): Date {
    return new Date(Date.now() - HISTORY_SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  }

  isMessagingDisabled(account: { disabled: boolean; featureDisabled: string[] }): boolean {
    return account.disabled || account.featureDisabled.includes('MESSAGE')
  }

  buildTemplateTextParameter(name: string, text: string) {
    const parameter: Record<string, string> = { type: 'text', text }
    if (!/^\d+$/.test(name)) {
      parameter.parameter_name = name
    }
    return parameter
  }

  parseTikTokTimestamp(timestamp?: string | number | null): Date {
    const value = Number(timestamp)
    if (!Number.isFinite(value) || value <= 0) return new Date()
    return new Date(value > 1_000_000_000_000 ? value : value * 1000)
  }

  isTikTokBusinessRole(role?: string) {
    return role?.toUpperCase() === 'BUSINESS_ACCOUNT'
  }

  isTikTokPersonalRole(role?: string) {
    return role?.toUpperCase() === 'PERSONAL_ACCOUNT'
  }

  getTikTokMessageDisplayText(msg?: {
    message_type?: string
    text?: { body?: string }
    share_post?: { item_id?: string; embed_url?: string }
    template?: { title?: string }
  }): string {
    if (!msg) return ''
    if (msg.message_type === 'TEXT') return msg.text?.body || ''
    if (msg.message_type === 'IMAGE') return '[image]'
    if (msg.message_type === 'VIDEO') return '[video]'
    if (msg.message_type === 'SHARE_POST') return msg.share_post?.embed_url || '[tiktok post]'
    if (msg.message_type === 'TEMPLATE') return msg.template?.title || '[template]'
    return `[${(msg.message_type || 'message').toLowerCase()}]`
  }

  findTikTokConversationParticipant(
    participants: TikTokConversationParticipant[],
    participantId?: string,
  ) {
    return (
      (participantId ? participants.find((entry) => entry.id === participantId) : undefined) ||
      participants.find((entry) => this.isTikTokPersonalRole(entry.role))
    )
  }

  async fetchTikTokConversationContent(
    businessId: string,
    accessToken: string,
    conversationId: string,
    operation: string,
  ) {
    const url = new URL(
      'https://business-api.tiktok.com/open_api/v1.3/business/message/content/list/',
    )
    url.searchParams.set('business_id', businessId)
    url.searchParams.set('conversation_id', conversationId)

    const response = await fetch(url.toString(), {
      headers: { 'Access-Token': accessToken },
    })
    return this.readTikTokResponse<TikTokConversationContent>(response, operation)
  }

  async downloadTikTokMedia(
    businessId: string,
    accessToken: string,
    conversationId: string,
    messageId: string,
    mediaId: string,
    mediaType: 'IMAGE' | 'VIDEO',
  ): Promise<{ url: string | null; fileName: string; fileSize: number } | null> {
    const body = {
      business_id: businessId,
      conversation_id: conversationId,
      message_id: messageId,
      media_id: mediaId,
      media_type: mediaType,
    }
    const response = await fetch(
      'https://business-api.tiktok.com/open_api/v1.3/business/message/media/download/',
      {
        method: 'POST',
        headers: {
          'Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    )
    const data = await this.readTikTokResponse<{ download_url?: string }>(
      response,
      'download media',
      body,
    )
    if (!data.data?.download_url) return null

    const mediaResponse = await fetch(data.data.download_url, {
      headers: { 'x-user': accessToken },
    })
    if (!mediaResponse.ok) {
      this.logger.warn(`[TikTok DM] Media download failed (${mediaResponse.status}) for ${mediaId}`)
      return null
    }

    const contentType =
      mediaResponse.headers.get('content-type') ||
      (mediaType === 'IMAGE' ? 'image/jpeg' : 'video/mp4')
    const buffer = Buffer.from(await mediaResponse.arrayBuffer())
    const fileName = `tiktok-${mediaType.toLowerCase()}`
    const uploadedUrl = await this.uploadService.uploadBuffer(
      buffer,
      fileName,
      contentType,
      'chat-media',
    )

    return { url: uploadedUrl, fileName, fileSize: buffer.length }
  }

  async readTikTokResponse<T>(
    response: Response,
    operation: string,
    payload?: unknown,
  ): Promise<TikTokApiResponse<T>> {
    const raw = await response.text()
    let data: TikTokApiResponse<T>
    try {
      data = JSON.parse(raw) as TikTokApiResponse<T>
    } catch {
      this.logger.error(`[TikTok DM] ${operation} returned invalid JSON: ${raw}`)
      throw new BadRequestException(`TikTok ${operation} failed`)
    }

    if (!response.ok || data.code !== 0) {
      this.logger.error(
        `[TikTok DM] ${operation} failed (${response.status})\n` +
          `  Payload: ${payload ? JSON.stringify(payload) : '-'}\n` +
          `  Response: ${raw}`,
      )

      throw new BadRequestException(`TikTok ${operation} failed: ${data.message || raw}`)
    }

    return data
  }
}
