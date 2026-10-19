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
| `bis_portal_secret_set` | `p_project_id uuid, p_password text` | BIS edit | Legacy licence setter. The client form no longer calls it. Encrypts one project password, or clears it when null/empty. Never returns the password. | S6 |
| `bis_portal_secret_get` | `p_project_id uuid, p_purpose text` | `reveal`: admin; `extension_login`: BIS edit | Returns the firm's Manak password when the licence has a client secret, otherwise the leftover project secret. Rate limit 30 / 10 min. Logged without the value. | S6, client credentials |
| `client_portal_secret_set` | `p_client_id uuid, p_password text` | client edit or admin | Encrypt and store one firm's Manak password, or clear it when null/empty. Returns boolean (password exists). Never returns the password. Migration `20261010240000`. | client credentials |
| `client_portal_secret_get` | `p_client_id uuid, p_purpose text` | `reveal`: admin only; `extension_login`: client edit, BIS edit, or admin | Returns one firm's password for View or the extension. No copy purpose. Rate limit 30 / 10 min. Logged without the value. | client credentials |
| `search_clients` | `p_search text, p_limit integer, p_offset integer, p_include_archived boolean, p_company_type text` | authenticated (RLS via SECURITY INVOKER) | Paged client search. Archived hidden unless asked. `total_count` on each row. Limit capped at 200. Masters → Clients calls it for the directory. S7 return also includes `payment_term` and `remark` (null stays null). | S7 |
| `find_similar_clients` | `p_name text, p_gstin text` | authenticated (SECURITY INVOKER) | Up to 5 active clients with a similar firm name. Exact name is excluded (the unique index rejects it). The same GSTIN is allowed. `p_gstin` is ignored. Empty name returns no rows. | S7, AUD-01 |
| `client_certificate_files` + bucket `client-certificates` | storage path `client_id/file_id/file_name` | authenticated with `/masters/clients` view or edit | Upload, list, and delete named client documents. Optional `document_number` and `issued_on` (migration `20261009350000`, not applied until migrate). Max 25 MB. pdf, jpg, png, webp. | S7 |
| `clients.women_entrepreneur`, `clients.startup_status` | text labels | authenticated with client edit | Selected Women Entrepreneur and Startup labels. `is_women_entrepreneur` and `is_startup` stay true only when the label is Yes. Extra choices live in `client_master_options` categories `women_entrepreneur` and `startup`. Migration `20261009360000`, not applied until migrate. | S7 |
| `client_master_options` category `document_name` | `label` | authenticated with client edit | Names for the client certificate table. The list is stored in `client_master_options` only. Typing filters it. The + button adds, renames, or deletes a saved name. Seeded by migration `20261009370000`, not applied until migrate. | S7 |
| `clients` address columns | `pin_code`, `district`, `city`, `state`, `country` | authenticated who can view clients | Client form PIN and District lists. A 6-digit PIN already saved with a place fills District, State, and Country. District falls back to `city` when district is blank. The + lists stay on `client_master_options`. | S7 |
| `certification_schemes`, `licence_statuses` | table read | authenticated who can view `/bis/projects`, admin write | BIS project form stores `certification_scheme_id` and `licence_status_id`. | S8 |
| `bis_offices` | table | view if `/masters/bis-branch-offices` or `/bis/projects`; edit on `/masters/bis-branch-offices`; delete admin | BIS Branch Offices master and the project office picker. Branch Code uses `client_master_options` category `bis_branch_code`. Migration `20261010220000` seeds that list from every `bis_offices.code`. The + button adds, renames, or deletes a saved code. | S8 |
| `is_code_amendments` | `is_code_id`, `amendment_no`, `issued_on`, `summary` | authenticated with `/masters/is-codes` | Amendment rows for one IS. IS identity columns live on `is_codes`. | S9 |
| `is_code_master_options` category `document_kind` | `label` | authenticated with `/masters/is-codes` edit | Document type names on the IS Code file row. The list is stored in `is_code_master_options` only. Typing filters it. The + button adds, renames, or deletes a saved name. `is_code_files.document_kind` stores the chosen label. Seeded by migration `20261010130000`, not applied until migrate. | S9 |
| `is_code_master_options` categories `standard_prefix`, `part_no`, `section_no`, `revision_year`, `amendment_number`, `reaffirmation_year`, `unit_of_is` | `label` | authenticated with `/masters/is-codes` edit | Choices for the IS Code identity row, except IS Number, and for Unit of IS. Each list is stored in `is_code_master_options` only. Typing filters it. The + button adds, renames, or deletes a saved name. The IS row still stores the chosen text on `is_codes`. Migration `20261010140000` copies identity values once. Migration `20261010150000` copies units and seeds Tonne, Pcs, Nos, Kilo Litre, Litre, and Kg. Migration `20261010160000` seeds revision years 1950 through 2026. Migration `20261010170000` seeds reaffirmation years RA-2000 through RA-2026. Those files are not applied until migrate. The revision years, reaffirmation years, and the distinct units already stored on IS codes are also inserted for the live options list. | S9 |
| `laboratories` | table | view if `/masters/laboratories` or `/bis/projects`; edit on `/masters/laboratories`; delete admin | Laboratory master. `legacy_client_id` points at the old client row, which is not deleted. | S10 |
| `next_document_number` | `p_doc_type text` | authenticated with edit on that finance path | Locks one `document_series` row and returns the next number (`QE/26-27/SL/0001` style). Types: QUOTATION, PROFORMA, TAX_INVOICE, CREDIT_NOTE, PAYMENT_RECEIPT, PURCHASE. | F1, F11 |
| `document_series` | `doc_type`, `prefix`, `next_number`, `pad_width` | finance view or admin can read; admin can update | Company Settings edits the prefix. A sample longer than 16 characters is a warning. | F1 |
| `sale_gst_supply_mode` | `p_supplier_gstin text, p_recipient_gstin text` | authenticated | `intra` when GST state codes match or either GSTIN is missing or invalid. `inter` when both are valid and the state codes differ. | F2 |
| `client_invoice_balances` | `p_client_id uuid` | authenticated (RLS on the finance tables) | Open tax invoices for one client: grand total, gross receipts linked by invoice number, linked credit notes, and outstanding. A null client returns no rows. | F3 |
| `invoice_outstanding_for` | `p_invoice_ids uuid[]` | authenticated (RLS on the finance tables) | Outstanding for up to 200 tax invoices on the list page. Same receipt and credit-note rule as `client_invoice_balances`. More than 200 ids returns no rows. | F4 |
| `invoice_age_bucket` | `p_invoice_date date, p_as_of date` | authenticated | `current` (0–30, or a missing or future date), `d31_60`, `d61_90`, or `over_90`. Days are counted from the invoice date. | F5 |
| `invoice_ageing_summary` | `p_as_of date` (default today) | authenticated (RLS on the finance tables) | Open tax invoices grouped into those four buckets. Outstanding uses the F3 rule. Settled and cancelled invoices are left out. Always returns four rows. | F5 |
| `invoice_ids_for_age_bucket` | `p_bucket text, p_as_of date, p_search text, p_limit integer, p_offset integer` | authenticated (RLS on the finance tables) | One page of open tax invoice ids in `current`, `d31_60`, `d61_90`, or `over_90`. Search matches the invoice number or client name. Limit is capped at 50. Each row includes `total_count`. An unknown bucket returns no rows. | F6 |
| `invoice_needs_reminder` | `p_invoice_date date, p_outstanding numeric, p_as_of date` | authenticated | True only when the invoice is in the Over 90 bucket and the outstanding amount is above zero. Does not send mail. | F7 |
| `invoice_settlements` | `p_client_id uuid, p_invoice_number text` | authenticated (RLS on the finance tables) | Up to 50 receipts and credit notes that name one tax invoice. Receipt amount is gross. Credit-note amount is the grand total. A blank number or a null client returns no rows. | F10 |
| `finance_purchase_bills` | table | view or edit on `/finance/purchase/bill` | Purchase bill. `client_id` must be a client flagged Vendor or Both. | F11 |
| `purchase_outstanding_for` | `p_bill_ids uuid[]` | authenticated (RLS on the purchase tables) | Outstanding for up to 200 purchase bills: grand total minus payments made and debit notes. More than 200 ids returns no rows. | F12 |
| `finance_debit_notes` | table | view or edit on `/finance/purchase/debit-note` | Purchase debit note. Vendor must be Vendor or Both. | F12 |
| `purchase_settlements` | `p_client_id uuid, p_bill_number text` | authenticated | Up to 50 payments made and debit notes that name one purchase bill. | F12 |
| `finance_purchase_orders` | table | view or edit on `/finance/purchase/order` | Purchase order. No GST and no stock. | F13 |
| `expense_categories` | table | view or edit on `/finance/expense` or `/settings/lab` | Expense category master. | F14 |
| `finance_expenses` | table | view or edit on `/finance/expense` | Expense voucher. | F14 |
| `finance_ledger` | `p_tab text` | authenticated | Debtors, creditors, both, cash and bank. Other accounts stay empty. | F15 |
| `finance_sales_debit_notes` | table | view or edit on `/finance/sale/debit-note` | Extra charge against one tax invoice. | F17 |
| `invoice_settlement_totals` | `p_client_id uuid, p_invoice_number text` | authenticated | Net receipts, credit notes, and sales debit notes for one invoice. | F17 |
| `product_stock` | none | authenticated | Opening stock minus invoiced quantity when Lab Settings tracking is on. | F18 |
| `finance_accounts` | table | view on accounts or journal; edit on `/finance/accounts` | Chart of accounts. | F19 |
| `save_journal_entry` | `p_journal_id uuid, p_number text, p_date date, p_name text, p_lines jsonb` | authenticated, edit on `/finance/journal` | Saves a journal only when debit equals credit. | F19 |
| `finance_statement` | `p_kind text, p_from date, p_to date` | authenticated | Profit and loss for the range, or balance sheet as of the end date. | F20 |
| `finance_report` | `p_report text, p_from date, p_to date` | authenticated | GST, party, SAC/HSN, and TDS receivable rows. | F21 |
| `master_reference_counts` | `p_table text, p_ids uuid[]` | authenticated | How many outside rows reference these master rows. A client's own ON DELETE CASCADE children are not counted. | S5, AUD-02 |
| `delete_master_rows` | `p_table text, p_ids uuid[]` | admin | Permanently delete unreferenced master rows; returns `{deleted, blocked, storage_paths}`. For clients, `storage_paths` is the certificate files collected before the row is deleted. | S5, AUD-02 |
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
| `POST /send-email` | Send email via Resend (never in tests). Needs `source_path` (the app module, sent by `sendAppEmail`) with **edit** access for the caller, at most 20 recipients, and 60/hour, 300/day per user. Every attempt is logged in `email_send_log`. F7 payment reminders use this only after the user confirms, and only for invoices `invoice_needs_reminder` allows. |
| `POST /create-user`, `POST /delete-user`, `POST /set-user-password` | Admin user management (admin role only). Create sets the access role and `must_change_password`. Delete needs an Inactive user and removes the GoTrue user first; the profile goes through the FK cascade. Set-password logs the user out everywhere. All three write `audit_log` rows (`table_name = 'auth.users'`) with the calling admin's id. |
| `GET/POST /osl/manak-pdf` | Manak PDF hand-off used by the extension. `register` and `GET` need the user's session, and only the registering user can `GET`. `chunk`/`finish` use the token only (32–128 characters, chunks ≤ 200 000 base64 characters, ≤ 300 chunks, body ≤ 1 MB). Entries expire after 45 minutes. |
