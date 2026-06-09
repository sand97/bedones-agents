# Debug MCP

A **second, isolated** MCP server mounted at `/debug-mcp`, completely separate
from the production MCP (`src/mcp`, `/mcp`). It lets a connected LLM (Claude,
Codex, …) **see the system from the inside** to debug the agent — without
re-doing any DevOps.

## What it can do

- **`chat_with_agent`** — run this org's live agent on a message in **DRY-RUN**:
  the real production code path runs (`runLiveAgent` — same as prod), with the
  real LLM, real catalog search and real DB **reads**, but **nothing is sent**
  to WhatsApp and **no write is committed**. Returns the full trace: ordered
  tool calls (name + args + result), the customer-facing reply that *would* have
  been sent, and the DB writes that *would* have happened.
  - Pick the model per call with `model` / `provider` (falls back to the env
    flash model). Lets you A/B models for performance/quality.
  - The response also carries **`tokenUsage`** (input/output/total + number of
    LLM calls), **`durationMs`** and **`signals`** — notably
    **`multipleSends`** (the agent sent >1 message in one turn — must NEVER
    happen) and **`replyChars`** (brevity). Use these to iterate on the system
    prompt toward short, human-like replies.
- **`list_tables` / `read_table` / `list_products`** — read-only DB access,
  restricted to an allow-list of tables, always AND-ed with the org scope.
  Sensitive columns (`passwordHash`, `accessToken`, `refreshToken`) are masked
  by the global Prisma `omit`. Secret tables (`McpAccessToken`, …) are not
  exposed.
- **`qdrant_list_indexed` / `qdrant_get_point`** — inspect what is actually
  indexed in Qdrant (payload per point), e.g. to spot a missing `currency`
  field.
- **`add_products` / `index_products`** — bulk-create products in a catalog
  (explicit list and/or N synthetic ones) and index them into Qdrant (text
  embeddings; payload **includes `currency`**, the field the prod pipeline
  omits). Fill catalogs to load-test search + agent behaviour at scale.

## Safety model

- **Org hard-pinned** via `DEBUG_MCP_ORG_ID`. Every tool resolves the org from
  this env var, **never** from a token or argument → cross-org access is
  structurally impossible.
- **OFF by default**: the module is only mounted when `DEBUG_MCP_ENABLED=true`.
- **Read-only / dry-run by default**: `chat_with_agent` runs the agent in
  dry-run (captured sends + intercepted writes); reads are read-only. The only
  real writes are `add_products` / `index_products`, intentional load-test
  seeding scoped to the pinned org.
- **OAuth, locked to one org**: auth reuses the production Bedones OAuth (so
  Claude connectors work), but a token issued for any org other than
  `DEBUG_MCP_ORG_ID` is **rejected** — only members of the pinned org can
  connect. An optional `DEBUG_MCP_TOKEN` static bearer is accepted for non-OAuth
  clients (CLI / Codex).

## Configure & connect

```bash
DEBUG_MCP_ENABLED=true
DEBUG_MCP_ORG_ID=<organisation id>
# optional, for CLI / Codex only (leave empty for OAuth-only):
DEBUG_MCP_TOKEN=<a strong random secret>
```

**From Claude (custom connector):** add a connector with URL
`<APP_URL>/debug-mcp`, leave the OAuth Client ID/Secret **empty**, click Add —
Claude runs the login + consent flow (same as the prod `/mcp`). **Pick the
`DEBUG_MCP_ORG_ID` organisation** on the consent screen, or the connection is
refused.

**From a CLI / Codex client:** `POST <APP_URL>/debug-mcp` (Streamable HTTP) with
header `Authorization: Bearer <DEBUG_MCP_TOKEN>`.

## Extending

Add a new debug tool = add a `@Tool()` method to a service in `tools/` and
register that service in `debug-mcp.module.ts`. mcp-nest scopes tool discovery
to this module, so prod tools never leak in and vice-versa.
