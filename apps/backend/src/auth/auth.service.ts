import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import * as crypto from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from './encryption.service'
import { FACEBOOK_GRAPH_API_VERSION } from '../common/config/facebook-scopes.config'
import { AuthType } from '../../generated/prisma/client'

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)
  private readonly frontendUrl: string

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private encryptionService: EncryptionService,
  ) {
    this.frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL')
  }

  // ─── Email/Password Login ───

  async loginWithPassword(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } })

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Email ou mot de passe incorrect')
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      throw new UnauthorizedException('Email ou mot de passe incorrect')
    }

    return this.createSessionForUser(user.id)
  }

  // ─── Facebook Callback ───

  async handleFacebookCallback(code: string, redirectUri: string) {
    const appId = this.configService.getOrThrow<string>('FACEBOOK_APP_ID')
    const appSecret = this.configService.getOrThrow<string>('FACEBOOK_APP_SECRET')

    // Exchange code for access token
    const tokenUrl = new URL(
      `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/oauth/access_token`,
    )
    tokenUrl.searchParams.set('client_id', appId)
    tokenUrl.searchParams.set('client_secret', appSecret)
    tokenUrl.searchParams.set('redirect_uri', redirectUri)
    tokenUrl.searchParams.set('code', code)

    const tokenResponse = await fetch(tokenUrl.toString())
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      this.logger.error(`[Facebook] Token exchange failed: ${errorText}`)
      throw new Error('token_exchange_failed')
    }

    const tokenData: { access_token: string } = await tokenResponse.json()
    const accessToken = tokenData.access_token

    // Get user info
    const userInfoUrl = new URL(`https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/me`)
    userInfoUrl.searchParams.set('fields', 'id,name,email,picture')
    userInfoUrl.searchParams.set('access_token', accessToken)

    const userInfoResponse = await fetch(userInfoUrl.toString())
    if (!userInfoResponse.ok) {
      const errorText = await userInfoResponse.text()
      this.logger.error(`[Facebook] User info fetch failed: ${errorText}`)
      throw new Error('user_info_failed')
    }

    const userInfo: {
      id: string
      name?: string
      email?: string
      picture?: { data?: { url?: string } }
    } = await userInfoResponse.json()

    if (!userInfo.email) {
      this.logger.error('[Facebook] No email returned from Facebook')
      throw new Error('no_email')
    }

    // Upsert user
    const user = await this.upsertOAuthUser({
      email: userInfo.email,
      name: userInfo.name || 'Utilisateur Facebook',
      avatar: userInfo.picture?.data?.url || null,
      authType: AuthType.FACEBOOK,
      providerUserId: userInfo.id,
    })

    // Check if this token has page scopes (user is connecting pages, not just logging in)
    const hasPageScopes = await this.checkTokenScopes(accessToken, [
      'pages_show_list',
      'pages_read_engagement',
    ])

    if (hasPageScopes) {
      await this.syncFacebookPages(user.id, accessToken)
    }

    return this.createSessionForUser(user.id)
  }

  // ─── Instagram Callback ───

  async handleInstagramCallback(code: string, redirectUri: string) {
    const appId = this.configService.getOrThrow<string>('INSTAGRAM_APP_ID')
    const appSecret = this.configService.getOrThrow<string>('INSTAGRAM_APP_SECRET')

    // Exchange code for access token (Instagram uses POST with form data)
    const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code: code,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      this.logger.error(`[Instagram] Token exchange failed: ${errorText}`)
      throw new Error('token_exchange_failed')
    }

    const tokenData: { access_token: string; user_id: number } = await tokenResponse.json()
    let accessToken = tokenData.access_token
    const instagramUserId = tokenData.user_id.toString()

    // Exchange for long-lived token (60 days)
    const longLivedTokenUrl = new URL('https://graph.instagram.com/access_token')
    longLivedTokenUrl.searchParams.set('grant_type', 'ig_exchange_token')
    longLivedTokenUrl.searchParams.set('client_secret', appSecret)
    longLivedTokenUrl.searchParams.set('access_token', accessToken)

    const longLivedResponse = await fetch(longLivedTokenUrl.toString())
    if (longLivedResponse.ok) {
      const longLivedData: { access_token: string; expires_in: number } =
        await longLivedResponse.json()
      accessToken = longLivedData.access_token
    } else {
      this.logger.warn('[Instagram] Long-lived token exchange failed, using short-lived token')
    }

    // Fetch Instagram profile
    const meUrl = new URL('https://graph.instagram.com/me')
    meUrl.searchParams.set('fields', 'id,user_id,username,account_type,profile_picture_url')
    meUrl.searchParams.set('access_token', accessToken)

    const meResponse = await fetch(meUrl.toString())

    let username = `instagram_user_${instagramUserId}`
    let profilePictureUrl: string | null = null

    if (meResponse.ok) {
      const profileData: {
        id: string
        user_id: number
        username: string
        account_type?: string
        profile_picture_url?: string
      } = await meResponse.json()
      username = profileData.username
      profilePictureUrl = profileData.profile_picture_url || null
    }

    // Upsert user (Instagram doesn't provide email, use a generated one)
    const user = await this.upsertOAuthUser({
      email: `${instagramUserId}@instagram.bedones.local`,
      name: username,
      avatar: profilePictureUrl,
      authType: AuthType.INSTAGRAM,
      providerUserId: instagramUserId,
    })

    return this.createSessionForUser(user.id)
  }

  // ─── Get current user with organisations ───

  async getMe(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        authType: true,
        memberships: {
          select: {
            role: true,
            organisation: {
              select: {
                id: true,
                name: true,
                logoUrl: true,
                socialAccounts: {
                  select: {
                    id: true,
                    provider: true,
                    pageName: true,
                    providerAccountId: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        authType: user.authType,
      },
      organisations: user.memberships.map((m) => ({
        id: m.organisation.id,
        name: m.organisation.name,
        logoUrl: m.organisation.logoUrl,
        role: m.role,
        socialAccounts: m.organisation.socialAccounts,
      })),
    }
  }

  // ─── Logout ───

  async logout(sessionToken: string) {
    try {
      const payload = this.jwtService.verify(sessionToken)
      await this.prisma.session.delete({ where: { id: payload.sessionId } })
    } catch {
      // Session already expired or invalid, that's fine
    }
  }

  // ─── Private helpers ───

  private async upsertOAuthUser(data: {
    email: string
    name: string
    avatar: string | null
    authType: AuthType
    providerUserId: string
  }) {
    // First try to find by providerUserId
    let user = await this.prisma.user.findFirst({
      where: { providerUserId: data.providerUserId, authType: data.authType },
    })

    if (user) {
      // Update avatar if changed
      if (data.avatar && user.avatar !== data.avatar) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { avatar: data.avatar, name: data.name },
        })
      }
      return user
    }

    // Try to find by email
    user = await this.prisma.user.findUnique({ where: { email: data.email } })

    if (user) {
      // Link this OAuth provider to existing user
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          providerUserId: data.providerUserId,
          authType: data.authType,
          avatar: data.avatar || user.avatar,
          name: data.name || user.name,
        },
      })
      return user
    }

    // Create new user
    return this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        avatar: data.avatar,
        authType: data.authType,
        providerUserId: data.providerUserId,
      },
    })
  }

  private async createSessionForUser(userId: string) {
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    const session = await this.prisma.session.create({
      data: { token, userId, expiresAt },
    })

    const jwt = this.jwtService.sign({
      sessionId: session.id,
      userId,
    })

    return { jwt, expiresAt }
  }

  private async checkTokenScopes(accessToken: string, requiredScopes: string[]): Promise<boolean> {
    try {
      const debugUrl = new URL(
        `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/debug_token`,
      )
      debugUrl.searchParams.set('input_token', accessToken)
      debugUrl.searchParams.set(
        'access_token',
        `${this.configService.get('FACEBOOK_APP_ID')}|${this.configService.get('FACEBOOK_APP_SECRET')}`,
      )

      const response = await fetch(debugUrl.toString())
      if (!response.ok) return false

      const data: { data: { scopes: string[] } } = await response.json()
      return requiredScopes.some((scope) => data.data.scopes.includes(scope))
    } catch {
      return false
    }
  }

  private async syncFacebookPages(userId: string, accessToken: string) {
    try {
      // Get the user's first org (or skip if no org yet)
      const membership = await this.prisma.organisationMember.findFirst({
        where: { userId },
        select: { organisationId: true },
      })

      if (!membership) {
        this.logger.log('[Facebook Sync] User has no org yet, skipping page sync')
        return
      }

      const pagesUrl = new URL(
        `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/me/accounts`,
      )
      pagesUrl.searchParams.set('access_token', accessToken)
      pagesUrl.searchParams.set('fields', 'id,name,access_token')

      const response = await fetch(pagesUrl.toString())
      if (!response.ok) {
        this.logger.error(`[Facebook Sync] Failed to fetch pages: ${await response.text()}`)
        return
      }

      const data: { data: Array<{ id: string; name: string; access_token: string }> } =
        await response.json()

      for (const page of data.data) {
        const encryptedToken = await this.encryptionService.encrypt(page.access_token)

        await this.prisma.socialAccount.upsert({
          where: {
            provider_providerAccountId: {
              provider: 'FACEBOOK',
              providerAccountId: page.id,
            },
          },
          create: {
            organisationId: membership.organisationId,
            provider: 'FACEBOOK',
            providerAccountId: page.id,
            pageName: page.name,
            accessToken: encryptedToken,
            scopes: [],
          },
          update: {
            accessToken: encryptedToken,
            pageName: page.name,
          },
        })
      }

      this.logger.log(`[Facebook Sync] Synced ${data.data.length} pages`)
    } catch (error) {
      this.logger.error('[Facebook Sync] Error:', error)
    }
  }
}
