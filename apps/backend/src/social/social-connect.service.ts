import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from '../auth/encryption.service'
import { FACEBOOK_GRAPH_API_VERSION } from '../common/config/facebook-scopes.config'
import { AvatarSyncService } from './avatar-sync.service'
import { MessageHistorySyncService } from './message-history-sync.service'
import { SocialHealthService } from './social-health.service'
import { featuresFromRequestedScopes } from './required-scopes.config'
import { SocialCommonService } from './social-common.service'
import { TikTokContentService } from './tiktok-content.service'

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
export class SocialConnectService {
  private readonly logger = new Logger(SocialConnectService.name)

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private encryptionService: EncryptionService,
    private avatarSyncService: AvatarSyncService,
    private historySync: MessageHistorySyncService,
    private socialHealth: SocialHealthService,
    private common: SocialCommonService,
    private tiktokContent: TikTokContentService,
  ) {}

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
    await this.common.assertMembership(userId, organisationId)

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
      await this.common.subscribePageToWebhook(page.id, page.access_token)

      // Mirror the (often temporary) Meta avatar URL to our own MinIO bucket
      // in the background so we don't lose the image when the URL expires.
      await this.avatarSyncService.enqueue(socialAccount.id)

      // Backfill the last 14 days of conversations/messages for this page.
      await this.historySync.enqueueInitialSync(socialAccount.id)

      savedPages.push(socialAccount)
    }

    // Verify the user actually granted every permission each requested feature
    // needs. A successful connect resets the circuit breaker; missing scopes
    // re-disable the affected feature until the next correct reconnect.
    const grantedScopes = await this.fetchFacebookGrantedScopes(userAccessToken)
    const intendedFeatures = featuresFromRequestedScopes(newScopes)
    for (const account of savedPages) {
      await this.socialHealth.clearHealth(account.id)
      if (intendedFeatures.length > 0) {
        await this.socialHealth.syncScopeHealth({
          socialAccountId: account.id,
          provider: 'FACEBOOK',
          grantedScopes,
          intendedFeatures,
        })
      }
    }

    this.logger.log(`[Facebook] ✅ Connected ${savedPages.length} pages for org ${organisationId}`)
    return savedPages
  }

  /** Reads the permissions actually granted on a Meta user access token. */
  async fetchFacebookGrantedScopes(userAccessToken: string): Promise<string[]> {
    try {
      const url = new URL(`https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/me/permissions`)
      url.searchParams.set('access_token', userAccessToken)
      const res = await fetch(url.toString())
      if (!res.ok) return []
      const body = (await res.json()) as {
        data?: Array<{ permission: string; status: string }>
      }
      return (body.data ?? []).filter((p) => p.status === 'granted').map((p) => p.permission)
    } catch {
      return []
    }
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
    await this.common.assertMembership(userId, organisationId)

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

    // A successful (re)connect must clear any prior disabled / error state so
    // the catalog can be listed again.
    await this.socialHealth.clearHealth(socialAccount.id)

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
            vertical: metaCatalog.vertical ?? null,
          },
        })
      } else {
        catalog = await this.prisma.catalog.create({
          data: {
            organisationId,
            name: metaCatalog.name,
            providerId: metaCatalog.id,
            productCount: metaCatalog.product_count ?? 0,
            vertical: metaCatalog.vertical ?? null,
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
    await this.common.assertMembership(userId, organisationId)

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

    // Backfill the last 14 days of DMs for this account.
    await this.historySync.enqueueInitialSync(socialAccount.id)

    // Scope verification: Instagram returns the granted permissions on the token
    // exchange. Reset the breaker on (re)connect, then disable any feature that
    // is still missing a required permission.
    const grantedScopes = this.common.parseInstagramPermissions(
      (tokenData as { permissions?: unknown }).permissions,
      mergedScopes,
    )
    await this.socialHealth.clearHealth(socialAccount.id)
    const intendedFeatures = featuresFromRequestedScopes(
      newScopes.length > 0 ? newScopes : mergedScopes,
    )
    if (intendedFeatures.length > 0) {
      await this.socialHealth.syncScopeHealth({
        socialAccountId: socialAccount.id,
        provider: 'INSTAGRAM',
        grantedScopes,
        intendedFeatures,
      })
    }

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

    await this.common.assertMembership(userId, account.organisationId)

    const accessToken = await this.tiktokContent.getTikTokAccessToken(account)

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
    await this.common.assertMembership(userId, organisationId)

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

    // Backfill the last 14 days of DMs for this account.
    await this.historySync.enqueueInitialSync(socialAccount.id)

    // Scope verification: TikTok returns the granted scopes on the token
    // exchange and lets users uncheck individual permissions. Reset the breaker
    // on (re)connect, then disable any feature whose scopes are incomplete.
    const rawTikTokScope =
      (tokenPayload as { scope?: string }).scope ??
      (tokenPayload as { data?: { scope?: string } }).data?.scope ??
      ''
    const grantedTikTokScopes =
      rawTikTokScope.trim().length > 0
        ? rawTikTokScope
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : mergedScopes
    await this.socialHealth.clearHealth(socialAccount.id)
    const intendedTikTokFeatures = featuresFromRequestedScopes(requestedScopes)
    if (intendedTikTokFeatures.length > 0) {
      await this.socialHealth.syncScopeHealth({
        socialAccountId: socialAccount.id,
        provider: 'TIKTOK',
        grantedScopes: grantedTikTokScopes,
        intendedFeatures: intendedTikTokFeatures,
      })
    }

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
    await this.common.assertMembership(userId, organisationId)

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

    const readTokens = this.common.getMetaGraphReadTokens(accessToken)
    const graphGet = <T>(path: string, params: Record<string, string>) =>
      this.common.metaGraphGet<T>(path, params, readTokens)

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
    if (!phoneInfo?.display_phone_number || !phoneInfo?.verified_name) {
      const fetchedPhoneInfo = await graphGet<WhatsAppPhoneInfo>(phoneId, {
        fields: 'display_phone_number,verified_name',
      })
      phoneInfo = { ...(phoneInfo ?? { id: phoneId }), ...(fetchedPhoneInfo ?? {}), id: phoneId }
    }
    const displayName =
      phoneInfo?.verified_name || wabaName || phoneInfo?.display_phone_number || phoneId
    const displayPhone = phoneInfo?.display_phone_number || null

    // 5. Fetch WhatsApp Business profile metadata
    const profileData = await graphGet<{ data?: WhatsAppBusinessProfile[] }>(
      `${phoneId}/whatsapp_business_profile`,
      {
        fields:
          'about,address,description,email,profile_picture_url,websites,vertical,messaging_product',
      },
    )
    const businessProfile = profileData?.data?.[0] || null
    const profilePictureUrl = businessProfile?.profile_picture_url || null
    if (!profileData) {
      this.logger.warn(`[WhatsApp] Could not fetch business profile for ${phoneId}`)
    }

    // 6. Subscribe our app to this WABA's webhooks. Unlike the *webhook fields*
    // (configured once at the App Dashboard level), each WhatsApp Business
    // Account must be explicitly subscribed via POST /{waba-id}/subscribed_apps,
    // otherwise Meta routes NO webhook (messages, smb_message_echoes, history)
    // to our callback for that WABA. Without this, a freshly connected number
    // receives nothing until someone subscribes it by hand.
    if (wabaId) {
      await this.common.subscribeWabaToWebhook(wabaId, accessToken)
    }

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
    const metadata = this.common.mergeSocialAccountMetadata(existingMetadata, businessProfile)
    const pageAbout =
      this.common.cleanMetaString(businessProfile?.description) ||
      this.common.cleanMetaString(businessProfile?.about)
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

    // WhatsApp delivers history via Coexistence webhooks, but Meta requires an
    // explicit call to START the backfill (SMB App Data API, step 2 — after the
    // WABA webhook subscription done above). Without this, no `history` webhook
    // is ever pushed. Non-blocking; the actual history then arrives async.
    if (wabaId) {
      await this.initiateWhatsAppHistorySync(phoneId, accessToken)
    }

    // Flag the account as awaiting that Coexistence history (no pull API).
    await this.historySync.enqueueInitialSync(socialAccount.id)

    // A successful (re)connect resets the circuit breaker. WhatsApp scopes are
    // fixed and granted through Embedded Signup, so there is nothing to disable.
    await this.socialHealth.clearHealth(socialAccount.id)

    this.logger.log(
      `[WhatsApp] ✅ Connected "${displayName}" (number=${displayPhone || 'n/a'}, phone=${phoneId}, waba=${wabaId}) for org ${organisationId}`,
    )
    return socialAccount
  }

  /**
   * Initiate Coexistence message-history synchronization (SMB App Data API).
   *
   * After subscribing the WABA (step 1), Meta requires an explicit call on the
   * phone number to kick off the history backfill (step 2). On success it
   * returns a `request_id` and, minutes later, pushes one or more `history`
   * webhooks — OR a `history` webhook with error code 2593109 if the business
   * chose not to share its history during Embedded Signup.
   *
   * This can only be done ONCE per onboarding (re-doing it requires the customer
   * to offboard and complete Embedded Signup again), so we call it on connect and
   * keep it non-blocking — a failure must never break the connection flow.
   */
  async initiateWhatsAppHistorySync(phoneId: string, accessToken: string): Promise<string | null> {
    try {
      const response = await fetch(
        `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${phoneId}/smb_app_data?access_token=${accessToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: 'history' }),
        },
      )

      const body = (await response.json().catch(() => null)) as {
        request_id?: string
        error?: { message?: string }
      } | null

      if (!response.ok) {
        this.logger.error(
          `[WhatsApp History] Failed to initiate history sync for ${phoneId}: ${
            body?.error?.message || JSON.stringify(body)
          }`,
        )
        return null
      }

      this.logger.log(
        `[WhatsApp History] Initiated history sync for ${phoneId} (request_id=${body?.request_id ?? 'n/a'})`,
      )
      return body?.request_id ?? null
    } catch (error) {
      this.logger.error(`[WhatsApp History] Error initiating history sync for ${phoneId}:`, error)
      return null
    }
  }

  // ─── WhatsApp profile backfill (delegates to common) ───

  async backfillWhatsAppProfile(socialAccountId: string): Promise<boolean> {
    return this.common.backfillWhatsAppProfile(socialAccountId)
  }
}
