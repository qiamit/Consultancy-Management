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
`whoami`, `search_clients`, `get_client`, `search_projects`, `get_project`, `get_project_module`, `get_file_link`, `search_is_codes`, `get_is_code`, `search_laboratories`, `licences_due`, and for License Non-Conformity (module `/bis/stop-marking`): `search_noncompliance_cases`, `get_noncompliance_case`, `get_noncompliance_file_link`.

Secret-looking keys (`password`, `secret`, `api_key`, `token`, …) are stripped from every result.

## Edit tools (when `MCP_WRITE_ENABLED=true`)
- Tools: `preview_update_project`, `preview_add_project_note`, `preview_update_client`, `preview_update_noncompliance_case`, `apply_change`.
- **A preview saves nothing.**
  - It returns a before → after list and a single-use `confirm_token`, valid 5 minutes and bound to this user and this Claude connection.
  - The token is stored hashed in `mcp_pending_changes` (migration `20261019200000`).
- **`apply_change` writes only after the user confirms.** It checks three things first:
  - the token is unused and not expired
  - the user still has **edit** on that module
  - none of the previewed values changed since the preview
- The write itself runs with the user's JWT, so RLS applies.
- **Whitelisted fields only.**
  - Project: stage, numbers, dates, branch and officer details, status.
  - Client: contact details.
  - Not editable: firm name, client or IS code links, portal or Manak credentials, finance fields.
- Non-Conformity case (module `/bis/stop-marking`, edit): BIS letter facts, test report sample details, failed parameters (replaces the list), observations, and the reply letter section by section (`reply_sections`, merged with what is there; `reply_draft` is kept in sync). Closing a case, files and the case's own sample / factory test report module are not editable here.
- Notes are appended (existing notes are kept). No delete tools.
- A user sees the edit tools only for modules where they have **edit**.
- `apply_change` is limited to 10 per minute per user.

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
