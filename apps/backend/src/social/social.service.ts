import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from 'generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from '../auth/encryption.service'
import { UploadService } from '../upload/upload.service'
import { FACEBOOK_GRAPH_API_VERSION } from '../common/config/facebook-scopes.config'
import { AvatarSyncService } from './avatar-sync.service'

interface FacebookPage {
  id: string
  name: string
  access_token: string
  picture?: { data?: { url?: string } }
}

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
export class SocialService {
  private readonly logger = new Logger(SocialService.name)

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private encryptionService: EncryptionService,
    private avatarSyncService: AvatarSyncService,
    private uploadService: UploadService,
  ) {}

  private getMetaGraphReadTokens(primaryToken?: string | null): string[] {
    const systemUserToken = this.configService.get<string>('META_SYSTEM_USER')
    return [primaryToken, systemUserToken].filter((token): token is string => Boolean(token))
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as Record<string, unknown>
  }

  private cleanMetaString(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  private buildWhatsAppBusinessProfileMetadata(profile: WhatsAppBusinessProfile | null) {
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

  private mergeSocialAccountMetadata(
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

  private hasWhatsAppBusinessProfileMetadata(metadata: unknown): boolean {
    const root = this.asRecord(metadata)
    const whatsapp = this.asRecord(root.whatsapp)
    const businessProfile = this.asRecord(whatsapp.businessProfile)
    return Object.keys(businessProfile).length > 0
  }

  private async metaGraphGet<T>(
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

  // ─── Connect Facebook Pages ───

  async connectFacebookPages(
    userId: string,
    organisationId: string,
    code: string,
    redirectUri: string,
    scopes?: string[],
  ) {
    this.logger.log(
      `[Facebook] connectFacebookPages called — userId=${userId}, orgId=${organisationId}, redirectUri=${redirectUri}, code=${code.substring(0, 15)}...`,
    )
    await this.assertMembership(userId, organisationId)

    const appId = this.configService.getOrThrow<string>('FACEBOOK_APP_ID')
    const appSecret = this.configService.getOrThrow<string>('FACEBOOK_APP_SECRET')

    // Exchange code for user access token
    const tokenUrl = new URL(
      `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/oauth/access_token`,
    )
    tokenUrl.searchParams.set('client_id', appId)
    tokenUrl.searchParams.set('client_secret', appSecret)
    tokenUrl.searchParams.set('redirect_uri', redirectUri)
    tokenUrl.searchParams.set('code', code)

    this.logger.log(`[Facebook] Exchanging code for access token...`)
    const tokenResponse = await fetch(tokenUrl.toString())
    const tokenBody = await tokenResponse.text()

    if (!tokenResponse.ok) {
      this.logger.error(
        `[Facebook] Token exchange failed (HTTP ${tokenResponse.status}): ${tokenBody}`,
      )
      throw new BadRequestException('token_exchange_failed')
    }

    const { access_token: userAccessToken } = JSON.parse(tokenBody) as { access_token: string }
    this.logger.log(`[Facebook] Token exchange OK — fetching /me/accounts...`)

    // Fetch user's pages
    const pagesUrl = new URL(`https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/me/accounts`)
    pagesUrl.searchParams.set('access_token', userAccessToken)
    pagesUrl.searchParams.set('fields', 'id,name,access_token,picture{url}')

    const pagesResponse = await fetch(pagesUrl.toString())
    const pagesBody = await pagesResponse.text()

    if (!pagesResponse.ok) {
      this.logger.error(
        `[Facebook] Failed to fetch pages (HTTP ${pagesResponse.status}): ${pagesBody}`,
      )
      throw new BadRequestException('Failed to fetch Facebook pages')
    }

    const { data: pages } = JSON.parse(pagesBody) as { data: FacebookPage[] }
    this.logger.log(
      `[Facebook] Found ${pages?.length || 0} pages: ${JSON.stringify(pages, null, 2)}`,
    )

    if (!pages?.length) {
      throw new BadRequestException('No Facebook pages found for this account')
    }

    // Save each page and subscribe to webhook
    const savedPages = []
    const newScopes = scopes ?? []
    for (const page of pages) {
      this.logger.log(`[Facebook] Saving page "${page.name}" (${page.id})...`)
      const encryptedToken = await this.encryptionService.encrypt(page.access_token)
      const pictureUrl = page.picture?.data?.url || null

      // Fetch existing scopes to merge
      const existing = await this.prisma.socialAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: 'FACEBOOK',
            providerAccountId: page.id,
          },
        },
        select: { scopes: true },
      })
      const mergedScopes = [...new Set([...(existing?.scopes ?? []), ...newScopes])]

      const socialAccount = await this.prisma.socialAccount.upsert({
        where: {
          provider_providerAccountId: {
            provider: 'FACEBOOK',
            providerAccountId: page.id,
          },
        },
        create: {
          organisationId,
          provider: 'FACEBOOK',
          providerAccountId: page.id,
          pageName: page.name,
          profilePictureUrl: pictureUrl,
          accessToken: encryptedToken,
          scopes: mergedScopes,
        },
        update: {
          pageName: page.name,
          profilePictureUrl: pictureUrl,
          accessToken: encryptedToken,
          scopes: mergedScopes,
        },
      })

      // Create default settings if they don't exist
      await this.prisma.pageSettings.upsert({
        where: { socialAccountId: socialAccount.id },
        create: { socialAccountId: socialAccount.id },
        update: {},
      })

      // Subscribe page to webhook
      await this.subscribePageToWebhook(page.id, page.access_token)

      // Mirror the (often temporary) Meta avatar URL to our own MinIO bucket
      // in the background so we don't lose the image when the URL expires.
      await this.avatarSyncService.enqueue(socialAccount.id)

      savedPages.push(socialAccount)
    }

    this.logger.log(`[Facebook] ✅ Connected ${savedPages.length} pages for org ${organisationId}`)
    return savedPages
  }

  // ─── Connect Facebook Catalogs ───

  async connectFacebookCatalog(
    userId: string,
    organisationId: string,
    code: string,
    redirectUri: string,
    scopes?: string[],
  ) {
    this.logger.log(
      `[Facebook] connectFacebookCatalog called — userId=${userId}, orgId=${organisationId}`,
    )
    await this.assertMembership(userId, organisationId)

    const appId = this.configService.getOrThrow<string>('FACEBOOK_APP_ID')
    const appSecret = this.configService.getOrThrow<string>('FACEBOOK_APP_SECRET')

    // Exchange code for user access token
    const tokenUrl = new URL(
      `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/oauth/access_token`,
    )
    tokenUrl.searchParams.set('client_id', appId)
    tokenUrl.searchParams.set('client_secret', appSecret)
    tokenUrl.searchParams.set('redirect_uri', redirectUri)
    tokenUrl.searchParams.set('code', code)

    this.logger.log(`[Facebook Catalog] Exchanging code for access token...`)
    const tokenResponse = await fetch(tokenUrl.toString())
    const tokenBody = await tokenResponse.text()

    if (!tokenResponse.ok) {
      this.logger.error(
        `[Facebook Catalog] Token exchange failed (HTTP ${tokenResponse.status}): ${tokenBody}`,
      )
      throw new BadRequestException('token_exchange_failed')
    }

    const { access_token: userAccessToken } = JSON.parse(tokenBody) as { access_token: string }
    this.logger.log(`[Facebook Catalog] Token exchange OK — fetching assigned catalogs...`)

    // Fetch catalogs assigned to the user (works with catalog_management scope, no business_management needed)
    const catalogsUrl = new URL(
      `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/me/assigned_product_catalogs`,
    )
    catalogsUrl.searchParams.set('access_token', userAccessToken)
    catalogsUrl.searchParams.set('fields', 'id,name,product_count,vertical')

    const catalogsResponse = await fetch(catalogsUrl.toString())
    const catalogsBody = await catalogsResponse.text()

    if (!catalogsResponse.ok) {
      this.logger.error(
        `[Facebook Catalog] /me/assigned_product_catalogs failed (${catalogsResponse.status}): ${catalogsBody}`,
      )
      throw new BadRequestException('Failed to fetch catalogs from Meta')
    }

    const { data: metaCatalogs } = JSON.parse(catalogsBody) as {
      data: { id: string; name: string; product_count?: number; vertical?: string }[]
    }
    this.logger.log(`[Facebook Catalog] Found ${metaCatalogs?.length || 0} assigned catalogs`)

    if (!metaCatalogs?.length) {
      throw new BadRequestException('No product catalogs found for this account')
    }

    // Save a SocialAccount with the user token (needed for product listing proxy)
    const encryptedToken = await this.encryptionService.encrypt(userAccessToken)
    const socialAccount = await this.prisma.socialAccount.upsert({
      where: {
        provider_providerAccountId: {
          provider: 'FACEBOOK_CATALOG',
          providerAccountId: `catalog_${organisationId}`,
        },
      },
      create: {
        organisationId,
        provider: 'FACEBOOK_CATALOG',
        providerAccountId: `catalog_${organisationId}`,
        pageName: 'Catalog',
        accessToken: encryptedToken,
        scopes: scopes ?? ['catalog_management'],
      },
      update: {
        accessToken: encryptedToken,
        pageName: 'Catalog',
        scopes: scopes ?? ['catalog_management'],
      },
    })

    // Save each catalog in our DB
    const savedCatalogs = []
    for (const metaCatalog of metaCatalogs) {
      let catalog = await this.prisma.catalog.findFirst({
        where: { organisationId, providerId: metaCatalog.id },
      })

      if (catalog) {
        catalog = await this.prisma.catalog.update({
          where: { id: catalog.id },
          data: {
            name: metaCatalog.name,
            productCount: metaCatalog.product_count ?? 0,
          },
        })
      } else {
        catalog = await this.prisma.catalog.create({
          data: {
            organisationId,
            name: metaCatalog.name,
            providerId: metaCatalog.id,
            productCount: metaCatalog.product_count ?? 0,
          },
        })
      }

      // Link catalog to social account
      await this.prisma.catalogSocialAccount.upsert({
        where: {
          catalogId_socialAccountId: {
            catalogId: catalog.id,
            socialAccountId: socialAccount.id,
          },
        },
        create: {
          catalogId: catalog.id,
          socialAccountId: socialAccount.id,
        },
        update: {},
      })

      savedCatalogs.push(catalog)
    }

    this.logger.log(
      `[Facebook Catalog] ✅ Connected ${savedCatalogs.length} catalogs for org ${organisationId}`,
    )
    return savedCatalogs
  }

  // ─── Connect Instagram Account ───

  async connectInstagramAccount(
    userId: string,
    organisationId: string,
    code: string,
    redirectUri: string,
    scopes?: string[],
  ) {
    this.logger.log(
      `[Instagram] connectInstagramAccount called — userId=${userId}, orgId=${organisationId}, redirectUri=${redirectUri}, code=${code.substring(0, 15)}...`,
    )
    await this.assertMembership(userId, organisationId)

    const appId = this.configService.getOrThrow<string>('INSTAGRAM_APP_ID')
    const appSecret = this.configService.getOrThrow<string>('INSTAGRAM_APP_SECRET')

    // Exchange code for short-lived token
    this.logger.log(`[Instagram] Exchanging code for short-lived token...`)
    const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      }),
    })

    const tokenBody = await tokenResponse.text()
    if (!tokenResponse.ok) {
      this.logger.error(
        `[Instagram] Token exchange failed (HTTP ${tokenResponse.status}): ${tokenBody}`,
      )
      throw new BadRequestException('token_exchange_failed')
    }

    const tokenData = JSON.parse(tokenBody)
    this.logger.log(
      `[Instagram] Token exchange response: ${JSON.stringify({ ...tokenData, access_token: '***' }, null, 2)}`,
    )
    const { access_token: shortLivedToken, user_id } = tokenData as {
      access_token: string
      user_id: number
    }
    this.logger.log(`[Instagram] Short-lived token OK — user_id=${user_id}`)

    // Exchange for long-lived token
    let accessToken = shortLivedToken
    this.logger.log(`[Instagram] Exchanging for long-lived token...`)
    const longLivedUrl = new URL('https://graph.instagram.com/access_token')
    longLivedUrl.searchParams.set('grant_type', 'ig_exchange_token')
    longLivedUrl.searchParams.set('client_secret', appSecret)
    longLivedUrl.searchParams.set('access_token', shortLivedToken)

    const longLivedResponse = await fetch(longLivedUrl.toString())
    if (longLivedResponse.ok) {
      const data: { access_token: string } = await longLivedResponse.json()
      accessToken = data.access_token
      this.logger.log(`[Instagram] Long-lived token OK`)
    } else {
      const llError = await longLivedResponse.text()
      this.logger.warn(
        `[Instagram] Long-lived token exchange failed (HTTP ${longLivedResponse.status}), using short-lived: ${llError}`,
      )
    }

    // Fetch Instagram profile — user_id is the Instagram Professional Account ID used in webhooks
    this.logger.log(`[Instagram] Fetching /me profile...`)
    const meUrl = new URL('https://graph.instagram.com/me')
    meUrl.searchParams.set('fields', 'id,user_id,username,profile_picture_url,name')
    meUrl.searchParams.set('access_token', accessToken)

    const meResponse = await fetch(meUrl.toString())
    const meBody = await meResponse.text()
    if (!meResponse.ok) {
      this.logger.error(`[Instagram] Profile fetch failed (HTTP ${meResponse.status}): ${meBody}`)
      throw new BadRequestException('Failed to fetch Instagram profile')
    }

    const profileRaw = JSON.parse(meBody) as {
      id: string
      user_id: number
      username?: string
      name?: string
      profile_picture_url?: string
    }
    this.logger.log(`[Instagram] Profile response: ${JSON.stringify(profileRaw, null, 2)}`)

    // user_id is the Instagram Professional Account ID (matches webhook entry.id)
    // id is the app-scoped Facebook user ID (different!)
    const igAccountId = profileRaw.user_id.toString()
    const encryptedToken = await this.encryptionService.encrypt(accessToken)
    const newScopes = scopes ?? []

    // Fetch existing scopes to merge
    const existing = await this.prisma.socialAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'INSTAGRAM',
          providerAccountId: igAccountId,
        },
      },
      select: { scopes: true },
    })
    const mergedScopes = [...new Set([...(existing?.scopes ?? []), ...newScopes])]

    const socialAccount = await this.prisma.socialAccount.upsert({
      where: {
        provider_providerAccountId: {
          provider: 'INSTAGRAM',
          providerAccountId: igAccountId,
        },
      },
      create: {
        organisationId,
        provider: 'INSTAGRAM',
        providerAccountId: igAccountId,
        pageName: profileRaw.name || profileRaw.username,
        username: profileRaw.username,
        profilePictureUrl: profileRaw.profile_picture_url || null,
        accessToken: encryptedToken,
        scopes: mergedScopes,
      },
      update: {
        pageName: profileRaw.name || profileRaw.username,
        username: profileRaw.username,
        profilePictureUrl: profileRaw.profile_picture_url || null,
        accessToken: encryptedToken,
        scopes: mergedScopes,
      },
    })

    // Create default settings
    await this.prisma.pageSettings.upsert({
      where: { socialAccountId: socialAccount.id },
      create: { socialAccountId: socialAccount.id },
      update: {},
    })

    // Instagram webhooks are configured at the app level in the Meta App Dashboard.
    // No per-account subscription is needed (unlike Facebook Pages).
    this.logger.log(`[Instagram] Webhook subscription is app-level — no per-account call needed`)

    await this.avatarSyncService.enqueue(socialAccount.id)

    this.logger.log(
      `[Instagram] ✅ Connected account "${profileRaw.username}" (${socialAccount.id}) for org ${organisationId}`,
    )
    return socialAccount
  }

  // ─── Check TikTok Business Account ───

  async checkTikTokBusinessAccount(userId: string, accountId: string) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        provider: true,
        providerAccountId: true,
        organisationId: true,
        accessToken: true,
        refreshToken: true,
        tokenExpiresAt: true,
      },
    })

    if (!account || account.provider !== 'TIKTOK') {
      throw new NotFoundException('TikTok account not found')
    }

    await this.assertMembership(userId, account.organisationId)

    const accessToken = await this.getTikTokAccessToken(account)

    // Check Business account access via /business/get/
    const bizCheckRes = await fetch(
      `https://business-api.tiktok.com/open_api/v1.3/business/get/?business_id=${encodeURIComponent(account.providerAccountId || '')}&fields=${encodeURIComponent(JSON.stringify(['display_name']))}`,
      {
        headers: { 'Access-Token': accessToken },
      },
    )
    const bizCheckRaw = await bizCheckRes.text()
    this.logger.log(`[TikTok] check-business business/get response: ${bizCheckRaw}`)

    let bizCheckData: { code?: number } = {}
    try {
      bizCheckData = JSON.parse(bizCheckRaw)
    } catch {
      // non-JSON response means not a valid business account
    }

    // If the Business API returns code 0, the account has Business access
    const isBusiness = bizCheckData.code === 0
    return { isBusiness }
  }

  // ─── Connect TikTok Account ───

  async connectTikTokAccount(
    userId: string,
    organisationId: string,
    code: string,
    redirectUri: string,
    scopes?: string[],
  ) {
    this.logger.log(
      `[TikTok] connectTikTokAccount called — userId=${userId}, orgId=${organisationId}`,
    )
    await this.assertMembership(userId, organisationId)

    const clientKey = this.configService.getOrThrow<string>('TIKTOK_CLIENT_KEY')
    const clientSecret = this.configService.getOrThrow<string>('TIKTOK_CLIENT_SECRET')

    // Exchange code for access token via Login Kit
    this.logger.log(`[TikTok] Exchanging code for access token...`)
    const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    })

    const tokenBody = await tokenResponse.text()
    if (!tokenResponse.ok) {
      this.logger.error(
        `[TikTok] Token exchange failed (HTTP ${tokenResponse.status}): ${tokenBody}`,
      )
      throw new BadRequestException('tiktok_token_exchange_failed')
    }

    this.logger.log(`[TikTok] Token exchange raw response: ${tokenBody}`)

    const tokenPayload = JSON.parse(tokenBody) as {
      access_token?: string
      refresh_token?: string
      open_id?: string
      expires_in?: number
      data?: {
        access_token?: string
        refresh_token?: string
        open_id?: string
        expires_in?: number
      }
    }
    // Handle both flat and nested (data-wrapped) response formats
    const tokenData = {
      access_token: tokenPayload.access_token ?? tokenPayload.data?.access_token ?? '',
      refresh_token: tokenPayload.refresh_token ?? tokenPayload.data?.refresh_token,
      open_id: tokenPayload.open_id ?? tokenPayload.data?.open_id ?? '',
      expires_in: tokenPayload.expires_in ?? tokenPayload.data?.expires_in ?? 86400,
    }

    if (!tokenData.access_token || !tokenData.open_id) {
      this.logger.error(`[TikTok] Token exchange missing access_token or open_id`)
      throw new BadRequestException('tiktok_token_exchange_failed')
    }

    this.logger.log(`[TikTok] Token exchange OK — open_id=${tokenData.open_id}`)

    // Fetch the business_id from the Business API — this is the ID used by
    // webhooks (user_openid) and all /business/* endpoints. It differs from
    // the Login Kit open_id.
    let businessId = tokenData.open_id
    const tokenInfoRes = await fetch(
      'https://business-api.tiktok.com/open_api/v1.3/tt_user/token_info/get/',
      {
        method: 'POST',
        headers: {
          'Access-Token': tokenData.access_token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ app_id: clientKey, access_token: tokenData.access_token }),
      },
    )
    if (tokenInfoRes.ok) {
      const tokenInfoBody = await tokenInfoRes.text()
      this.logger.log(`[TikTok] Token info raw response: ${tokenInfoBody}`)
      const tokenInfo = JSON.parse(tokenInfoBody) as {
        code?: number
        data?: { business_id?: string; open_id?: string; creator_id?: string }
      }

      const bid =
        tokenInfo.data?.business_id ?? tokenInfo.data?.open_id ?? tokenInfo.data?.creator_id
      if (tokenInfo.code === 0 && bid) {
        businessId = bid
        this.logger.log(`[TikTok] Resolved business_id=${businessId}`)
      }

      // Verify Business account access via /business/get/
      if (businessId) {
        const bizCheckRes = await fetch(
          `https://business-api.tiktok.com/open_api/v1.3/business/get/?business_id=${encodeURIComponent(businessId)}&fields=${encodeURIComponent(JSON.stringify(['display_name']))}`,
          { headers: { 'Access-Token': tokenData.access_token } },
        )
        const bizCheckRaw = await bizCheckRes.text()
        let bizCheckData: { code?: number } = {}
        try {
          bizCheckData = JSON.parse(bizCheckRaw)
        } catch {
          // non-JSON response
        }
        if (bizCheckData.code !== 0) {
          this.logger.warn(
            `[TikTok] Account is not a Business account (business/get returned code=${bizCheckData.code}). Message API requires a Business account.`,
          )
          throw new BadRequestException('tiktok_not_business_account')
        }
      }
    } else {
      const errBody = await tokenInfoRes.text()
      this.logger.warn(`[TikTok] token_info/get failed (HTTP ${tokenInfoRes.status}): ${errBody}`)

      // Fallback: try /business/get/ with Login Kit open_id as business_id
      const bizRes = await fetch(
        `https://business-api.tiktok.com/open_api/v1.3/business/get/?business_id=${encodeURIComponent(tokenData.open_id)}&fields=${encodeURIComponent(JSON.stringify(['username', 'display_name']))}`,
        { headers: { 'Access-Token': tokenData.access_token } },
      )
      const bizBody = await bizRes.text()
      this.logger.log(`[TikTok] business/get fallback response: ${bizBody}`)
    }

    // Fetch user info via Login Kit
    const userRes = await fetch(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,username',
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      },
    )

    let displayName = businessId
    let username: string | undefined
    let avatarUrl: string | null = null

    if (userRes.ok) {
      const userData = (await userRes.json()) as {
        data: {
          user: {
            open_id: string
            display_name?: string
            avatar_url?: string
            username?: string
          }
        }
      }
      this.logger.log(`[TikTok] User info response: ${JSON.stringify(userData)}`)
      displayName = userData.data.user.display_name || displayName
      username = userData.data.user.username
      avatarUrl = userData.data.user.avatar_url || null
    } else {
      const errorBody = await userRes.text()
      this.logger.error(`[TikTok] User info fetch failed (HTTP ${userRes.status}): ${errorBody}`)
    }

    const encryptedToken = await this.encryptionService.encrypt(tokenData.access_token)
    const encryptedRefresh = tokenData.refresh_token
      ? await this.encryptionService.encrypt(tokenData.refresh_token)
      : null
    const requestedScopes = scopes ?? ['comments']
    const requestedMessaging = requestedScopes.some(
      (scope) => scope === 'messages' || scope.startsWith('message.list.'),
    )
    const newScopes = [
      ...new Set([
        ...requestedScopes,
        ...(requestedMessaging
          ? ['messages', 'message.list.read', 'message.list.send', 'message.list.manage']
          : []),
        'video.list',
      ]),
    ]

    // Fetch existing scopes to merge
    const existingTk = await this.prisma.socialAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'TIKTOK',
          providerAccountId: businessId,
        },
      },
      select: { scopes: true },
    })
    const mergedScopes = [...new Set([...(existingTk?.scopes ?? []), ...newScopes])]

    const socialAccount = await this.prisma.socialAccount.upsert({
      where: {
        provider_providerAccountId: {
          provider: 'TIKTOK',
          providerAccountId: businessId,
        },
      },
      create: {
        organisationId,
        provider: 'TIKTOK',
        providerAccountId: businessId,
        pageName: displayName,
        username,
        profilePictureUrl: avatarUrl,
        accessToken: encryptedToken,
        refreshToken: encryptedRefresh,
        tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        scopes: mergedScopes,
      },
      update: {
        pageName: displayName,
        username,
        profilePictureUrl: avatarUrl,
        accessToken: encryptedToken,
        refreshToken: encryptedRefresh,
        tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        scopes: mergedScopes,
      },
    })

    // Create default settings
    await this.prisma.pageSettings.upsert({
      where: { socialAccountId: socialAccount.id },
      create: { socialAccountId: socialAccount.id },
      update: {},
    })

    await this.avatarSyncService.enqueue(socialAccount.id)

    this.logger.log(
      `[TikTok] ✅ Connected account "${displayName}" (${socialAccount.id}) for org ${organisationId}`,
    )
    return socialAccount
  }

  // ─── Connect WhatsApp Account (Embedded Signup) ───

  async connectWhatsAppAccount(
    userId: string,
    organisationId: string,
    code: string,
    clientWabaId?: string,
    clientPhoneId?: string,
  ) {
    this.logger.log(
      `[WhatsApp] connectWhatsAppAccount called — userId=${userId}, orgId=${organisationId}`,
    )
    await this.assertMembership(userId, organisationId)

    const appId = this.configService.getOrThrow<string>('FACEBOOK_APP_ID')
    const appSecret = this.configService.getOrThrow<string>('FACEBOOK_APP_SECRET')

    // 1. Exchange the code for a user access token
    this.logger.log(`[WhatsApp] Exchanging code for access token...`)
    const tokenResponse = await fetch(
      `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/oauth/access_token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: appId,
          client_secret: appSecret,
          grant_type: 'authorization_code',
          code,
        }),
      },
    )

    const tokenBody = await tokenResponse.text()
    if (!tokenResponse.ok) {
      this.logger.error(
        `[WhatsApp] Token exchange failed (HTTP ${tokenResponse.status}): ${tokenBody}`,
      )
      throw new BadRequestException('whatsapp_token_exchange_failed')
    }

    const { access_token: accessToken } = JSON.parse(tokenBody) as { access_token: string }
    this.logger.log(`[WhatsApp] Token exchange OK`)

    const readTokens = this.getMetaGraphReadTokens(accessToken)
    const graphGet = <T>(path: string, params: Record<string, string>) =>
      this.metaGraphGet<T>(path, params, readTokens)

    // 2. Resolve WABA ID and Phone Number ID
    let wabaId = clientWabaId
    let phoneId = clientPhoneId
    let debugPhoneCandidates: string[] = []

    if (!wabaId || !phoneId) {
      const debugResponse = await fetch(
        `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/debug_token?` +
          new URLSearchParams({
            input_token: accessToken,
            access_token: `${appId}|${appSecret}`,
          }),
      )
      if (debugResponse.ok) {
        const debugData = (await debugResponse.json()) as {
          data?: {
            granular_scopes?: Array<{ scope: string; target_ids?: string[] }>
          }
        }
        const mgmtScope = debugData.data?.granular_scopes?.find(
          (s) => s.scope === 'whatsapp_business_management',
        )
        if (!wabaId && mgmtScope?.target_ids?.length) {
          wabaId = mgmtScope.target_ids[0]
        }
        const msgScope = debugData.data?.granular_scopes?.find(
          (s) => s.scope === 'whatsapp_business_messaging',
        )
        debugPhoneCandidates = msgScope?.target_ids ?? []
        if (!phoneId && !wabaId && debugPhoneCandidates.length) {
          phoneId = debugPhoneCandidates[0]
        }
      }
    }

    let wabaName: string | null = null
    if (wabaId) {
      const wabaInfo = await graphGet<{ id: string; name?: string }>(wabaId, { fields: 'name' })
      wabaName = wabaInfo?.name || null
    }

    // 3. Fetch phone numbers from WABA. debug_token target_ids can contain the WABA ID,
    // so only accept phone IDs that are validated through /{waba}/phone_numbers or /{phone}.
    let phoneInfo: WhatsAppPhoneInfo | null = null
    if (wabaId) {
      const phonesData = await graphGet<{ data?: WhatsAppPhoneInfo[] }>(`${wabaId}/phone_numbers`, {
        fields: 'id,display_phone_number,verified_name',
      })
      const phones = phonesData?.data ?? []
      const matchedPhone =
        (phoneId ? phones.find((phone) => phone.id === phoneId) : undefined) ||
        debugPhoneCandidates
          .map((candidateId) => phones.find((phone) => phone.id === candidateId))
          .find((phone): phone is WhatsAppPhoneInfo => Boolean(phone)) ||
        (!phoneId ? phones[0] : undefined)

      if (matchedPhone) {
        phoneId = matchedPhone.id
        phoneInfo = matchedPhone
      }
    }

    if (!phoneId && debugPhoneCandidates.length) {
      for (const candidateId of debugPhoneCandidates) {
        const candidateInfo = await graphGet<WhatsAppPhoneInfo>(candidateId, {
          fields: 'display_phone_number,verified_name',
        })
        if (
          candidateInfo?.id &&
          (candidateInfo.display_phone_number || candidateInfo.verified_name)
        ) {
          phoneId = candidateInfo.id
          phoneInfo = candidateInfo
          break
        }
      }
    }

    if (!phoneId) {
      throw new BadRequestException('Could not resolve WhatsApp phone number ID. Please try again.')
    }

    // 4. Get phone number display info
    let displayName = phoneId
    let displayPhone: string | null = null
    if (!phoneInfo?.display_phone_number || !phoneInfo?.verified_name) {
      const fetchedPhoneInfo = await graphGet<WhatsAppPhoneInfo>(phoneId, {
        fields: 'display_phone_number,verified_name',
      })
      phoneInfo = { ...(phoneInfo ?? { id: phoneId }), ...(fetchedPhoneInfo ?? {}), id: phoneId }
    }
    displayName = phoneInfo?.verified_name || wabaName || phoneInfo?.display_phone_number || phoneId
    displayPhone = phoneInfo?.display_phone_number || null

    // 5. Fetch WhatsApp Business profile metadata
    let profilePictureUrl: string | null = null
    const profileData = await graphGet<{ data?: WhatsAppBusinessProfile[] }>(
      `${phoneId}/whatsapp_business_profile`,
      {
        fields:
          'about,address,description,email,profile_picture_url,websites,vertical,messaging_product',
      },
    )
    const businessProfile = profileData?.data?.[0] || null
    profilePictureUrl = businessProfile?.profile_picture_url || null
    if (!profileData) {
      this.logger.warn(`[WhatsApp] Could not fetch business profile for ${phoneId}`)
    }

    // 6. Webhook subscription is configured at app level in the Meta Dashboard
    // (same as Instagram — no per-account subscription needed)

    // 7. Save the account
    const encryptedToken = await this.encryptionService.encrypt(accessToken)

    const existingPhoneAccount = await this.prisma.socialAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'WHATSAPP',
          providerAccountId: phoneId,
        },
      },
    })
    const staleWabaAccount =
      wabaId && wabaId !== phoneId
        ? await this.prisma.socialAccount.findUnique({
            where: {
              provider_providerAccountId: {
                provider: 'WHATSAPP',
                providerAccountId: wabaId,
              },
            },
          })
        : null

    const existingMetadata = existingPhoneAccount?.metadata ?? staleWabaAccount?.metadata ?? null
    const metadata = this.mergeSocialAccountMetadata(existingMetadata, businessProfile)
    const pageAbout =
      this.cleanMetaString(businessProfile?.description) ||
      this.cleanMetaString(businessProfile?.about)
    const finalProfilePictureUrl =
      profilePictureUrl ||
      existingPhoneAccount?.profilePictureUrl ||
      staleWabaAccount?.profilePictureUrl ||
      null

    const accountData = {
      wabaId: wabaId || null,
      pageName: displayName,
      ...(pageAbout ? { pageAbout } : {}),
      username: displayPhone,
      profilePictureUrl: finalProfilePictureUrl,
      ...(metadata ? { metadata } : {}),
      accessToken: encryptedToken,
      scopes: ['whatsapp_business_management', 'whatsapp_business_messaging'],
    }

    const socialAccount = existingPhoneAccount
      ? await this.prisma.socialAccount.update({
          where: { id: existingPhoneAccount.id },
          data: accountData,
        })
      : staleWabaAccount?.organisationId === organisationId
        ? await this.prisma.socialAccount.update({
            where: { id: staleWabaAccount.id },
            data: {
              ...accountData,
              providerAccountId: phoneId,
            },
          })
        : await this.prisma.socialAccount.create({
            data: {
              organisationId,
              provider: 'WHATSAPP',
              providerAccountId: phoneId,
              ...accountData,
            },
          })

    // Create default settings
    await this.prisma.pageSettings.upsert({
      where: { socialAccountId: socialAccount.id },
      create: { socialAccountId: socialAccount.id },
      update: {},
    })

    await this.avatarSyncService.enqueue(socialAccount.id)

    this.logger.log(
      `[WhatsApp] ✅ Connected "${displayName}" (number=${displayPhone || 'n/a'}, phone=${phoneId}, waba=${wabaId}) for org ${organisationId}`,
    )
    return socialAccount
  }

  // ─── TikTok: Refresh token ───

  private async refreshTikTokToken(socialAccountId: string): Promise<string> {
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
    await this.assertMembership(userId, account.organisationId)

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
  private async syncTikTokVideosViaBusinessApi(account: {
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

  private async getTikTokAccessToken(account: {
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
  private async syncTikTokVideosViaOEmbed(
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
    await this.assertMembership(userId, account.organisationId)

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
            socialAccount: { select: { id: true, provider: true, organisationId: true } },
          },
        },
      },
    })
    if (!comment) throw new NotFoundException('Comment not found')

    if (comment.post.socialAccount.provider !== 'TIKTOK') {
      throw new BadRequestException('Not a TikTok comment')
    }

    await this.assertMembership(userId, comment.post.socialAccount.organisationId)
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

  private async updateTikTokWebhook(eventType: 'COMMENT' | 'DIRECT_MESSAGE') {
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

  // ─── Webhook subscriptions ───

  private async subscribePageToWebhook(pageId: string, pageAccessToken: string) {
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

  // ─── Page settings ───

  async updatePageSettings(
    userId: string,
    socialAccountId: string,
    data: {
      undesiredCommentsAction?: string
      spamAction?: string
      customInstructions?: string
      faqRules?: { question: string; answer: string }[]
      catalogId?: string | null
    },
  ) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: { organisationId: true },
    })
    if (!account) throw new NotFoundException('Social account not found')

    await this.assertMembership(userId, account.organisationId)

    if (data.catalogId) {
      const catalog = await this.prisma.catalog.findUnique({
        where: { id: data.catalogId },
        select: { organisationId: true },
      })
      if (!catalog || catalog.organisationId !== account.organisationId) {
        throw new NotFoundException('Catalog not found')
      }
    }

    const settings = await this.prisma.pageSettings.upsert({
      where: { socialAccountId },
      create: {
        socialAccountId,
        isConfigured: true,
        undesiredCommentsAction: data.undesiredCommentsAction || 'hide',
        spamAction: data.spamAction || 'delete',
        customInstructions: data.customInstructions,
        catalogId: data.catalogId ?? null,
      },
      update: {
        isConfigured: true,
        undesiredCommentsAction: data.undesiredCommentsAction,
        spamAction: data.spamAction,
        customInstructions: data.customInstructions,
        ...(data.catalogId !== undefined && { catalogId: data.catalogId }),
      },
    })

    // Replace FAQ rules if provided
    if (data.faqRules) {
      await this.prisma.fAQRule.deleteMany({ where: { pageSettingsId: settings.id } })

      if (data.faqRules.length > 0) {
        await this.prisma.fAQRule.createMany({
          data: data.faqRules.map((rule) => ({
            pageSettingsId: settings.id,
            question: rule.question,
            answer: rule.answer,
          })),
        })
      }
    }

    const pageSettings = await this.prisma.pageSettings.findUnique({
      where: { id: settings.id },
      include: { faqRules: true },
    })
    if (!pageSettings) throw new NotFoundException('Page settings not found')
    return pageSettings
  }

  // ─── Get social accounts for org ───

  private needsWhatsAppProfileBackfill(account: {
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

  private async backfillWhatsAppProfile(socialAccountId: string): Promise<boolean> {
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

  async getAccountsForOrg(userId: string, organisationId: string) {
    await this.assertMembership(userId, organisationId)

    const accounts = await this.prisma.socialAccount.findMany({
      where: { organisationId },
      include: {
        settings: { include: { faqRules: true } },
        _count: { select: { posts: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    const backfillIds = accounts
      .filter((account) => this.needsWhatsAppProfileBackfill(account))
      .map((account) => account.id)

    if (backfillIds.length === 0) return accounts

    const results = await Promise.allSettled(
      backfillIds.map((accountId) => this.backfillWhatsAppProfile(accountId)),
    )
    const hasUpdates = results.some((result) => result.status === 'fulfilled' && result.value)
    if (!hasUpdates) return accounts

    return this.prisma.socialAccount.findMany({
      where: { organisationId },
      include: {
        settings: { include: { faqRules: true } },
        _count: { select: { posts: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
  }

  // ─── Get posts with comments for a social account ───

  async getPostsForAccount(userId: string, socialAccountId: string) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: { organisationId: true },
    })
    if (!account) throw new NotFoundException('Social account not found')

    await this.assertMembership(userId, account.organisationId)

    const posts = await this.prisma.post.findMany({
      where: { socialAccountId },
      include: {
        comments: {
          orderBy: { createdTime: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return posts.map((post) => ({
      ...post,
      totalComments: post.comments.length,
      unreadComments: post.comments.filter((c) => !c.isRead && !c.isPageReply).length,
    }))
  }

  // ─── Fetch fresh page posts straight from Meta ───
  // Local Post rows are only created when comments arrive via webhook, so the
  // table starts empty for inactive pages. This method talks to the Graph API
  // directly and upserts each result so FKs from ProductPostLink stay valid.

  async fetchProviderPosts(
    userId: string,
    socialAccountId: string,
    params?: { search?: string; limit?: number; after?: string },
  ): Promise<{
    posts: Array<{
      id: string
      message: string | null
      imageUrl: string | null
      permalinkUrl: string | null
      createdTime: string | null
    }>
    cursorAfter?: string
  }> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      omit: { accessToken: false },
    })
    if (!account) throw new NotFoundException('Social account not found')
    await this.assertMembership(userId, account.organisationId)

    if (account.provider === 'WHATSAPP') {
      return { posts: [] }
    }

    // TikTok has no live posts endpoint we can hit here — videos are synced
    // periodically into the local Post table via the Business API. Serve that
    // table directly with the same shape as Meta returns.
    if (account.provider === 'TIKTOK') {
      const search = params?.search?.trim().toLowerCase()
      const limit = Math.min(params?.limit ?? 25, 50)
      const posts = await this.prisma.post.findMany({
        where: {
          socialAccountId: account.id,
          ...(search ? { message: { contains: search, mode: 'insensitive' } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
      return {
        posts: posts.map((p) => ({
          id: p.id,
          message: p.message,
          imageUrl: p.imageUrl,
          permalinkUrl: p.permalinkUrl,
          createdTime: p.createdAt.toISOString(),
        })),
      }
    }

    const accessToken = await this.encryptionService.decrypt(account.accessToken)
    const limit = Math.min(params?.limit ?? 25, 50)

    const { edge, fields, baseHost } =
      account.provider === 'FACEBOOK'
        ? {
            edge: 'posts',
            fields: 'id,message,full_picture,permalink_url,created_time',
            baseHost: 'https://graph.facebook.com',
          }
        : {
            edge: 'media',
            fields: 'id,caption,media_url,thumbnail_url,permalink,timestamp',
            // Instagram Basic Display / IG Login tokens go through graph.instagram.com.
            // Using graph.facebook.com here returns "Cannot parse access token".
            baseHost: 'https://graph.instagram.com',
          }

    const query = new URLSearchParams({
      fields,
      limit: String(limit),
      access_token: accessToken,
    })
    if (params?.after) query.set('after', params.after)

    const url = `${baseHost}/${FACEBOOK_GRAPH_API_VERSION}/${account.providerAccountId}/${edge}?${query}`
    const response = await fetch(url)
    if (!response.ok) {
      const errorText = await response.text()
      this.logger.warn(`fetchProviderPosts ${account.provider} error: ${errorText}`)
      throw new BadRequestException(`Meta API error: ${errorText}`)
    }

    const data = (await response.json()) as {
      data: Array<Record<string, unknown>>
      paging?: { cursors?: { after?: string } }
    }

    const rawPosts = data.data ?? []
    const mapped = rawPosts.map((p) => {
      if (account.provider === 'FACEBOOK') {
        return {
          id: String(p.id ?? ''),
          message: (p.message as string | undefined) ?? null,
          imageUrl: (p.full_picture as string | undefined) ?? null,
          permalinkUrl: (p.permalink_url as string | undefined) ?? null,
          createdTime: (p.created_time as string | undefined) ?? null,
        }
      }
      return {
        id: String(p.id ?? ''),
        message: (p.caption as string | undefined) ?? null,
        imageUrl:
          (p.thumbnail_url as string | undefined) ?? (p.media_url as string | undefined) ?? null,
        permalinkUrl: (p.permalink as string | undefined) ?? null,
        createdTime: (p.timestamp as string | undefined) ?? null,
      }
    })

    // Optional client-side search — Meta's posts/media edges don't support it.
    const search = params?.search?.trim().toLowerCase()
    const filtered = search
      ? mapped.filter((p) => (p.message ?? '').toLowerCase().includes(search))
      : mapped

    // Mirror into local Post table so ProductPostLink / CollectionPostLink FKs
    // can reference these rows. Best-effort: failures shouldn't block the UI.
    await Promise.all(
      filtered.map((p) =>
        this.prisma.post
          .upsert({
            where: { id: p.id },
            create: {
              id: p.id,
              socialAccountId: account.id,
              message: p.message,
              imageUrl: p.imageUrl,
              permalinkUrl: p.permalinkUrl,
            },
            update: {
              message: p.message ?? undefined,
              imageUrl: p.imageUrl ?? undefined,
              permalinkUrl: p.permalinkUrl ?? undefined,
            },
          })
          .catch(() => null),
      ),
    )

    return { posts: filtered, cursorAfter: data.paging?.cursors?.after }
  }

  // ─── User stats ───

  async getUserStats(userId: string, accountId: string, fromId: string) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: accountId },
      select: { organisationId: true },
    })
    if (!account) throw new NotFoundException('Social account not found')

    await this.assertMembership(userId, account.organisationId)

    const comments = await this.prisma.comment.findMany({
      where: {
        fromId,
        isPageReply: false,
        post: { socialAccountId: accountId },
      },
      select: { status: true, fromName: true, fromAvatar: true },
    })

    const first = comments[0]

    return {
      fromId,
      fromName: first?.fromName || fromId,
      fromAvatar: first?.fromAvatar || null,
      totalComments: comments.length,
      hiddenComments: comments.filter((c) => c.status === 'HIDDEN').length,
      deletedComments: comments.filter((c) => c.status === 'DELETED').length,
    }
  }

  // ─── Mark comments as read ───

  async markCommentsAsRead(userId: string, postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { socialAccount: { select: { organisationId: true } } },
    })
    if (!post) throw new NotFoundException('Post not found')

    await this.assertMembership(userId, post.socialAccount.organisationId)

    await this.prisma.comment.updateMany({
      where: { postId, isRead: false },
      data: { isRead: true },
    })
  }

  // ─── Comment on a post (top-level) ───

  async commentOnPost(userId: string, postId: string, message: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        socialAccount: { select: { id: true, provider: true, organisationId: true } },
      },
    })
    if (!post) throw new NotFoundException('Post not found')

    await this.assertMembership(userId, post.socialAccount.organisationId)
    const provider = post.socialAccount.provider

    if (provider === 'TIKTOK') {
      throw new BadRequestException('TikTok does not support top-level comments via API')
    }

    const accessToken = await this.getDecryptedToken(post.socialAccount.id)

    if (provider === 'FACEBOOK') {
      await this.facebookReplyToComment(postId, message, accessToken)
    } else if (provider === 'INSTAGRAM') {
      // Instagram: POST /{media-id}/comments
      const response = await fetch(
        `https://graph.instagram.com/${FACEBOOK_GRAPH_API_VERSION}/${postId}/comments?access_token=${accessToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        },
      )
      if (!response.ok) {
        this.logger.error(`[Instagram] Comment on post failed: ${await response.text()}`)
        throw new BadRequestException('Failed to comment on Instagram post')
      }
    }

    const commentId = `comment_${Date.now()}_${postId}`
    return this.prisma.comment.create({
      data: {
        id: commentId,
        postId,
        message,
        fromId: post.socialAccount.id,
        fromName: 'Page',
        createdTime: new Date(),
        isRead: true,
        isPageReply: true,
      },
    })
  }

  // ─── Reply to a comment ───

  async replyToComment(userId: string, commentId: string, message: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        post: {
          include: {
            socialAccount: { select: { id: true, provider: true, organisationId: true } },
          },
        },
      },
    })
    if (!comment) throw new NotFoundException('Comment not found')

    await this.assertMembership(userId, comment.post.socialAccount.organisationId)

    const accessToken = await this.getDecryptedToken(comment.post.socialAccount.id)
    const provider = comment.post.socialAccount.provider

    // Tag the user so they get a notification
    const taggedMessage =
      provider === 'FACEBOOK'
        ? `@[${comment.fromId}] ${message}`
        : `@${comment.fromName} ${message}`

    if (provider === 'FACEBOOK') {
      await this.facebookReplyToComment(commentId, taggedMessage, accessToken)
    } else if (provider === 'INSTAGRAM') {
      await this.instagramReplyToComment(commentId, taggedMessage, accessToken)
    }

    // Save the reply as a new comment (with tag)
    const replyId = `reply_${Date.now()}_${commentId}`
    return this.prisma.comment.create({
      data: {
        id: replyId,
        postId: comment.postId,
        parentId: commentId,
        message: taggedMessage,
        fromId: comment.post.socialAccount.id,
        fromName: 'Page',
        createdTime: new Date(),
        isRead: true,
        isPageReply: true,
      },
    })
  }

  // ─── Hide a comment ───

  async hideComment(userId: string, commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        post: {
          include: {
            socialAccount: { select: { id: true, provider: true, organisationId: true } },
          },
        },
      },
    })
    if (!comment) throw new NotFoundException('Comment not found')

    await this.assertMembership(userId, comment.post.socialAccount.organisationId)

    const accessToken = await this.getDecryptedToken(comment.post.socialAccount.id)
    const provider = comment.post.socialAccount.provider

    if (provider === 'FACEBOOK') {
      await this.facebookHideComment(commentId, accessToken)
    } else if (provider === 'INSTAGRAM') {
      await this.instagramHideComment(commentId, accessToken)
    } else if (provider === 'TIKTOK') {
      await this.tiktokHideComment(
        comment.post.socialAccount.id,
        comment.postId,
        commentId,
        accessToken,
        'HIDE',
      )
    }

    return this.prisma.comment.update({
      where: { id: commentId },
      data: { status: 'HIDDEN', action: 'HIDE' },
    })
  }

  // ─── Unhide a comment ───

  async unhideComment(userId: string, commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        post: {
          include: {
            socialAccount: { select: { id: true, provider: true, organisationId: true } },
          },
        },
      },
    })
    if (!comment) throw new NotFoundException('Comment not found')

    await this.assertMembership(userId, comment.post.socialAccount.organisationId)

    const accessToken = await this.getDecryptedToken(comment.post.socialAccount.id)
    const provider = comment.post.socialAccount.provider

    if (provider === 'FACEBOOK') {
      await this.facebookUnhideComment(commentId, accessToken)
    } else if (provider === 'INSTAGRAM') {
      await this.instagramUnhideComment(commentId, accessToken)
    } else if (provider === 'TIKTOK') {
      await this.tiktokHideComment(
        comment.post.socialAccount.id,
        comment.postId,
        commentId,
        accessToken,
        'UNHIDE',
      )
    }

    return this.prisma.comment.update({
      where: { id: commentId },
      data: { status: 'VISIBLE', action: 'NONE', actionReason: null },
    })
  }

  // ─── Delete a comment ───

  async deleteComment(userId: string, commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        post: {
          include: {
            socialAccount: { select: { id: true, provider: true, organisationId: true } },
          },
        },
      },
    })
    if (!comment) throw new NotFoundException('Comment not found')

    await this.assertMembership(userId, comment.post.socialAccount.organisationId)

    const accessToken = await this.getDecryptedToken(comment.post.socialAccount.id)
    const provider = comment.post.socialAccount.provider

    if (provider === 'FACEBOOK') {
      await this.facebookDeleteComment(commentId, accessToken)
    } else if (provider === 'INSTAGRAM') {
      await this.instagramDeleteComment(commentId, accessToken)
    } else if (provider === 'TIKTOK') {
      await this.tiktokDeleteComment(comment.post.socialAccount.id, commentId, accessToken)
    }

    return this.prisma.comment.delete({
      where: { id: commentId },
    })
  }

  // ─── Facebook API actions ───

  private async facebookReplyToComment(commentId: string, message: string, accessToken: string) {
    const response = await fetch(
      `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${commentId}/comments?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      },
    )
    if (!response.ok) {
      this.logger.error(`[Facebook] Reply failed: ${await response.text()}`)
      throw new BadRequestException('Failed to reply to comment')
    }
  }

  private async facebookHideComment(commentId: string, accessToken: string) {
    const response = await fetch(
      `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${commentId}?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_hidden: true }),
      },
    )
    if (!response.ok) {
      this.logger.error(`[Facebook] Hide failed: ${await response.text()}`)
      throw new BadRequestException('Failed to hide comment')
    }
  }

  private async facebookUnhideComment(commentId: string, accessToken: string) {
    const response = await fetch(
      `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${commentId}?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_hidden: false }),
      },
    )
    if (!response.ok) {
      this.logger.error(`[Facebook] Unhide failed: ${await response.text()}`)
      throw new BadRequestException('Failed to unhide comment')
    }
  }

  private async facebookDeleteComment(commentId: string, accessToken: string) {
    const response = await fetch(
      `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${commentId}?access_token=${accessToken}`,
      { method: 'DELETE' },
    )
    if (!response.ok) {
      this.logger.error(`[Facebook] Delete failed: ${await response.text()}`)
      throw new BadRequestException('Failed to delete comment')
    }
  }

  // ─── Instagram API actions ───

  private async instagramReplyToComment(commentId: string, message: string, accessToken: string) {
    const response = await fetch(
      `https://graph.instagram.com/${FACEBOOK_GRAPH_API_VERSION}/${commentId}/replies?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      },
    )
    if (!response.ok) {
      this.logger.error(`[Instagram] Reply failed: ${await response.text()}`)
      throw new BadRequestException('Failed to reply to comment')
    }
  }

  private async instagramHideComment(commentId: string, accessToken: string) {
    const response = await fetch(
      `https://graph.instagram.com/${FACEBOOK_GRAPH_API_VERSION}/${commentId}?hide=true&access_token=${accessToken}`,
      { method: 'POST' },
    )
    if (!response.ok) {
      this.logger.error(`[Instagram] Hide failed: ${await response.text()}`)
      throw new BadRequestException('Failed to hide comment')
    }
  }

  private async instagramUnhideComment(commentId: string, accessToken: string) {
    const response = await fetch(
      `https://graph.instagram.com/${FACEBOOK_GRAPH_API_VERSION}/${commentId}?hide=false&access_token=${accessToken}`,
      { method: 'POST' },
    )
    if (!response.ok) {
      this.logger.error(`[Instagram] Unhide failed: ${await response.text()}`)
      throw new BadRequestException('Failed to unhide comment')
    }
  }

  private async instagramDeleteComment(commentId: string, accessToken: string) {
    const response = await fetch(
      `https://graph.instagram.com/${FACEBOOK_GRAPH_API_VERSION}/${commentId}?access_token=${accessToken}`,
      { method: 'DELETE' },
    )
    if (!response.ok) {
      this.logger.error(`[Instagram] Delete failed: ${await response.text()}`)
      throw new BadRequestException('Failed to delete comment')
    }
  }

  private async tiktokDeleteComment(
    socialAccountId: string,
    commentId: string,
    accessToken: string,
  ) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: { providerAccountId: true },
    })
    if (!account) throw new NotFoundException('Social account not found')

    const response = await fetch(
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

    const body = (await response.json()) as { code: number; message: string }
    if (body.code !== 0) {
      this.logger.error(`[TikTok] Delete comment failed: ${body.code} — ${body.message}`)
      throw new BadRequestException(`Failed to delete TikTok comment: ${body.message}`)
    }

    this.logger.log(`[TikTok] Deleted comment ${commentId} on TikTok`)
  }

  private async tiktokHideComment(
    socialAccountId: string,
    videoId: string,
    commentId: string,
    accessToken: string,
    action: 'HIDE' | 'UNHIDE',
  ) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: { providerAccountId: true },
    })
    if (!account) throw new NotFoundException('Social account not found')

    const response = await fetch(
      'https://business-api.tiktok.com/open_api/v1.3/business/comment/hide/',
      {
        method: 'POST',
        headers: {
          'Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          business_id: account.providerAccountId,
          video_id: videoId,
          comment_id: commentId,
          action,
        }),
      },
    )

    const body = (await response.json()) as { code: number; message: string }
    if (body.code !== 0) {
      this.logger.error(`[TikTok] ${action} comment failed: ${body.code} — ${body.message}`)
      throw new BadRequestException(
        `Failed to ${action.toLowerCase()} TikTok comment: ${body.message}`,
      )
    }

    this.logger.log(`[TikTok] ${action} comment ${commentId} on TikTok`)
  }

  // ─── Unread counts per provider (comments + messaging) ───

  async getUnreadCounts(userId: string, organisationId: string) {
    await this.assertMembership(userId, organisationId)

    const accounts = await this.prisma.socialAccount.findMany({
      where: { organisationId },
      select: {
        provider: true,
        scopes: true,
        posts: {
          select: {
            comments: {
              where: { isRead: false, isPageReply: false },
              select: { id: true },
            },
          },
        },
        conversations: {
          select: { unreadCount: true },
        },
      },
    })

    const counts: Record<string, number> = {}
    for (const account of accounts) {
      // Comment unread counts (keyed by provider: FACEBOOK, INSTAGRAM, TIKTOK)
      const unreadComments = account.posts.reduce((sum, post) => sum + post.comments.length, 0)
      counts[account.provider] = (counts[account.provider] || 0) + unreadComments

      // Messaging unread counts (keyed by messaging type)
      const hasMessaging =
        account.scopes.includes('messages') ||
        account.scopes.includes('whatsapp_business_messaging') ||
        account.scopes.includes('whatsapp_business_management') ||
        account.scopes.includes('message.list.read') ||
        account.scopes.includes('message.list.send') ||
        account.scopes.includes('message.list.manage')
      if (hasMessaging) {
        const unreadMessages = account.conversations.reduce(
          (sum, conv) => sum + conv.unreadCount,
          0,
        )
        const msgProvider =
          account.provider === 'INSTAGRAM'
            ? 'INSTAGRAM_DM'
            : account.provider === 'WHATSAPP'
              ? 'WHATSAPP'
              : account.provider === 'TIKTOK'
                ? 'TIKTOK_DM'
                : 'MESSENGER'
        counts[msgProvider] = (counts[msgProvider] || 0) + unreadMessages
      }
    }

    return Object.entries(counts).map(([provider, count]) => ({ provider, count }))
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

  private async assertMembership(userId: string, organisationId: string) {
    const membership = await this.prisma.organisationMember.findUnique({
      where: { userId_organisationId: { userId, organisationId } },
    })

    if (!membership) {
      throw new ForbiddenException("Vous n'êtes pas membre de cette organisation")
    }
  }
}
