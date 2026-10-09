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
| `search_clients` | `p_search text, p_limit integer, p_offset integer, p_include_archived boolean, p_company_type text` | authenticated (RLS via SECURITY INVOKER) | Paged client search. Archived hidden unless asked. `total_count` on each row. Limit capped at 200. Masters → Clients calls it for the directory. S7 return also includes `payment_term` and `remark` (null stays null). | S7 |
| `find_similar_clients` | `p_name text, p_gstin text` | authenticated (SECURITY INVOKER) | Up to 5 similar active clients by name or exact GSTIN. Empty name returns no rows. | S7 |
| `client_certificate_files` + bucket `client-certificates` | storage path `client_id/file_id/file_name` | authenticated with `/masters/clients` view or edit | Upload, list, and delete GST, MSME, and other named certificates on the client. Max 25 MB. pdf, jpg, png, webp. | S7 |
| `certification_schemes`, `bis_offices`, `licence_statuses` | table read | authenticated who can view `/bis/projects`, admin write | BIS project form stores `certification_scheme_id`, `bis_office_id`, `licence_status_id`. | S8 |
| `is_code_amendments` | `is_code_id`, `amendment_no`, `issued_on`, `summary` | authenticated with `/masters/is-codes` | Amendment rows for one IS. IS identity columns live on `is_codes`. | S9 |
| `laboratories` | table | view if `/masters/laboratories` or `/bis/projects`; edit on `/masters/laboratories`; delete admin | Laboratory master. `legacy_client_id` points at the old client row, which is not deleted. | S10 |
| `next_document_number` | `p_doc_type text` | authenticated with edit on that finance path | Locks one `document_series` row and returns the next number (`QE/26-27/SL/0001` style). Types: QUOTATION, PROFORMA, TAX_INVOICE, CREDIT_NOTE, PAYMENT_RECEIPT. | F1 |
| `document_series` | `doc_type`, `prefix`, `next_number`, `pad_width` | finance view or admin can read; admin can update | Company Settings edits the prefix. A sample longer than 16 characters is a warning. | F1 |
| `sale_gst_supply_mode` | `p_supplier_gstin text, p_recipient_gstin text` | authenticated | `intra` when GST state codes match or either GSTIN is missing or invalid. `inter` when both are valid and the state codes differ. | F2 |
| `client_invoice_balances` | `p_client_id uuid` | authenticated (RLS on the finance tables) | Open tax invoices for one client: grand total, gross receipts linked by invoice number, linked credit notes, and outstanding. A null client returns no rows. | F3 |
| `invoice_outstanding_for` | `p_invoice_ids uuid[]` | authenticated (RLS on the finance tables) | Outstanding for up to 200 tax invoices on the list page. Same receipt and credit-note rule as `client_invoice_balances`. More than 200 ids returns no rows. | F4 |
| `invoice_age_bucket` | `p_invoice_date date, p_as_of date` | authenticated | `current` (0–30, or a missing or future date), `d31_60`, `d61_90`, or `over_90`. Days are counted from the invoice date. | F5 |
| `invoice_ageing_summary` | `p_as_of date` (default today) | authenticated (RLS on the finance tables) | Open tax invoices grouped into those four buckets. Outstanding uses the F3 rule. Settled and cancelled invoices are left out. Always returns four rows. | F5 |
| `invoice_ids_for_age_bucket` | `p_bucket text, p_as_of date, p_search text, p_limit integer, p_offset integer` | authenticated (RLS on the finance tables) | One page of open tax invoice ids in `current`, `d31_60`, `d61_90`, or `over_90`. Search matches the invoice number or client name. Limit is capped at 50. Each row includes `total_count`. An unknown bucket returns no rows. | F6 |
| `invoice_needs_reminder` | `p_invoice_date date, p_outstanding numeric, p_as_of date` | authenticated | True only when the invoice is in the Over 90 bucket and the outstanding amount is above zero. Does not send mail. | F7 |
| `invoice_settlements` | `p_client_id uuid, p_invoice_number text` | authenticated (RLS on the finance tables) | Up to 50 receipts and credit notes that name one tax invoice. Receipt amount is gross. Credit-note amount is the grand total. A blank number or a null client returns no rows. | F10 |
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
| `POST /send-email` | Send email via Resend (never in tests). F7 payment reminders use this only after the user confirms, and only for invoices `invoice_needs_reminder` allows. |
| `POST /send-mrm-agenda` | MRM agenda email |
| `POST /create-user`, `POST /delete-user` | Admin user management |
| `GET/POST /osl/manak-pdf` | Manak PDF upload/fetch used by the extension |
