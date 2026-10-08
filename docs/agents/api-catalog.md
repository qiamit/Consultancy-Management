# API catalog (for AI bots and the future app MCP server)

Everything here is called with the **user's own JWT** through the gateway `https://api-production-a87f8.up.railway.app`, so the DB's RLS and permission checks apply. QE Coder adds one row for every new RPC or endpoint (name, args, who can call, purpose).

## PostgREST RPCs (`POST /rest/v1/rpc/<name>`)
| RPC | Args | Who | Purpose | Since |
|---|---|---|---|---|
| `app_is_admin` | – | authenticated | Is the caller an admin (Laboratory Director)? | S4 |
| `app_module_level` | `p_path text` | authenticated | Caller's access level for a module path | S4 |
| `app_can_edit` | `VARIADIC p_paths text[]` | authenticated | Can the caller edit any of these modules? | S4 |
| `app_can_view` | `VARIADIC p_paths text[]` | authenticated | Can the caller view or edit any of these modules? | S6 |
| `set_user_role` | `p_user_id uuid, p_role text` | admin | Set `admin` / `staff` / `viewer`. An admin cannot remove their own admin role. Returns the role. | S6 |
| `get_audit_history` | `p_table text, p_row_id text, p_limit integer` | admin | Newest-first change history for one row. Secret-like keys are stripped. | S6 |
| `bis_portal_secret_set` | `p_project_id uuid, p_password text` | BIS edit | Encrypt and store one Manak password, or clear it when null/empty. Returns boolean (password exists). Never returns the password. | S6 |
| `bis_portal_secret_get` | `p_project_id uuid, p_purpose text` | `reveal`: admin; `extension_login`: BIS edit | Returns one project's password for that purpose only. Rate limit 30 / 10 min. Every call is logged without the value. Never returns a list of passwords. | S6 |
| `search_clients` | `p_search text, p_limit integer, p_offset integer, p_include_archived boolean, p_company_type text` | authenticated (RLS via SECURITY INVOKER) | Paged client search. Archived hidden unless asked. `total_count` on each row. Limit capped at 200. | S6 |
| `master_reference_counts` | `p_table text, p_ids uuid[]` | authenticated | How many rows reference these master rows | S5 |
| `delete_master_rows` | `p_table text, p_ids uuid[]` | admin | Permanently delete unreferenced master rows; returns `{deleted, blocked, storage_paths}` | S5 |
| `list_team_users` | – | authenticated (see migration) | Team user list | earlier |
| `update_team_user` | `uuid, text ×7` | authenticated (checks inside) | Update a team user profile | earlier |
| `get_public_company_brand` | – | anon + authenticated | Public logo/brand for the logged-out pages | earlier |
| `get_public_website_content` | – | anon + authenticated | Public website CMS content | earlier |

## Tables (`/rest/v1/<table>`, RLS-enforced)
Masters: `clients`, `is_codes`, `is_code_files`, `test_parameters`, `products_services_master` (insert/update = editors, delete = admin, archive via `archived_at`). Settings (admin writes): `lab_settings`, `company_settings`, `module_access_rules`, `lab_letterheads`, `lab_prefixes`. Audit: `audit_log` (admin read only).

## Functions service (`/functions/v1/<route>`, needs user JWT)
| Route | Purpose |
|---|---|
| `GET /health` | Healthcheck |
| `POST /qi-assistant` | QE Assistant chat (text reply only) |
| `POST /send-email` | Send email via Resend (never in tests) |
| `POST /send-mrm-agenda` | MRM agenda email |
| `POST /create-user`, `POST /delete-user` | Admin user management |
| `GET/POST /osl/manak-pdf` | Manak PDF upload/fetch used by the extension |
