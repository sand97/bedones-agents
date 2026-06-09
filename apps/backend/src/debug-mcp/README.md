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
  been sent, and the DB writes that *would* have happened. This is how you
  reproduce hallucinations end-to-end.
- **`list_tables` / `read_table` / `list_products`** — read-only DB access,
  restricted to an allow-list of tables, always AND-ed with the org scope.
  Sensitive columns (`passwordHash`, `accessToken`, `refreshToken`) are masked
  by the global Prisma `omit`. Secret tables (`McpAccessToken`, …) are not
  exposed.
- **`qdrant_list_indexed` / `qdrant_get_point`** — inspect what is actually
  indexed in Qdrant (payload per point), e.g. to spot a missing `currency`
  field.

## Safety model

- **Org hard-pinned** via `DEBUG_MCP_ORG_ID`. Every tool resolves the org from
  this env var, **never** from a token or argument → cross-org access is
  structurally impossible.
- **OFF by default**: the module is only mounted when `DEBUG_MCP_ENABLED=true`.
- **Read-only / dry-run**: the only "write-ish" tool runs the agent in dry-run
  (captured sends + intercepted writes). Everything else is read-only.
- **Static bearer auth** (`DEBUG_MCP_TOKEN`), decoupled from the production
  OAuth stack. A leaked token can at most read one org's masked data and dry-run
  the agent.

## Configure & connect

```bash
DEBUG_MCP_ENABLED=true
DEBUG_MCP_ORG_ID=<organisation id>
DEBUG_MCP_TOKEN=<a strong random secret>
```

Then point an MCP client at `POST <APP_URL>/debug-mcp` (Streamable HTTP) with
header `Authorization: Bearer <DEBUG_MCP_TOKEN>`.

## Extending

Add a new debug tool = add a `@Tool()` method to a service in `tools/` and
register that service in `debug-mcp.module.ts`. mcp-nest scopes tool discovery
to this module, so prod tools never leak in and vice-versa.
