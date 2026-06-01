# MCP connector (`/mcp`)

Exposes Bedones features as **MCP tools** so Claude (Connectors) and ChatGPT
(Apps SDK) can drive messaging, comments, catalog, tickets and business context
for a single organisation. Built on [`@rekog/mcp-nest`](https://github.com/rekog-labs/MCP-Nest)
with a hand-rolled, Prisma-backed **OAuth 2.1** layer bridged to the existing
`User` / `Session` / `Organisation` model.

## Layout

```
mcp/
├── mcp.module.ts          # @Global module: McpModule.forRoot + wiring
├── mcp-context.ts         # request.user → { userId, organisationId, role } + requireAdmin
├── auth/
│   ├── mcp-oauth.service.ts     # DCR, auth-code+PKCE, token issue/verify/refresh/revoke
│   ├── mcp-oauth.controller.ts  # /mcp/oauth/{register,authorize,authorize/decision,token,revoke}
│   ├── well-known.controller.ts # /.well-known/oauth-{authorization-server,protected-resource}
│   └── mcp-auth.guard.ts        # Bearer guard, re-validates org membership each call
└── tools/                 # @Tool providers grouped by surface + shared zod schemas
```

## How auth works

1. Client hits `POST /mcp` with no token → `McpAuthGuard` returns `401` with
   `WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource"`.
2. Client discovers the authorization server, performs **Dynamic Client
   Registration** (`/mcp/oauth/register`), then the **authorization-code + PKCE**
   flow (`/mcp/oauth/authorize`).
3. The authorize endpoint reuses the Bedones `session` cookie. If the user is not
   logged in they are redirected to `FRONTEND_URL/login?return_to=…`. Otherwise a
   **consent screen** lets them pick the organisation; the choice is baked into
   the access token (`org` claim) and re-validated on every tool call.
4. Access tokens are signed JWTs whose `jti` maps to an `McpAccessToken` row
   (revocable, mirroring the `Session` pattern). Refresh tokens are opaque +
   hashed at rest.

Mutating tools that are destructive (`delete_comment`, `update_page_settings`,
`add_faq_rule`) require an `OWNER`/`ADMIN` role; everything else is allowed for
any active member. Tools never return raw Prisma models that could leak
`accessToken`/`refreshToken` (those are also stripped by the global Prisma
`omit`).

## Env vars

| Var | Purpose | Default |
| --- | --- | --- |
| `MCP_PUBLIC_URL` | Public base URL = OAuth issuer + metadata | — (required) |
| `MCP_JWT_SECRET` | Signs MCP access tokens | falls back to `SESSION_SECRET` |
| `MCP_OAUTH_TOKEN_TTL` | Access token TTL (s) | `3600` |
| `MCP_OAUTH_REFRESH_TTL` | Refresh token TTL (s) | `2592000` |

## Run & verify locally

```bash
# 1. apply the migration + regenerate the client
pnpm --filter backend prisma migrate dev
pnpm --filter backend prisma generate

# 2. start the backend
pnpm --filter backend dev

# 3. inspect with the official MCP Inspector
npx @modelcontextprotocol/inspector
#   → connect to http://localhost:3005/mcp, run the OAuth flow, call tools
```

In **Claude**: Settings → Connectors → *Add custom connector* → URL
`https://<host>/mcp`. In **ChatGPT**: enable Developer Mode and add the same URL.

## Distribution / discoverability checklist

- [ ] Public docs page + privacy policy (privacy policy is mandatory — missing one = automatic rejection).
- [ ] `apps/frontend/public/llms.txt` kept in sync with the tool list.
- [ ] Server logo/favicon.
- [ ] Submit to the **Claude Connectors Directory** (form) — the most open channel today.
- [ ] Submit to the **ChatGPT app store** (review since 2025-12-17; note EEA/UK geo limits).
- [ ] Publish to the **MCP community registry** (`modelcontextprotocol/registry`).

## Known follow-ups

- Consolidate the inline zod schemas in `agent/tools/agent-db-tools.service.ts`
  onto `tools/tool-schemas.ts` (single source of truth for agent + MCP).
- Optional ChatGPT Apps SDK **UI widgets** (tool results already return
  structured objects, so widgets can be layered on without changing tool logic).
- Per-`clientId` rate limiting (`@nestjs/throttler`) on `/mcp/oauth/token` and `/register`.
