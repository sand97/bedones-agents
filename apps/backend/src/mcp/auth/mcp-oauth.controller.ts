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

    const user = await this.oauth.resolveBedonesSession(req)
    if (!user) {
      const frontend = (this.config.get<string>('FRONTEND_URL') ?? '').replace(/\/$/, '')
      const returnTo = encodeURIComponent(`${this.oauth.issuer}${req.originalUrl}`)
      return res.redirect(`${frontend}/login?return_to=${returnTo}`)
    }

    const memberships = await this.prisma.organisationMember.findMany({
      where: { userId: user.id, status: 'ACTIVE' },
      include: { organisation: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    })

    if (memberships.length === 0) {
      return res.status(403).send('Aucune organisation active pour ce compte.')
    }

    return res.type('html').send(
      this.renderConsent({
        userName: user.name,
        clientName: client_id,
        organisations: memberships.map((m) => ({
          id: m.organisation.id,
          name: m.organisation.name,
        })),
        query: { client_id, redirect_uri, state, scope, code_challenge, code_challenge_method },
      }),
    )
  }

  // ─── Consent decision (form POST) ───

  @Post('authorize/decision')
  async decision(@Req() req: Request, @Res() res: Response, @Body() body: Record<string, string>) {
    const user = await this.oauth.resolveBedonesSession(req)
    if (!user) return res.status(401).send('Session expirée, reconnectez-vous.')

    const { client_id, redirect_uri, state, scope, code_challenge, code_challenge_method } = body
    const organisationId = body.organisationId

    try {
      await this.oauth.assertClientRedirect(client_id, redirect_uri)
    } catch {
      return res.status(400).send('invalid client_id or redirect_uri')
    }

    const membership = await this.prisma.organisationMember.findUnique({
      where: { userId_organisationId: { userId: user.id, organisationId } },
    })
    if (!membership || membership.status !== 'ACTIVE') {
      return res.status(403).send('Organisation non autorisée.')
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

  // ─── Minimal server-rendered consent page ───

  private renderConsent(input: {
    userName: string
    clientName: string
    organisations: { id: string; name: string }[]
    query: Record<string, string | undefined>
  }): string {
    const esc = (s: string) =>
      s.replace(
        /[&<>"']/g,
        (c) =>
          ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
      )

    const hidden = Object.entries(input.query)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(String(v))}" />`)
      .join('\n')

    const options = input.organisations
      .map(
        (o, i) =>
          `<label class="org"><input type="radio" name="organisationId" value="${esc(
            o.id,
          )}" ${i === 0 ? 'checked' : ''}/> ${esc(o.name)}</label>`,
      )
      .join('\n')

    return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Bedones — Autoriser l'accès IA</title>
<style>
  body{font-family:system-ui,Segoe UI,Roboto,sans-serif;background:#f5f5f5;margin:0;padding:2rem;color:#1f1f1f}
  .card{max-width:440px;margin:3rem auto;background:#fff;border-radius:12px;padding:2rem;box-shadow:0 2px 12px rgba(0,0,0,.08)}
  h1{font-size:1.25rem;margin:0 0 .25rem}
  p{color:#595959;font-size:.9rem}
  .org{display:block;padding:.6rem .75rem;border:1px solid #e0e0e0;border-radius:8px;margin:.4rem 0;cursor:pointer}
  button{width:100%;margin-top:1rem;padding:.7rem;border:0;border-radius:8px;background:#1677ff;color:#fff;font-size:1rem;cursor:pointer}
</style></head>
<body><div class="card">
  <h1>Autoriser l'accès IA</h1>
  <p>Bonjour ${esc(input.userName)}. Une application IA souhaite gérer vos messages et commentaires via Bedones. Choisissez l'organisation à connecter.</p>
  <form method="post" action="${this.oauth.issuer}/mcp/oauth/authorize/decision">
    ${hidden}
    ${options}
    <button type="submit">Autoriser</button>
  </form>
</div></body></html>`
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
