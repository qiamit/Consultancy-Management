# Consultancy Pro MCP server

`https://mcp.qengineering.in/mcp`: a remote MCP server that lets Claude (claude.ai, Claude Desktop, Claude Code) read Consultancy Pro data as the signed-in user. Decision #47.

## How it works
- **OAuth 2.1 facade over GoTrue.** The self-hosted GoTrue (v2.174) has no OAuth server of its own, so this service provides one using the MCP SDK auth router:
  - `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource/mcp`
  - `/register` (DCR)
  - `/authorize`
  - `/token` (PKCE S256)
  - `/revoke`
- **Sign-in.** `/authorize` shows the QE sign-in page. It posts to `/login`, which runs a GoTrue password grant and then checks three things:
  - the user is Active
  - they have no pending forced password change
  - their Module Access for **`/tools/mcp`** (Tools → Claude Connector) is not None
- **Tokens.** Claude gets opaque tokens: `qea_…` (1 h) and `qer_…` (30 d, rotated on every refresh).
  - Only SHA-256 hashes are stored, in `mcp_oauth_tokens`.
  - The matching GoTrue session is stored AES-256-GCM encrypted with `MCP_TOKEN_KEY`. It is refreshed when it nears expiry.
  - A failed refresh revokes the connection. That happens when the user is deactivated or banned, or their session is revoked.
- **Data calls.** Every data call goes to PostgREST and Storage with **the user's own JWT**, so RLS and `app_module_level` apply. The service role is used only for the `mcp_*` bookkeeping tables.
- **Requests.** `POST /mcp` is stateless Streamable HTTP. `tools/list` shows only the tools whose module is not None for the user.
- **Audit and limits.** Every tool call is written to `mcp_audit_log` (admins can read it), with long strings truncated. Rate limits:
  - 60 tool calls per minute per user
  - 10 logins per 15 minutes per IP, and 5 per email
- **Redirect URIs.** Only `https://claude.ai/api/mcp/auth_callback`, `https://claude.com/api/mcp/auth_callback` and loopback (`http://localhost:*`, `http://127.0.0.1:*`) can register.

## Tools (v1, read-only)
`whoami`, `search_clients`, `get_client`, `search_projects`, `get_project`, `get_project_module`, `get_file_link`, `search_is_codes`, `get_is_code`, `search_laboratories`, `licences_due`.

Secret-looking keys (`password`, `secret`, `api_key`, `token`, …) are stripped from every result. Edit tools (preview → confirm → apply) come next, behind `MCP_WRITE_ENABLED`.

## Railway service `mcp`
- Source: this repo, branch `main`, root directory `backend/services/mcp` (Dockerfile build, `/health` healthcheck).
- Custom domain: `mcp.qengineering.in`. Add the CNAME Railway shows at the DNS provider.

| Variable | Value |
| --- | --- |
| `MCP_PUBLIC_URL` | `https://mcp.qengineering.in` |
| `PUBLIC_API_URL` | `https://api-production-a87f8.up.railway.app` |
| `AUTH_URL` / `REST_URL` / `STORAGE_URL` | the internal URLs, same as the `functions` service |
| `SERVICE_ROLE_KEY` | Railway reference to the existing key (never paste it) |
| `ANON_KEY` | Railway reference to the existing anon key |
| `MCP_TOKEN_KEY` | a new random value of 64+ characters, generated in the Railway dashboard |
| `MCP_ENABLED` | `true` (set `false` to switch the connector off) |
| `MCP_WRITE_ENABLED` | `false` |

Changing `MCP_TOKEN_KEY` disconnects everyone; Claude then signs in again.

## Local test
`node server.mjs` needs the variables above. Tests run against a mock GoTrue/PostgREST: register, login, PKCE, single-use code, rotation, revoke, ban, per-user tool filtering and secret stripping.
