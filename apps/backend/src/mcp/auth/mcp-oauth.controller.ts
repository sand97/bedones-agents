import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import type { Request, Response } from 'express'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../../prisma/prisma.service'
import { McpOAuthService } from './mcp-oauth.service'

/**
 * OAuth 2.1 endpoints for the MCP connector: Dynamic Client Registration,
 * authorization (with a server-rendered organisation-selection consent screen),
 * token exchange and revocation.
 */
@ApiExcludeController()
@Controller('mcp/oauth')
export class McpOAuthController {
  constructor(
    private readonly oauth: McpOAuthService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ─── Dynamic Client Registration ───

  @Post('register')
  async register(@Body() body: { redirect_uris?: string[]; client_name?: string; scope?: string }) {
    return this.oauth.registerClient(body)
  }

  // ─── Authorization endpoint (renders consent / org selection) ───

  @Get('authorize')
  async authorize(@Req() req: Request, @Res() res: Response, @Query() q: Record<string, string>) {
    const { client_id, redirect_uri, state, scope, code_challenge, code_challenge_method } = q

    if (q.response_type && q.response_type !== 'code') {
      return this.redirectError(res, redirect_uri, state, 'unsupported_response_type')
    }
    try {
      await this.oauth.assertClientRedirect(client_id, redirect_uri)
    } catch {
      return res.status(400).send('invalid client_id or redirect_uri')
    }

    const frontend = (this.config.get<string>('FRONTEND_URL') ?? '').replace(/\/$/, '')

    const user = await this.oauth.resolveBedonesSession(req)
    if (!user) {
      const returnTo = encodeURIComponent(`${this.oauth.issuer}${req.originalUrl}`)
      return res.redirect(`${frontend}/auth/login?return_to=${returnTo}`)
    }

    // Hand off to the real frontend consent screen (Antd, on-brand) carrying the
    // OAuth params. That page lists the user's organisations (via /auth/me) and
    // posts the decision back to /mcp/oauth/authorize/decision.
    const params = new URLSearchParams()
    params.set('client_id', client_id)
    params.set('redirect_uri', redirect_uri)
    if (state) params.set('state', state)
    if (scope) params.set('scope', scope)
    if (code_challenge) params.set('code_challenge', code_challenge)
    if (code_challenge_method) params.set('code_challenge_method', code_challenge_method)
    return res.redirect(`${frontend}/mcp/authorize?${params.toString()}`)
  }

  // ─── Consent decision (form POST) ───

  @Post('authorize/decision')
  async decision(@Req() req: Request, @Res() res: Response, @Body() body: Record<string, string>) {
    const { client_id, redirect_uri, state, scope, code_challenge, code_challenge_method } = body
    const organisationId = body.organisationId
    const frontend = (this.config.get<string>('FRONTEND_URL') ?? '').replace(/\/$/, '')

    const user = await this.oauth.resolveBedonesSession(req)
    if (!user) {
      // Session lost mid-flow → resume through login then back to authorize.
      const authorizeUrl = `${this.oauth.issuer}/mcp/oauth/authorize?${this.consentQuery(body, { response_type: 'code' })}`
      return res.redirect(`${frontend}/auth/login?return_to=${encodeURIComponent(authorizeUrl)}`)
    }

    try {
      await this.oauth.assertClientRedirect(client_id, redirect_uri)
    } catch {
      return res.status(400).send('invalid client_id or redirect_uri')
    }

    const membership = await this.prisma.organisationMember.findUnique({
      where: { userId_organisationId: { userId: user.id, organisationId } },
    })
    if (!membership || membership.status !== 'ACTIVE') {
      return res.redirect(`${frontend}/mcp/authorize?${this.consentQuery(body, { error: 'org' })}`)
    }

    const code = await this.oauth.createAuthCode({
      clientId: client_id,
      userId: user.id,
      organisationId,
      redirectUri: redirect_uri,
      scope,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method,
    })

    const url = new URL(redirect_uri)
    url.searchParams.set('code', code)
    if (state) url.searchParams.set('state', state)
    // Server-side 302 to the client's redirect_uri — the final hop OAuth clients
    // (ChatGPT / Claude) track to complete the connection. Must stay a real
    // redirect (not a client-side navigation).
    return res.redirect(url.toString())
  }

  // ─── Token endpoint ───

  @Post('token')
  async token(@Body() body: Record<string, string>, @Res() res: Response) {
    try {
      if (body.grant_type === 'authorization_code') {
        const tokens = await this.oauth.exchangeCode({
          code: body.code,
          clientId: body.client_id,
          redirectUri: body.redirect_uri,
          codeVerifier: body.code_verifier,
        })
        return res.json(tokens)
      }
      if (body.grant_type === 'refresh_token') {
        const tokens = await this.oauth.refresh({
          refreshToken: body.refresh_token,
          clientId: body.client_id,
        })
        return res.json(tokens)
      }
      return res.status(400).json({ error: 'unsupported_grant_type' })
    } catch (err) {
      return res
        .status(400)
        .json({ error: 'invalid_grant', error_description: (err as Error).message })
    }
  }

  // ─── Revocation ───

  @Post('revoke')
  async revoke(@Body() body: Record<string, string>) {
    if (body.token) await this.oauth.revoke(body.token)
    return {}
  }

  /** Rebuild the OAuth query string (consent params + extras) for a redirect. */
  private consentQuery(body: Record<string, string>, extra: Record<string, string> = {}): string {
    const params = new URLSearchParams()
    for (const key of [
      'client_id',
      'redirect_uri',
      'state',
      'scope',
      'code_challenge',
      'code_challenge_method',
    ]) {
      if (body[key]) params.set(key, body[key])
    }
    for (const [key, value] of Object.entries(extra)) params.set(key, value)
    return params.toString()
  }

  private redirectError(
    res: Response,
    redirectUri: string | undefined,
    state: string | undefined,
    error: string,
  ) {
    if (!redirectUri) return res.status(400).send(error)
    const url = new URL(redirectUri)
    url.searchParams.set('error', error)
    if (state) url.searchParams.set('state', state)
    return res.redirect(url.toString())
  }
}
