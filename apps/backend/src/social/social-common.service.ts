import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from 'generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from '../auth/encryption.service'
import { AvatarSyncService } from './avatar-sync.service'
import { FACEBOOK_GRAPH_API_VERSION } from '../common/config/facebook-scopes.config'

interface WhatsAppPhoneInfo {
  id: string
  display_phone_number?: string
  verified_name?: string
}

interface WhatsAppBusinessProfile {
  about?: string
  address?: string
  description?: string
  email?: string
  profile_picture_url?: string
  websites?: string[]
  vertical?: string
  messaging_product?: string
}

@Injectable()
export class SocialCommonService {
  private readonly logger = new Logger(SocialCommonService.name)

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private encryptionService: EncryptionService,
    private avatarSyncService: AvatarSyncService,
  ) {}

  getMetaGraphReadTokens(primaryToken?: string | null): string[] {
    const systemUserToken = this.configService.get<string>('META_SYSTEM_USER')
    return [primaryToken, systemUserToken].filter((token): token is string => Boolean(token))
  }

  /** Human-facing resource name used in error explanations / reconnect prompts. */
  resourceForProvider(provider: string): string {
    switch (provider) {
      case 'FACEBOOK':
        return 'page'
      case 'INSTAGRAM':
        return 'instagram'
      case 'WHATSAPP':
        return 'whatsapp'
      case 'TIKTOK':
        return 'tiktok'
      case 'FACEBOOK_CATALOG':
        return 'catalog'
      default:
        return 'account'
    }
  }

  asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as Record<string, unknown>
  }

  cleanMetaString(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  buildWhatsAppBusinessProfileMetadata(profile: WhatsAppBusinessProfile | null) {
    if (!profile) return null

    const websites = Array.isArray(profile.websites)
      ? profile.websites
          .map((url) => this.cleanMetaString(url))
          .filter((url): url is string => Boolean(url))
      : []

    return {
      about: this.cleanMetaString(profile.about),
      address: this.cleanMetaString(profile.address),
      description: this.cleanMetaString(profile.description),
      email: this.cleanMetaString(profile.email),
      profilePictureUrl: this.cleanMetaString(profile.profile_picture_url),
      websites,
      vertical: this.cleanMetaString(profile.vertical),
      messagingProduct: this.cleanMetaString(profile.messaging_product),
      syncedAt: new Date().toISOString(),
    }
  }

  mergeSocialAccountMetadata(
    existingMetadata: unknown,
    whatsappBusinessProfile: WhatsAppBusinessProfile | null,
  ): Prisma.InputJsonValue | undefined {
    const normalizedProfile = this.buildWhatsAppBusinessProfileMetadata(whatsappBusinessProfile)
    if (!normalizedProfile) return undefined

    const existing = this.asRecord(existingMetadata)
    const existingWhatsApp = this.asRecord(existing.whatsapp)

    return {
      ...existing,
      whatsapp: {
        ...existingWhatsApp,
        businessProfile: normalizedProfile,
      },
    }
  }

  hasWhatsAppBusinessProfileMetadata(metadata: unknown): boolean {
    const root = this.asRecord(metadata)
    const whatsapp = this.asRecord(root.whatsapp)
    const businessProfile = this.asRecord(whatsapp.businessProfile)
    return Object.keys(businessProfile).length > 0
  }

  async metaGraphGet<T>(
    path: string,
    params: Record<string, string>,
    tokens: string[],
  ): Promise<T | null> {
    for (const token of tokens) {
      const url = new URL(`https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${path}`)
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value)
      }

      try {
        const response = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (response.ok) return (await response.json()) as T
      } catch {
        // Try the next token when Meta or the network rejects this read.
      }
    }

    return null
  }

  // ─── Webhook subscriptions ───

  async subscribePageToWebhook(pageId: string, pageAccessToken: string) {
    try {
      const response = await fetch(
        `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${pageId}/subscribed_apps?subscribed_fields=feed,messages&access_token=${pageAccessToken}`,
        { method: 'POST' },
      )

      if (!response.ok) {
        const error = await response.text()
        this.logger.error(`[Facebook Webhook] Failed to subscribe page ${pageId}: ${error}`)
        return
      }

      this.logger.log(`[Facebook Webhook] Subscribed page ${pageId}`)
    } catch (error) {
      this.logger.error(`[Facebook Webhook] Error subscribing page ${pageId}:`, error)
    }
  }

  /**
   * Subscribe our app to a WhatsApp Business Account's webhooks.
   *
   * Required for Meta to deliver ANY webhook (messages, smb_message_echoes,
   * history, …) for the WABA — the App-level webhook *fields* config only
   * decides which event types are sent once a WABA is subscribed. We don't pass
   * `subscribed_fields`: the app inherits the fields enabled in the App
   * Dashboard. Non-blocking (logs on failure) like the Facebook page variant.
   */
  async subscribeWabaToWebhook(wabaId: string, accessToken: string) {
    try {
      const response = await fetch(
        `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${wabaId}/subscribed_apps?access_token=${accessToken}`,
        { method: 'POST' },
      )

      if (!response.ok) {
        const error = await response.text()
        this.logger.error(`[WhatsApp Webhook] Failed to subscribe WABA ${wabaId}: ${error}`)
        return
      }

      this.logger.log(`[WhatsApp Webhook] Subscribed WABA ${wabaId}`)
    } catch (error) {
      this.logger.error(`[WhatsApp Webhook] Error subscribing WABA ${wabaId}:`, error)
    }
  }

  // ─── WhatsApp profile backfill ───

  needsWhatsAppProfileBackfill(account: {
    provider: string
    providerAccountId: string
    wabaId?: string | null
    pageName?: string | null
    pageAbout?: string | null
    username?: string | null
    profilePictureUrl?: string | null
    metadata?: unknown
  }) {
    if (account.provider !== 'WHATSAPP') return false

    const hasFallbackName =
      !account.pageName ||
      account.pageName === account.providerAccountId ||
      account.pageName === account.wabaId

    return (
      hasFallbackName ||
      !account.username ||
      !account.profilePictureUrl ||
      !this.hasWhatsAppBusinessProfileMetadata(account.metadata)
    )
  }

  async backfillWhatsAppProfile(socialAccountId: string): Promise<boolean> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: {
        id: true,
        organisationId: true,
        provider: true,
        providerAccountId: true,
        wabaId: true,
        pageName: true,
        pageAbout: true,
        username: true,
        profilePictureUrl: true,
        metadata: true,
        accessToken: true,
      },
    })

    if (!account || account.provider !== 'WHATSAPP') return false

    let accountAccessToken: string | null = null
    try {
      accountAccessToken = await this.encryptionService.decrypt(account.accessToken)
    } catch {
      this.logger.warn(`[WhatsApp] Could not decrypt token for profile backfill ${account.id}`)
    }

    const readTokens = this.getMetaGraphReadTokens(accountAccessToken)
    if (readTokens.length === 0) return false

    let phoneId = account.providerAccountId
    let phoneInfo: WhatsAppPhoneInfo | null = null
    let wabaName: string | null = null

    if (account.wabaId) {
      const wabaInfo = await this.metaGraphGet<{ id: string; name?: string }>(
        account.wabaId,
        { fields: 'name' },
        readTokens,
      )
      wabaName = wabaInfo?.name || null

      const phonesData = await this.metaGraphGet<{ data?: WhatsAppPhoneInfo[] }>(
        `${account.wabaId}/phone_numbers`,
        { fields: 'id,display_phone_number,verified_name' },
        readTokens,
      )
      const phones = phonesData?.data ?? []
      const matchedPhone =
        phones.find((phone) => phone.id === account.providerAccountId) || phones[0]
      if (matchedPhone) {
        phoneId = matchedPhone.id
        phoneInfo = matchedPhone
      }
    }

    if (!phoneInfo?.display_phone_number || !phoneInfo?.verified_name) {
      const fetchedPhoneInfo = await this.metaGraphGet<WhatsAppPhoneInfo>(
        phoneId,
        { fields: 'display_phone_number,verified_name' },
        readTokens,
      )
      phoneInfo = { ...(phoneInfo ?? { id: phoneId }), ...(fetchedPhoneInfo ?? {}), id: phoneId }
    }

    const profileData = await this.metaGraphGet<{ data?: WhatsAppBusinessProfile[] }>(
      `${phoneId}/whatsapp_business_profile`,
      {
        fields:
          'about,address,description,email,profile_picture_url,websites,vertical,messaging_product',
      },
      readTokens,
    )
    const businessProfile = profileData?.data?.[0] || null

    const displayName =
      phoneInfo?.verified_name || wabaName || phoneInfo?.display_phone_number || account.pageName
    const displayPhone = phoneInfo?.display_phone_number || account.username
    const profilePictureUrl = businessProfile?.profile_picture_url || account.profilePictureUrl
    const metadata = this.mergeSocialAccountMetadata(account.metadata, businessProfile)
    const pageAbout =
      this.cleanMetaString(businessProfile?.description) ||
      this.cleanMetaString(businessProfile?.about)

    const data: {
      providerAccountId?: string
      pageName?: string | null
      pageAbout?: string | null
      username?: string | null
      profilePictureUrl?: string | null
      metadata?: Prisma.InputJsonValue
    } = {}
    if (phoneId !== account.providerAccountId) data.providerAccountId = phoneId
    if (displayName && displayName !== account.pageName) data.pageName = displayName
    if (pageAbout && pageAbout !== account.pageAbout) data.pageAbout = pageAbout
    if (displayPhone && displayPhone !== account.username) data.username = displayPhone
    if (profilePictureUrl && profilePictureUrl !== account.profilePictureUrl) {
      data.profilePictureUrl = profilePictureUrl
    }
    if (metadata) data.metadata = metadata

    if (Object.keys(data).length === 0) return false

    const existingPhoneAccount =
      data.providerAccountId && data.providerAccountId !== account.providerAccountId
        ? await this.prisma.socialAccount.findUnique({
            where: {
              provider_providerAccountId: {
                provider: 'WHATSAPP',
                providerAccountId: data.providerAccountId,
              },
            },
            select: { id: true, organisationId: true },
          })
        : null

    if (existingPhoneAccount && existingPhoneAccount.id !== account.id) {
      if (existingPhoneAccount.organisationId !== account.organisationId) {
        this.logger.warn(
          `[WhatsApp] Cannot backfill ${account.id}: phone ${data.providerAccountId} already belongs to another org`,
        )
        return false
      }

      const { providerAccountId: _providerAccountId, ...existingAccountData } = data
      await this.prisma.socialAccount.update({
        where: { id: existingPhoneAccount.id },
        data: existingAccountData,
      })
      if (existingAccountData.profilePictureUrl) {
        await this.avatarSyncService.enqueue(existingPhoneAccount.id)
      }
      return true
    }

    await this.prisma.socialAccount.update({
      where: { id: account.id },
      data,
    })
    if (data.profilePictureUrl) {
      await this.avatarSyncService.enqueue(account.id)
    }
    this.logger.log(`[WhatsApp] Backfilled profile for ${account.id} (phone=${phoneId})`)
    return true
  }

  // ─── Get decrypted access token ───

  async getDecryptedToken(socialAccountId: string): Promise<string> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: { accessToken: true },
    })
    if (!account) throw new NotFoundException('Social account not found')
    return this.encryptionService.decrypt(account.accessToken)
  }

  // ─── Helpers ───

  async assertMembership(userId: string, organisationId: string) {
    const membership = await this.prisma.organisationMember.findUnique({
      where: { userId_organisationId: { userId, organisationId } },
    })

    if (!membership) {
      throw new ForbiddenException("Vous n'êtes pas membre de cette organisation")
    }
  }

  /** Normalizes Instagram's granted `permissions` (CSV string or array). */
  parseInstagramPermissions(value: unknown, fallback: string[]): string[] {
    if (Array.isArray(value)) return value.map((v) => String(v))
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    }
    return fallback
  }
}
