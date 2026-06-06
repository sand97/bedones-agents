import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { createHash, randomBytes } from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'

interface IssuedTokens {
  access_token: string
  refresh_token: string
  token_type: 'Bearer'
  expires_in: number
  scope?: string
}

/**
 * Prisma-backed OAuth 2.1 authorization server for the MCP connector.
 *
 * It is intentionally minimal and bridged to the existing Bedones
 * `User` / `Session` / `Organisation` model:
 *  - Dynamic Client Registration (public PKCE clients).
 *  - Authorization-code grant with PKCE (S256).
 *  - Access tokens are signed JWTs whose `jti` maps to an `McpAccessToken`
 *    row (so they can be revoked / re-checked), mirroring the `Session` pattern.
 */
@Injectable()
export class McpOAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ─── Config helpers ───

  get issuer(): string {
    return this.config.getOrThrow<string>('MCP_PUBLIC_URL').replace(/\/$/, '')
  }

  private get tokenSecret(): string {
    return (
      this.config.get<string>('MCP_JWT_SECRET') ?? this.config.getOrThrow<string>('SESSION_SECRET')
    )
  }

  private get accessTtl(): number {
    return Number(this.config.get('MCP_OAUTH_TOKEN_TTL') ?? 3600)
  }

  private get refreshTtl(): number {
    return Number(this.config.get('MCP_OAUTH_REFRESH_TTL') ?? 60 * 60 * 24 * 30)
  }

  get supportedScopes(): string[] {
    return ['messaging', 'comments', 'catalog', 'tickets', 'context']
  }

  // ─── Dynamic Client Registration ───

  async registerClient(input: { redirect_uris?: string[]; client_name?: string; scope?: string }) {
    const redirectUris = input.redirect_uris ?? []
    if (redirectUris.length === 0) {
      throw new BadRequestException('redirect_uris is required')
    }
    const clientId = `mcp_${randomBytes(16).toString('hex')}`
    const client = await this.prisma.mcpOAuthClient.create({
      data: {
        clientId,
        clientName: input.client_name,
        redirectUris,
        scope: input.scope,
      },
    })
    return {
      client_id: client.clientId,
      client_name: client.clientName ?? undefined,
      redirect_uris: client.redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: client.scope ?? this.supportedScopes.join(' '),
    }
  }

  async getClient(clientId: string) {
    if (!clientId) return null
    return this.prisma.mcpOAuthClient.findUnique({ where: { clientId } })
  }

  async assertClientRedirect(clientId: string, redirectUri: string) {
    const client = await this.getClient(clientId)
    if (!client || !client.redirectUris.includes(redirectUri)) {
      throw new BadRequestException('Unknown client or redirect_uri mismatch')
    }
    return client
  }

  // ─── Authorization code ───

  async createAuthCode(input: {
    clientId: string
    userId: string
    organisationId: string
    redirectUri: string
    scope?: string
    codeChallenge?: string
    codeChallengeMethod?: string
  }): Promise<string> {
    const code = randomBytes(32).toString('base64url')
    await this.prisma.mcpAuthCode.create({
      data: {
        code,
        clientId: input.clientId,
        userId: input.userId,
        organisationId: input.organisationId,
        redirectUri: input.redirectUri,
        scope: input.scope,
        codeChallenge: input.codeChallenge,
        codeChallengeMethod: input.codeChallengeMethod,
        expiresAt: new Date(Date.now() + 60_000), // 60s
      },
    })
    return code
  }

  async exchangeCode(input: {
    code: string
    clientId: string
    redirectUri: string
    codeVerifier?: string
  }): Promise<IssuedTokens> {
    const record = await this.prisma.mcpAuthCode.findUnique({ where: { code: input.code } })
    if (!record) throw new BadRequestException('invalid_grant')
    // single use
    await this.prisma.mcpAuthCode.delete({ where: { id: record.id } }).catch(() => undefined)

    if (record.expiresAt < new Date()) throw new BadRequestException('invalid_grant: code expired')
    if (record.clientId !== input.clientId)
      throw new BadRequestException('invalid_grant: client mismatch')
    if (record.redirectUri !== input.redirectUri)
      throw new BadRequestException('invalid_grant: redirect_uri mismatch')

    // PKCE verification (S256 required when a challenge was provided)
    if (record.codeChallenge) {
      if (!input.codeVerifier)
        throw new BadRequestException('invalid_grant: code_verifier required')
      const digest = createHash('sha256').update(input.codeVerifier).digest('base64url')
      if (digest !== record.codeChallenge)
        throw new BadRequestException('invalid_grant: PKCE failed')
    }

    return this.issueTokens(record.userId, record.organisationId, record.clientId, record.scope)
  }

  // ─── Token issuance / refresh ───

  private async issueTokens(
    userId: string,
    organisationId: string,
    clientId: string,
    scope?: string | null,
  ): Promise<IssuedTokens> {
    const refreshToken = randomBytes(32).toString('base64url')
    const token = await this.prisma.mcpAccessToken.create({
      data: {
        clientId,
        userId,
        organisationId,
        scope: scope ?? undefined,
        refreshTokenHash: this.hash(refreshToken),
        expiresAt: new Date(Date.now() + this.accessTtl * 1000),
        refreshExpiresAt: new Date(Date.now() + this.refreshTtl * 1000),
      },
    })

    const access_token = this.jwt.sign(
      { sub: userId, org: organisationId, cid: clientId, scope: scope ?? undefined },
      { secret: this.tokenSecret, expiresIn: this.accessTtl, jwtid: token.id },
    )

    return {
      access_token,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: this.accessTtl,
      scope: scope ?? undefined,
    }
  }

  async refresh(input: { refreshToken: string; clientId: string }): Promise<IssuedTokens> {
    const hash = this.hash(input.refreshToken)
    const existing = await this.prisma.mcpAccessToken.findUnique({
      where: { refreshTokenHash: hash },
    })
    if (!existing || existing.clientId !== input.clientId) {
      throw new BadRequestException('invalid_grant')
    }
    if (existing.refreshExpiresAt && existing.refreshExpiresAt < new Date()) {
      await this.prisma.mcpAccessToken.delete({ where: { id: existing.id } }).catch(() => undefined)
      throw new BadRequestException('invalid_grant: refresh token expired')
    }
    // rotate: drop the old token row, issue a fresh pair
    await this.prisma.mcpAccessToken.delete({ where: { id: existing.id } }).catch(() => undefined)
    return this.issueTokens(
      existing.userId,
      existing.organisationId,
      existing.clientId,
      existing.scope,
    )
  }

  // ─── Access token verification (used by McpAuthGuard) ───

  async verifyAccessToken(
    bearer: string,
  ): Promise<{ userId: string; organisationId: string; scope?: string }> {
    let payload: { sub?: string; org?: string; scope?: string; jti?: string }
    try {
      payload = this.jwt.verify(bearer, { secret: this.tokenSecret })
    } catch {
      throw new UnauthorizedException('invalid_token')
    }
    if (!payload.sub || !payload.org || !payload.jti) {
      throw new UnauthorizedException('invalid_token')
    }
    const row = await this.prisma.mcpAccessToken.findUnique({ where: { id: payload.jti } })
    if (!row) throw new UnauthorizedException('token_revoked')
    if (row.expiresAt < new Date()) {
      await this.prisma.mcpAccessToken.delete({ where: { id: row.id } }).catch(() => undefined)
      throw new UnauthorizedException('token_expired')
    }
    return { userId: row.userId, organisationId: row.organisationId, scope: row.scope ?? undefined }
  }

  async revoke(token: string): Promise<void> {
    // token may be an access JWT (revoke by jti) or a refresh token (by hash)
    try {
      const payload = this.jwt.verify(token, { secret: this.tokenSecret }) as { jti?: string }
      if (payload.jti) {
        await this.prisma.mcpAccessToken
          .delete({ where: { id: payload.jti } })
          .catch(() => undefined)
        return
      }
    } catch {
      // not a JWT — treat as refresh token
    }
    await this.prisma.mcpAccessToken
      .deleteMany({ where: { refreshTokenHash: this.hash(token) } })
      .catch(() => undefined)
  }

  // ─── Bedones session bridge (used by the authorize endpoint) ───

  /**
   * Resolve the logged-in Bedones user from the `session` cookie, reusing the
   * exact verification rules of {@link AuthGuard}.
   */
  async resolveBedonesSession(req: {
    cookies?: Record<string, string>
  }): Promise<{ id: string; name: string } | null> {
    const cookie = req.cookies?.session
    if (!cookie) return null
    try {
      const payload = this.jwt.verify(cookie) as { sessionId?: string }
      if (!payload.sessionId) return null
      const session = await this.prisma.session.findUnique({
        where: { id: payload.sessionId },
        include: { user: true },
      })
      if (!session || session.expiresAt < new Date()) return null
      return { id: session.user.id, name: session.user.name }
    } catch {
      return null
    }
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex')
  }
}
