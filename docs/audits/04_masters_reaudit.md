# 04 — Masters Re-audit (evening, 8 Oct 2026) + phased Cursor prompts

- **Repo:** `qiamit/Consultancy-Management` @ `main` **d6d47e6**, audited read-only on Amit's MacBook. Working tree clean.
- **Compared against:** the morning audit `docs/audits/02_masters_gap_audit.md` (written at 9495c4c; paths updated in d6d47e6).
- **Live DB:** read-only `SELECT`s on Railway `Postgres-MC1Y` through the Railway CLI (`railway run … node`, inside `BEGIN TRANSACTION READ ONLY`, always rolled back; no connection strings printed). Plus a few non-secret config flags from the `auth` and `rest` services.
- **Baseline checks (frontend/web):** `tsc -b` = **122 errors**, `eslint .` = **353 problems** (314 errors, 39 warnings). Both match the limits.
- **BIS sources re-checked:** fee page (latest amendment is still 10.06.2026; page last updated 14 Sep 2026) and the regional/branch office list (Raipur BO details captured for the R7 seed).

---

## 1. Status summary

**Commits since the morning audit (63f741b..HEAD):** b76f370 (knowledge search hotfix), 4e28cc0 (leaflet dep), d6d47e6 (folder restructure). **No masters code changed.** Every masters file was a pure rename (R100) into `frontend/web/src/...`, so every morning file:line reference still holds once you add the new path prefix.

**Did P1 run? No.** There is no `db:schema` / `db:types` script in `package.json`, no `backend/database/schema/`, no `live_schema.*`, no `checks.sql` and no generated `database.ts`. So I ran the P1 checks by hand against the live DB (sections 2 and 4).

| Morning items (46) | Count | IDs |
|---|---|---|
| **DONE** | **0** | none |
| **PARTIAL** (true on the live DB, but not in repo code or migrations) | **4** | MST-14, MST-21, MST-37, MST-76 |
| **OPEN** | **42** | all the others |
| Severity raised | 2 | **MST-08** Medium→**High** (lists really are cut at 10,000 rows today); **MST-03** confirmed exploitable from the internet (see MST-81) |
| **New gaps found tonight** | **7** | MST-80 … MST-86 (3 Critical) |

**Top 5 gaps right now:**
1. **MST-81 (Critical):** public sign-up is ON. `GOTRUE_DISABLE_SIGNUP=false` and `GOTRUE_MAILER_AUTOCONFIRM=true`, and the live `handle_new_user()` copies `designation` from sign-up metadata. Anyone holding the public anon key (it ships in the JS bundle) can sign up as `designation: "Admin"` and get full access. No unknown users exist yet: 5 auth users, none created in the last 30 days.
2. **MST-80 (Critical):** `public.app_users` is the old app's auth table. It has 5 rows with `email` + `password_hash`, **no RLS**, and `anon` has SELECT on it. PostgREST runs with `anon` role on schema `public`, so this table can be read without logging in.
3. **MST-82 (Critical):** the functions service `POST /create-user` checks only that the caller is logged in, not that they are an admin. Any staff user can create a new "Admin" account. `delete-user` also trusts `user_metadata.designation`, which users can edit themselves.
4. **MST-08 (High, raised):** `PGRST_DB_MAX_ROWS=10000`, but `clients` has **17,902** rows. The Client Directory, the quotation/sale-document client pickers and the consent-letter pickers fetch the whole table without paging, so about **7,900 clients (the end of the A→Z list) never show up** in those screens.
5. **MST-07 (Critical, confirmed):** **257** Manak portal passwords are stored in plain text in `bis_projects.portal_password` (average 11 characters, not encrypted). Every logged-in user can read them, and they are put into a URL (`manakExtensionBridge.ts:57`).

**Run first, today:** **R0** (one Railway setting; needs Amit's OK, no code). Then **R1** (emergency auth lockdown: migration + functions fix). Then **R2** (10,000-row cap fix) and **R3** (P1 schema snapshot). R2 and R3 don't depend on R1 and can run in parallel Cursor chats.

---

## 2. What changed since the morning: live facts that correct or confirm the 02 audit

| Topic | Morning assumption | Live fact (8 Oct, evening) | Effect |
|---|---|---|---|
| Row counts | unknown | clients **17,902** (17,873 bulk-imported Aug 2026) · bis_projects **29,777** · is_codes **1,427** · is_code_files 65 · test_parameters **164 (covering only 11 IS codes)** · products_services_master **1** · gst_rates 5 (0/5/12/18/28) · user_profiles 5 · module_access_rules 103 · license_surveillance 0 · SFR 1 · finance_quotations 1, other finance docs 0 | Finance has almost no data yet, so now is the cheapest time to fix masters |
| `is_codes.revision_year` | text or int? | **int4 NOT NULL**; reaffirmation_year int4 | MST-37 type question closed |
| `bis_projects.status` | enum may lack `stop_marking` | enum `project_status` = lead, in_progress, submitted, completed, on_hold, cancelled, **stop_marking** (581 rows use it) | MST-76 partial: the value exists, but licence status is still mixed into workflow status |
| `bis_projects.project_kind` | enum? | **text** with case drift: Licence 29,729 · **application 32 vs Application 10** · Inclusion 6 | Filters on 'Application' miss 32 rows (added to MST-76) |
| Client unique index | exact `company_name` only | **both** `idx_clients_company_name` (exact) **and** `clients_company_name_lower_trim_unique` (lower/trim, **not in any repo migration**) | MST-14 partial: case-insensitive uniqueness exists live; there is no GSTIN uniqueness, and **41 GST numbers are shared by 83 clients** |
| IS uniqueness | from the skipped baseline, may be missing | `is_codes_number_revision_unique (is_number, revision_year)` exists; 0 duplicates; 0 "IS /IEC" values (28 IEC/ISO rows look fine) | MST-32 is now a code-only bug (no bad data yet) |
| FKs into masters | | CASCADE: license_surveillance.client_id, bis_sample_failure_replies.client_id, is_code_files.is_code_id · SET NULL: bis_projects, iso_projects, transactions, all finance_* docs, quotations, bis_new/renewal_applications → clients · **test_parameters → is_codes is RESTRICT** (morning said SET NULL) | MST-04/36 evidence updated |
| Orphans | unknown | bis_projects: 1 with `client_id` NULL, **124 with `is_code_id` NULL** | Input for the R5 orphan view |
| RLS | USING(true) everywhere | **73 policies on 63 tables** are `true` for authenticated; **3 tables have no RLS**: `app_users`, `app_schema_migrations`, `_railway_migrations`; `anon` has SELECT on 69 tables | MST-02 confirmed; MST-06 narrowed; MST-80 new |
| Anon policies | | only `consultancy_lab_settings_anon_select` (USING true, so the **whole row** including bank account, IFSC, UPI) | MST-85 new |
| Auth | "verify GOTRUE_DISABLE_SIGNUP" | **`GOTRUE_DISABLE_SIGNUP=false`, `GOTRUE_MAILER_AUTOCONFIRM=true`**; the live `handle_new_user` uses designation from metadata; the app UI never calls `signUp` (`useAuth.ts:289` is unused) | MST-81 new, Critical, and safe to turn off |
| Roles | designation string | user_profiles: Admin ×2, Inspection Engineer ×3; there is **also** an old-app `profiles.role` table (admin ×2) with `current_user_is_admin()` reading it, which is a parallel role system | MST-86 |
| Secrets | | 257 plaintext portal passwords; `ai_models` has 1 API key readable by all users; `email_accounts` is correctly limited to its owner (`uid() = user_id`) | MST-07 confirmed |
| Migration history | | `app_schema_migrations` has 44 rows, latest `20261004200000`. **Not recorded:** `20261005110000`, `20261005120000`, `20261005130000`, even though their effects (index, `trg_clients_sync_name`, buckets) exist live. History has `20261004010000_website_cms.sql`, which the repo renamed to `20261004020000`. | MST-83 new. All three pending files are idempotent, so the next `npm run db:migrate` is safe (0 duplicate clients now, so the DELETE does nothing) |
| Dead tables | | `master_clients`, `nabl_scope`, `equipment_master`, `sample_receiving_options` **do not exist live**, but code still queries them (`features/masters/product-services/*`, `equipment-master/*`, `components/lims/LocationFieldWithAdd.tsx`, `lib/equipmentKind.ts`) | MST-21 partial, MST-54 confirmed |
| Client data quality | | `company_scale` = **Medium for 17,871 of 17,902** (the default during the Aug import; code also defaults to Medium at `ClientsMasterPage.tsx:248`); GST filled 1,319; 0 bad GST formats; 0 bad mobiles; 9 labs stored as clients | MST-84 new (wrong fee and concession basis) |
| Extensions | | pgcrypto, citext, uuid-ossp present; **pg_trgm is NOT installed** | R6/R14 must `CREATE EXTENSION IF NOT EXISTS pg_trgm` |
| Old-app tables still in DB | | `app_dropdown_options` (3,443 rows: BIS branch names 6, inspection/dealing officers 5 each, cities, PINs…), `service_offerings` (10 consultancy services), `app_settings` (doc-number prefix), `company_terms/scope_of_work/notes`, `portal_roles`, `profiles`, `iso_projects`, `project_documents`. New code reads **none** of them. `bis_projects` branch/officer columns are **empty** (0 distinct values). | MST-86 new; good seed sources for R7 and R12 |
| Storage | | buckets: documents, is_code_documents (old app), bis-project-files, is-code-files, calibration-files, equipment-files, laboratory-files, sample-client-references, test-method-notes, quotation-signatures | Old-bucket migration is outside masters scope |

---

## 3. Gap table (morning IDs kept; new IDs MST-80+)

Paths are relative to the repo root. `W` = `frontend/web/src`, `MIG` = `backend/database/migrations`, `FN` = `backend/services/functions/server.mjs`.

| ID | Gap | Sev | Status (evening) | Evidence | Fix → prompt |
|---|---|---|---|---|---|
| **MST-80** | Old-app `app_users` (5 rows: email + password_hash) has **no RLS** and `anon` SELECT. PostgREST anon role is `anon` on schema `public`. Same for `app_schema_migrations` and `_railway_migrations` (lower risk). | **Critical** | NEW | live: `relrowsecurity=false`; anon grants via `MIG/20260501000001…:333`, `MIG/20261003210000…:339`, `MIG/20261003220000…:120`; rest service `PGRST_DB_ANON_ROLE=anon`, `PGRST_DB_SCHEMAS=public,storage`; no code reads app_users (grep = 0) | ENABLE RLS + REVOKE from anon/authenticated → **R1** |
| **MST-81** | Open self sign-up with auto-confirm; `handle_new_user` copies `designation` from user metadata, so anyone becomes Admin | **Critical** | NEW (live-confirmed part of MST-03) | auth vars `GOTRUE_DISABLE_SIGNUP=false`, `GOTRUE_MAILER_AUTOCONFIRM=true`; `MIG/20260820000000_user_profiles_handle_new_user_email.sql:25`; live function uses designation; `W/hooks/useAuth.ts:289-299` (unused) | **R0** Railway flag + **R1** trigger rewrite |
| **MST-82** | `POST /create-user` has no admin check (service-role write of any designation); `delete-user` falls back to `user_metadata.designation` (user-editable via GoTrue `PUT /user`) | **Critical** | NEW | `FN:579-648` (only `requireUser`), `FN:666-678` | Full-access check from `user_profiles` only → **R1** |
| MST-01 | Repo migrations ≠ live schema; no snapshot or types | High | OPEN (P1 never ran) | no `db:schema` script; `backend/scripts/apply-migrations.mjs:11-36` | **R3** |
| MST-02 | RLS `USING(true)` on all masters; delete/import limits are UI-only | High | OPEN | live: 73 true-policies on 63 tables; `W/components/auth/RequireModuleAccess.tsx:51-56`; `W/features/masters/clients/ClientsFooterBar.tsx:63` | **R4** |
| MST-03 | `module_access_rules` writable by every user; designation free text; profile privilege columns editable | Critical | OPEN (worse than thought, see MST-81) | `MIG/20260813000001_module_access_rules.sql:46-65`; live policies `lims_module_access_rules_*` + `consultancy_module_access_rules_all` + `consultancy_user_profiles_all` all `true`; `W/lib/isLaboratoryDirector.ts:5-16` | admin-only writes + privilege trigger → **R1**; `role` column → **R4** |
| MST-04 | Hard deletes, no audit; client delete CASCADEs to surveillance/SFR; licences orphaned | Critical | OPEN | `MIG/20261003240000…:6,34`; `MIG/20261003190000…:27`; `W/features/masters/clients/ClientsMasterPage.tsx:949`; also `W/features/bis/projects/bisProjectsApi.ts:362`; live orphans: 124 bis_projects without IS, 1 without client; no audit table exists | **R5** |
| MST-05 | No shared data layer; quick-add skips validation | High | OPEN | 18 files `from('clients')`, 16 `from('is_codes')`; `W/features/sample-handling/receiving/AddClientDialog.tsx:292`; `AddIsCodeDialog.tsx:103-113` | **R6** (clients) / **R8** (IS) |
| MST-06 | `GRANT SELECT ON ALL TABLES … TO anon` | Medium | OPEN (narrowed: real exposure is MST-80 + MST-85) | same lines as MST-80 | **R1** (no-RLS tables) + **R4** (revoke, re-grant only what's needed) |
| MST-07 | Plaintext portal passwords (257), password in URL; `ai_models.api_key` readable by all | Critical | OPEN (confirmed) | live count 257; `W/features/bis/projects/manakExtensionBridge.ts:57` (`passwd`); `bisProjectsApi.ts:348`; live `ai_models_all` policy true | **R4** |
| MST-08 | Lists fetch the whole table; **PostgREST caps at 10,000 rows** and clients = 17,902, so about 7.9k clients are invisible | **High** (raised) | OPEN | `ClientsMasterPage.tsx:238-241`; `W/features/finance/sale/quotation/QuotationMasterPage.tsx:152-157`; `W/features/finance/sale/shared/SaleDocumentMasterPage.tsx:223-228`; `W/features/sample-handling/report-preparation/fetchConsentLetterFormData.ts:197-201,218-222`; `W/features/masters/equipment-master/EquipmentMasterPage.tsx:117`; rest `PGRST_DB_MAX_ROWS=10000` | quick paged fetch **R2** → server-side lists **R14** |
| MST-10 | No PAN/CIN/Udyam/constitution/sector/startup/women flags | High | OPEN | `W/features/masters/clients/types.ts:15-35`; live clients columns (no such fields); `W/features/bis/print/bisForm1Html.ts:436` | **R6** |
| MST-11 | One address only; no factory sites | Critical | OPEN | `bisForm1Html.ts:421-422` (office = factory = client.address) | **R6** |
| MST-12 | One contact only | High | OPEN | `bisForm1Html.ts:438`; `clients/types.ts:21-24` | **R6** |
| MST-13 | Validation gaps (no GSTIN checksum or state check; import and quick-add unvalidated) | High | OPEN | `clients/types.ts:142-158`; `ClientsMasterPage.tsx:1040-1090`; `AddClientDialog.tsx:272-292` | **R6** |
| MST-14 | Duplicate detection | High | **PARTIAL**: live has unique `lower(trim(company_name))` (not in repo); no GSTIN uniqueness, **41 GSTINs × 83 clients**; no trigram (pg_trgm missing) | live indexes; `MIG/20261005110000…:7-24`; `ClientsMasterPage.tsx:751` | record the index in a migration; GST-duplicate report + merge tool → **R6** |
| MST-15 | Option lists drift (TS vs DB); import coerces unknown values | Medium | OPEN | `clients/types.ts:1-13,57-70`; live `client_master_options` 19 rows vs `app_dropdown_options.client_master.*` 3,000+ rows (old app); payment_term has both "100 % Advance" and "100% Advance" | **R6** |
| MST-16 | Labs stored as clients (9 rows) | High | OPEN | `bisProjectsApi.ts:246-276`; live 9 "Testing Laboratory" clients | **R10** |
| MST-17 | Thin finance fields on client (no state code, credit, TDS…) | High | OPEN | `clients/types.ts:30-32`; `W/features/finance/sale/quotation/QuotationForm.tsx:413-414` | **R6** + **R13** |
| MST-18 | Raipur/Chhattisgarh defaults hard-coded | Low | OPEN | `clients/types.ts:72,177` | **R6** |
| MST-20 | No client lifecycle / account manager | Medium | OPEN | `MIG/20261003190000…:38-39`; live case_handled_by has 3 distinct values | **R6** |
| MST-21 | Legacy leftovers | Low | **PARTIAL**: `master_clients` doesn't exist live; `clients.name` sync trigger is live | code still mentions master_clients (`W/components/lims/LocationFieldWithAdd.tsx`) | **R14** |
| MST-30 | Missing BIS standard metadata (TC, dept, ICS, status, certification category…) | High | OPEN | `W/features/masters/is-codes/types.ts:18-41`; `frontend/extensions/qe-consultancy-chrome/is-code-fetch.js:866-917` | **R8** |
| MST-31 | No QCO / compulsory-certification data | High | OPEN | no table | **R8** |
| MST-32 | IS number normalisation (`IS ${rest}` breaks IS/IEC); import and quick-add don't normalise | High | OPEN (code bug; 0 bad rows so far) | `W/features/masters/is-codes/IsCodesMasterPage.tsx:1015-1020`; `AddIsCodeDialog.tsx:104` | **R8** |
| MST-33 | Amendments as one text field | Medium | OPEN | `is-codes/types.ts:23`; live `amendment_number text` | **R8** |
| MST-34 | Fees as fixed columns, no effective dates (1,381 IS rows have MMF filled) | High | OPEN | `MIG/20261004200000_is_codes_qe_fee_fields.sql:4-16`; BIS fee page latest amendment 10.06.2026 | **R9** |
| MST-35 | Product ≠ standard; no varieties/HSN | High | OPEN | `bisForm1Html.ts:440-443` (productName = IS title, isPart/isSection blank); product_manual_number filled for only 27 of 1,427 | **R8** |
| MST-36 | IS delete removes storage files before the DB delete (which RESTRICT can block) | Critical | OPEN | `IsCodesMasterPage.tsx:1106-1118`; live RESTRICT from test_parameters, surveillance, SFR | **R5** |
| MST-37 | revision_year type / label formatter | Medium | **PARTIAL**: type confirmed int4 NOT NULL; formatter not unified | `W/lib/formatIsCodeLabel.ts` | **R8** |
| MST-38 | `testing_charges` single number | Medium | OPEN | `is-codes/types.ts:26` | **R10** |
| MST-40 | No DB uniqueness on test parameters | High | OPEN (0 duplicates live) | `W/features/masters/test-parameter/TestParameterMasterPage.tsx:1112-1133` | **R11** |
| MST-41 | Requirement free text; no structured limits | Medium | OPEN | `test-parameter/types.ts:1-18` | **R11** |
| MST-42 | LIMS-only fields clutter the form | Low | OPEN | `test-parameter/types.ts:10-16` | **R11** |
| MST-50 | No consultancy service catalogue (products_services_master has 1 row) | High | OPEN | `W/features/masters/products-services/types.ts:7`; old `service_offerings` has 10 consultancy services | **R12** (seed from service_offerings) |
| MST-51 | HSN vs SAC; gst_rates has no effective dates (columns: id, rate, created_at) | Medium | OPEN | `products-services/types.ts:18`; live gst_rates | **R12**/**R13** |
| MST-52 | Inventory fields on services; no pure-agent flag | Medium | OPEN | `products-services/types.ts:16-28` | **R12** |
| MST-53 | make/category as text | Low | OPEN | `products-services/makeApi.ts:81`; `itemCategoryApi.ts:82-96` | **R12** |
| MST-54 | Dead masters shipped; **their tables don't exist live** | Low | OPEN (confirmed) | `W/features/masters/product-services/*` (nabl_scope), `equipment-master/*` (equipment_master), no routes in `W/App.tsx:67-70` | **R12**/**R14** |
| MST-60 | Two company-data sources; no PAN/TAN/CIN/state code/LUT; no FY numbering | High (finance) | OPEN (both single rows, same name/GST, so lower risk) | `MIG/20261004010000…:22-26`; live lab_settings 1 row, company_settings 1 row; numbering split across `lab_prefixes` (5 code refs, 0 rows) and old `app_settings.document_number_prefix` | **R13** |
| MST-61 | Free-text BIS option lists | Medium | OPEN | `W/features/bis/projects/bisMasterOptions.ts:4-35`; live values sit in `lab_master_options` and `app_dropdown_options.bis_application.*` | **R7** |
| MST-70 | No BIS Branch Office master | Medium | OPEN | `MIG/20261004160000…:8-9`; live branch_name empty in all 29,777 rows | **R7** (seed list in prompt) |
| MST-71 | No BIS Officer master | Medium | OPEN | `bisMasterOptions.ts:10-23` | **R7** |
| MST-72 | No Laboratory master | High | OPEN | see MST-16 | **R10** |
| MST-73 | No certification scheme master (everything treated as CM/L) | High | OPEN | `W/features/bis/projects/types.ts:32-41`; `manakExtensionBridge.ts:122-125`; live licence_number stored as bare digits | **R7** |
| MST-74 | No BIS fee master | High (finance) | OPEN | no table | **R9** |
| MST-75 | No document-type master | Medium | OPEN | `MIG/20261004120000_bis_project_files.sql:6` | **R7** |
| MST-76 | Licence status vs workflow status; kind/status types | High | **PARTIAL**: `stop_marking` in enum (581 rows); kind is text with case drift (application 32 / Application 10) | `W/features/bis/projects/types.ts:22-41` | **R7** |
| MST-77 | No state / GST state-code master | Medium | OPEN | `clients/types.ts:75-108`; live 19 distinct client states | **R6** |
| **MST-83** | Migration-history drift: 3 repo files not recorded although applied in effect; renamed file in history; live-only index `clients_company_name_lower_trim_unique` and live-only old-app tables | Medium | NEW | live `app_schema_migrations` (44 rows, latest 20261004200000) | document in **R3**; Amit runs `npm run db:migrate` once (all 3 files are idempotent) |
| **MST-84** | `company_scale` is "Medium" for 99.8% of clients (import default), and code defaults to Medium. Scale drives MMF and concessions, so fee estimates will be wrong. | High | NEW | live 17,871 Medium; `ClientsMasterPage.tsx:248` (`?? 'Medium'`) | allow "Unknown", stop defaulting, derive from Udyam → **R6** |
| **MST-85** | `lab_settings` anon SELECT policy USING(true) shows the whole row (bank account no., IFSC, UPI, phones) to unauthenticated callers; a safe RPC `get_public_company_brand()` already exists | Medium | NEW | `MIG/20260501000001_lims_compat_on_consultancy_db.sql:326-333`; `W/features/public-site/useCompanyLogoUrl.ts` uses the RPC | drop the anon policy after a grep check → **R1** |
| **MST-86** | Old-app tables left in the DB: `profiles` + `current_user_is_admin()` (parallel role system), `portal_roles`, `app_dropdown_options` (3,443), `service_offerings` (10), `app_settings`, `company_terms/scope_of_work/notes`, `iso_projects`, `project_documents`, `app_users`. Unused by the new code, confusing, and some are writable by everyone. | Medium | NEW | live tables; grep shows 0 code refs for each | lock down in **R1** (app_users), harvest seeds in **R7**/**R12**, document in **R3**, mark deprecated and lock in **R14** |

---

## 4. Live-DB evidence (read-only, for reference)

- Tables without RLS: `_railway_migrations`, `app_users`, `app_schema_migrations`. Anon SELECT grants: 69 tables.
- `true` policies for authenticated: 73 on 63 tables (incl. clients_all, is_codes_all, bis_projects_all, module_access_rules ×5, consultancy_user_profiles_all, ai_models ×2).
- Auth users: 5 (0 created in the last 30 days, 0 without a profile), so there are no signs of abuse yet.
- Enums: `project_status`, `iso_project_kind`. Views: none. Audit/history tables: none.
- Extensions: plpgsql, uuid-ossp, pgcrypto, pg_net, pg_stat_statements, supabase_vault, citext (**no pg_trgm**).
- Pending migrations `20261005110000/120000/130000` were read and are idempotent (DELETE-dedupe finds 0 rows; `CREATE … IF NOT EXISTS`; `DROP TRIGGER IF EXISTS`; buckets `ON CONFLICT`).

---

## 5. Phased Cursor prompts (run in this order)

| Order | Prompt | Covers | When |
|---|---|---|---|
| 0 | **R0** Railway: turn off public sign-up (not a Cursor prompt) | MST-81 | **Today, first.** Needs Amit's OK |
| 1 | **R1** Emergency auth and exposure lockdown | MST-80, 81, 82, 03 (writes), 85 | **Today** |
| 2 | **R2** Fix the 10,000-row cap on client lists/pickers | MST-08 (quick part) | **Today** (independent of R1) |
| 3 | **R3** Live schema snapshot + DB types + drift doc (old P1) | MST-01, 83, 86 (doc) | **Today** (independent) |
| 4 | **R4** RLS by module, roles, portal secrets, ai_models (old P2 minus R1) | MST-02, 03 (role), 06, 07 | After R1 applied |
| 5 | **R5** Audit log, archive, safe delete (old P3) | MST-04, 36 | After R4 |
| 6 | **R6** Client Master v2 (old P4 + scale + GST duplicates) | MST-05c, 10–15, 17, 18, 20, 77, 84 | After R5 |
| 7 | **R7** BIS reference masters (old P5 + seeds) | MST-61, 70, 71, 73, 75, 76 | After R6 |
| 8 | **R8** IS Code Master v2 (old P6) | MST-05i, 30–33, 35, 37 | After R7 |
| 9 | **R9** BIS fee master (old P7) | MST-34, 74 | After R6 + R8 |
| 10 | **R10** Laboratory master (old P8) | MST-16, 38, 72 | After R8 |
| 11 | **R11** Test Parameter v2 (old P9) | MST-40–42 | After R8 |
| 12 | **R12** Consultancy service catalogue (old P10) | MST-50–54 | After R7 + R9 |
| 13 | **R13** Company profile + finance readiness (old P11) | MST-60, 17, 51 (GST dates) | After R6; **last step before Finance** |
| 14 | **R14** Server-side lists + legacy cleanup (old P12) | MST-08, 21, 54, 86 | Any time after R2 + R5 |

**Every prompt below already contains these house rules** (repeated so each prompt stands alone):
new migration files only (Amit applies them); never edit applied migrations; never run `npm run db:migrate`/railway/psql; never read or print secrets; no commit or push unless Amit says "commit"; build must pass; typecheck ≤ 122; lint ≤ 353.

Tip: copy this file to `docs/audits/04_masters_reaudit.md` in the repo so Cursor can read it. The prompts work without it too.

---

### R0: Railway setting (no Cursor; needs Amit's explicit OK)

Not a Cursor prompt. On the Railway `auth` service, set `GOTRUE_DISABLE_SIGNUP=true` (it is `false` now). The app never calls `signUp`. Users are created only through Settings → Users, which goes to `functions /create-user` → GoTrue admin API, and that keeps working with sign-up disabled. The auth service restarts for about 1–2 minutes.

**Hindi:** Railway पर `auth` service में एक setting बदलनी है: `GOTRUE_DISABLE_SIGNUP=true`। अभी ये `false` है। इसका मतलब है कि इंटरनेट पर कोई भी, हमारी website के JS में मौजूद public key से, खुद sign-up कर सकता है और अपना designation "Admin" लिखकर पूरा access ले सकता है। अभी तक ऐसा कोई अनजान user नहीं बना है (कुल 5 users हैं, पिछले 30 दिन में कोई नया नहीं)। App में "Sign up" कहीं इस्तेमाल नहीं होता, नए users सिर्फ़ Settings → Users से बनते हैं, और वो रास्ता चलता रहेगा। Code में कोई बदलाव नहीं है। Auth service 1–2 मिनट restart होगी। आप "हाँ" कहें तो ये setting Railway पर कर दी जाएगी।

---

### R1: Emergency auth and exposure lockdown (MST-80, 81, 82, 03-writes, 85)

```text
Repo: Consultancy Management (frontend/web = Vite React app; backend/database/migrations = SQL for the self-hosted Railway Postgres behind GoTrue/PostgREST; backend/services/functions/server.mjs = Node functions service). Read .cursorrules, .cursor/rules/10-database-migrations.mdc, docs/audits/02_masters_gap_audit.md (MST-03, MST-06) and, if present, docs/audits/04_masters_reaudit.md (MST-80..82, 85) first.

GOAL
Close the critical holes that let an outsider or a normal staff user become admin or read password hashes. Keep it small and safe: this is NOT the full RLS rework (that comes later).

LIVE FACTS (verified read-only on the production DB; trust these over old migrations)
- public.app_users (old app, 5 rows: email, password_hash, raw_user_meta_data) has RLS DISABLED and anon has SELECT. PostgREST anon role = anon, schemas = public,storage. No frontend/backend code reads app_users (grep it to confirm). Same "no RLS" state for public.app_schema_migrations and public._railway_migrations.
- public.handle_new_user() (trigger on auth.users) copies designation from raw_user_meta_data (repo version: backend/database/migrations/20260820000000_user_profiles_handle_new_user_email.sql:25). GoTrue sign-up is currently open with auto-confirm, so self-registered users can choose "Admin".
- module_access_rules live policies, all USING/WITH CHECK true for authenticated: lims_module_access_rules_select/insert/update/delete and consultancy_module_access_rules_all.
- user_profiles live policy: consultancy_user_profiles_all (ALL, true). Columns: id, full_name, email, designation, department_name, division, status, mobile, created_at, updated_at. Current designations: 'Admin' (2), 'Inspection Engineer' (3); status 'Active'.
- lab_settings has an anon policy consultancy_lab_settings_anon_select USING(true) (from 20260501000001_lims_compat_on_consultancy_db.sql:326-333) that exposes the whole row (bank account, IFSC, UPI) to unauthenticated callers. A safe SECURITY DEFINER RPC public.get_public_company_brand() already exists and frontend/web/src/features/public-site/useCompanyLogoUrl.ts uses it.
- backend/services/functions/server.mjs: handleCreateUser (~579-648) only calls requireUser(), with no admin check, then writes user_profiles with the service-role key. handleDeleteUser (~650-690) checks the caller's designation but falls back to caller.user_metadata.designation (user-editable through GoTrue PUT /user). FULL_ACCESS_DESIGNATIONS (~16-28) mirrors frontend/web/src/lib/isLaboratoryDirector.ts.
- public.update_team_user / list_team_users are SECURITY DEFINER and already check the caller's designation (20261003230000_sync_app_users_to_gotrue.sql:194-318). Don't break them.

DO
A) New migration backend/database/migrations/20261008130000_emergency_auth_lockdown.sql (check that its timestamp is later than the newest file; newest today is 20261005130000). Idempotent, guarded with to_regclass/IF EXISTS:
  1. public.app_is_admin() RETURNS boolean, LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public: true when the auth.uid() row in user_profiles has lower(trim(status)) = 'active' (treat NULL status as active) and lower(trim(designation)) is in ('laboratory director','admin','administrator','director','super admin','managing director'), the exact same list as isLaboratoryDirector.ts. GRANT EXECUTE to authenticated.
  2. For app_users, app_schema_migrations, _railway_migrations: ALTER TABLE ... ENABLE ROW LEVEL SECURITY; REVOKE ALL ON TABLE ... FROM anon, authenticated. Add no policies (service_role and the table owner keep access; backend/scripts/apply-migrations.mjs connects as the owner, so it keeps working). COMMENT ON TABLE app_users 'legacy Consultancy Pro auth table — not used by the app; do not expose'.
  3. CREATE OR REPLACE FUNCTION public.handle_new_user(): keep everything the current repo version does (read 20260820000000 and any later redefinition in the migrations folder; keep the same columns and ON CONFLICT behaviour), EXCEPT: designation is always '' on insert (never read from raw_user_meta_data), and on conflict it must not overwrite an existing designation or status. The trusted path (functions /create-user) upserts designation itself with the service role afterwards. Keep SECURITY DEFINER and search_path.
  4. module_access_rules: DROP POLICY IF EXISTS for the 5 policies named above; create module_access_rules_select (SELECT, authenticated, true), and module_access_rules_admin_insert / _admin_update / _admin_delete using public.app_is_admin().
  5. user_profiles: replace consultancy_user_profiles_all with user_profiles_select (authenticated, true; the team list needs it), user_profiles_insert (WITH CHECK app_is_admin() OR id = auth.uid()), user_profiles_update (USING app_is_admin() OR id = auth.uid()), user_profiles_delete (app_is_admin()). Add a BEFORE UPDATE trigger user_profiles_guard_privileged(): when auth.uid() IS NOT NULL and NOT app_is_admin() and (designation, status, department_name, division or email changed), RAISE EXCEPTION 'Only an admin can change designation/status/department'. (auth.uid() is NULL for service-role and migration connections, so those are allowed.)
  6. lab_settings: first grep the frontend for any code that reads lab_settings while logged OUT (public site, login page). If you find none, DROP POLICY IF EXISTS consultancy_lab_settings_anon_select. If something does need it, switch that code to get_public_company_brand() (extend that RPC with only the public fields it needs, no bank fields) in the same change, then drop the policy.
  7. At the end, a commented "MANUAL TEST" block with SQL Amit can run after applying: relrowsecurity for the 3 tables; has_table_privilege('anon','public.app_users','select') = false; pg_policies for module_access_rules/user_profiles; a test showing that a non-admin uid cannot update module_access_rules (use set_config('request.jwt.claims', ...) inside a rolled-back transaction).

B) backend/services/functions/server.mjs:
  - Add async function requireFullAccess(req): calls requireUser, then reads the caller's designation and status from user_profiles via rest() (service role). Returns 403 'Forbidden' unless status is active and hasFullAccessDesignation(designation). NEVER fall back to user_metadata.
  - handleCreateUser and handleDeleteUser both use requireFullAccess. Remove the user_metadata fallback in handleDeleteUser.
  - Keep request/response shapes the same so frontend/web/src/features/settings/user-management/UserManagementMasterPage.tsx (~429, ~570) keeps working. Run `npm run functions:check`.

C) frontend/web/src/hooks/useAuth.ts: delete the unused signUp export (grep first; if anything imports it, leave it and tell me).

CONSTRAINTS / HOUSE RULES
- Schema changes only in the NEW migration above. Never edit, rename or delete an existing migration. Never run npm run db:migrate, backend/scripts/apply-migrations.mjs, psql or the railway CLI. Amit applies migrations himself.
- Never open, print or copy .env, .railway-secrets.env or any secret value.
- No commit or push unless Amit says "commit". (Note: the functions service redeploys on Railway only after a push.)
- Keep existing data and Hindi labels. Don't change other tables' policies in this prompt.
- Verify: npm run typecheck (≤ 122 errors, baseline 122), npm run lint (≤ 353 problems, baseline 353), npm run build (must pass), npm run functions:check. Report before/after counts.

REPORT
List the policies dropped and created, the new functions and trigger, and the functions-service changes. Then the exact steps for Amit: (1) apply with `npm run db:migrate` (this also records 3 older idempotent files that were never logged: 20261005110000/120000/130000; that is expected and safe), (2) commit and push so Railway redeploys `functions`, (3) test: an Inspection Engineer cannot open module access or create users; an Admin still can.
```

**Hindi:** ये prompt आज ही चलाना है। इससे 3 critical security holes बंद होंगे। (1) पुराने app की `app_users` table, जिसमें 5 users के email और password hash हैं, अभी बिना login के पढ़ी जा सकती है। Cursor एक नई migration बनाएगा जो इस पर RLS चालू करके public access हटा देगी। (2) Sign-up के समय कोई भी अपना designation "Admin" लिख सकता था। अब नए user का designation हमेशा खाली रहेगा, और सिर्फ़ Admin ही Settings से designation देगा। (3) `functions` service का "create user" endpoint कोई भी logged-in user call कर सकता था। अब सिर्फ़ Admin या Director कर पाएँगे। इसके अलावा Module Access के rules अब सिर्फ़ Admin बदल पाएगा, और कोई user अपना designation या status खुद नहीं बदल पाएगा। Login page से company के bank details भी नहीं दिखेंगे। Data कोई नहीं मिटेगा, कोई पुरानी migration नहीं छुई जाएगी, commit आपके कहने पर ही होगा। Migration आप `npm run db:migrate` से apply करेंगे। उसके साथ 5 अक्टूबर की 3 पुरानी migrations भी record हो जाएँगी, जो पहले से safe और idempotent हैं। फिर push करने पर functions service redeploy होगी।

---

### R2: Fix the 10,000-row cap on client lists and pickers (MST-08, quick part)

```text
Repo: Consultancy Management. Read .cursorrules and docs/audits/02_masters_gap_audit.md (MST-08) first.

PROBLEM (verified on production)
PostgREST is configured with PGRST_DB_MAX_ROWS=10000, and public.clients has 17,902 rows. Every query that loads clients without paging silently gets only the first 10,000 rows (ordered by company_name), so about 7,900 clients near the end of the alphabet never appear. Affected:
- frontend/web/src/features/masters/clients/ClientsMasterPage.tsx loadClients (~238-241): Client Directory, its export, its district list
- frontend/web/src/features/finance/sale/quotation/QuotationMasterPage.tsx (~152-157): quotation client picker
- frontend/web/src/features/finance/sale/shared/SaleDocumentMasterPage.tsx (~223-228): sale document client picker
- frontend/web/src/features/sample-handling/report-preparation/fetchConsentLetterFormData.ts (~197-201, ~218-222): consent letter pickers
- frontend/web/src/features/masters/equipment-master/EquipmentMasterPage.tsx (~117): dead module, skip it
Then grep the whole of frontend/web/src for any other `.from('<table>').select(` on clients, bis_projects or is_codes with no .range/.limit/.eq('id'...)/.maybeSingle/head:true, and list them.

DO (frontend only, no migration)
1. Create frontend/web/src/lib/fetchAllRows.ts: `fetchAllRows<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, { pageSize = 1000, max = 100000 })`. It loops with .range(from, from+pageSize-1) until a short page comes back, throws on error, and needs a stable order (callers must order by company_name AND id to avoid duplicate or missing rows across pages). Add a small `dedupeById` guard.
2. Use it in the 4 live places above, keeping the exact same select columns, ordering, retries and mapping. In ClientsMasterPage keep the client-side search/sort/pagination exactly as is (the server-side rewrite comes later in another prompt). Show the real total in the list footer.
3. For the quotation and sale pickers: if they render a plain dropdown of all rows, keep the behaviour, but make sure the list virtualises or filters as the user types so 18k options don't freeze the UI. Reuse the existing FilterCombobox/search pattern if the picker already has one; don't redesign the UI.
4. Add a dev-only console.warn in fetchAllRows when the total exceeds 20,000, so we notice before the next limit.

HOUSE RULES
- No migration in this prompt. Never edit applied migrations. Never run db:migrate/railway/psql.
- Never open, print or copy .env, .railway-secrets.env or any secret.
- No commit or push unless Amit says "commit".
- Keep Hindi labels and the current look.
- Verify: npm run typecheck (≤ 122, baseline 122), npm run lint (≤ 353, baseline 353), npm run build (must pass). Report before/after counts.

ACCEPTANCE
- Client Directory footer shows about 17,902 clients (not 10,000); searching a name starting with "Z" or "Y" finds it.
- The quotation/sale client picker can find the same late-alphabet client.
- Export CSV contains all rows.
REPORT: files changed, the extra whole-table queries you found (file:line), and anything you did not change.
```

**Hindi:** अभी database में 17,902 clients हैं, पर Railway का API एक बार में ज़्यादा से ज़्यादा 10,000 rows ही भेजता है। इसलिए Client Directory, Quotation/Invoice के client picker और Consent Letter में लगभग 7,900 clients (A→Z list के आखिर वाले, जैसे S, T, Y, Z से शुरू होने वाले) दिखते ही नहीं हैं। ये prompt एक छोटा helper (`fetchAllRows`) बनाएगा जो data 1,000-1,000 के टुकड़ों में लाकर पूरी list जोड़ देगा। सिर्फ़ frontend बदलेगा। Database, migration या UI design में कोई बदलाव नहीं होगा। Cursor ऐसी बाकी जगहें भी ढूँढकर बताएगा। बाद में R14 में इसे server-side search में बदलेंगे, ताकि list और तेज़ चले।

---

### R3: Live schema snapshot, DB types and drift documentation (old P1; MST-01, 83, 86)

```text
Repo: Consultancy Management. Read .cursorrules, .cursor/rules/10-database-migrations.mdc, backend/database/README.md, docs/audits/02_masters_gap_audit.md (MST-01, section D/P1) first.

GOAL
The repo's migrations don't describe the live database. Build tooling so the real schema can be dumped, committed and typed. Write down the known drift. Do NOT connect to any database yourself.

KNOWN DRIFT (verified read-only on production today; write it into the README)
- backend/scripts/apply-migrations.mjs SKIP_FILES (~lines 11-36) skips the LIMS baseline, the products/finance stack and 20261003190000_consultancy_bis_domain.sql.
- public.app_schema_migrations (columns filename, applied_at) has 44 rows, latest 20261004200000_is_codes_qe_fee_fields.sql. NOT recorded although their effects exist live: 20261005110000_clients_company_name_unique.sql, 20261005120000_clients_sync_name_column.sql, 20261005130000_ensure_lims_storage_buckets.sql (all idempotent). History contains 20261004010000_website_cms.sql, which the repo now names 20261004020000_website_cms.sql.
- Live-only objects not created by any repo migration: unique index clients_company_name_lower_trim_unique ON clients (lower(trim(company_name))); function current_user_is_admin() (reads public.profiles.role); old Consultancy Pro tables app_users, profiles, portal_roles, app_dropdown_options, service_offerings, app_settings, company_terms, company_scope_of_work, company_notes, iso_projects, project_documents, transactions, bis_renewal_applications, finance_* tables; legacy columns clients.name/phone/notes/city, is_codes.is_code_title/aspect_of_is, test_parameters.test_name/unit/specified_value.
- Tables the code references that do NOT exist live: master_clients, nabl_scope, equipment_master, sample_receiving_options.
- Types: is_codes.revision_year int4 NOT NULL; bis_projects.project_kind text (values Licence / Application / application / Inclusion); bis_projects.status enum project_status (lead,in_progress,submitted,completed,on_hold,cancelled,stop_marking).
- Extensions present: pgcrypto, citext, uuid-ossp, pg_net, pg_stat_statements, supabase_vault. pg_trgm is NOT installed.
- PostgREST: PGRST_DB_MAX_ROWS=10000, anon role on schemas public,storage.

DO
1. backend/scripts/dump-schema.mjs (Node ESM, reuse the existing `pg` dependency from the root package.json). It reads DATABASE_URL from process.env ONLY (never reads .env files, never prints the URL or the host) and opens a READ ONLY transaction. It introspects schema public: tables, columns (type, default, nullability), constraints, indexes, FKs with ON DELETE rule, enums, views, functions (name, args, security definer), triggers, the RLS flag, policies, and the table grants for anon/authenticated. It writes backend/database/schema/live_schema.json, plus live_schema.sql via `pg_dump --schema-only --schema=public --no-owner --no-privileges` when pg_dump is on PATH (skip with a note otherwise). Exit with a clear message if DATABASE_URL is missing.
2. backend/scripts/gen-db-types.mjs: live_schema.json → frontend/web/src/types/database.ts (Row/Insert/Update per table, enums as string unions). Commit only a placeholder database.ts with the header "generated — run npm run db:schema && npm run db:types". Don't invent columns.
3. Root package.json scripts: "db:schema": "node backend/scripts/dump-schema.mjs", "db:types": "node backend/scripts/gen-db-types.mjs".
4. backend/database/schema/README.md: how Amit runs it (`railway run --service Postgres-MC1Y -- npm run db:schema`, then `npm run db:types`), that both outputs are committed, and a "Known drift" section with every fact above. Add a "Legacy tables (old Consultancy Pro)" table: name, purpose, used by new code? (no), plan (keep / harvest seed / archive).
5. backend/database/schema/checks.sql (read-only queries, NOT a migration): tables without RLS; policies USING(true); anon SELECT grants; FKs into clients/is_codes with CASCADE/SET NULL; unique indexes on clients and is_codes; repo-vs-history migration diff (as a comment explaining how to compare); duplicate GSTINs (column clients.gst_number); clients by company_scale; bis_projects by project_kind; NULL client_id/is_code_id counts on bis_projects.
6. Add one line to backend/database/README.md pointing to schema/README.md.

HOUSE RULES
- No migration in this prompt. Never edit applied migrations. Never run db:migrate, the railway CLI or psql yourself. Amit runs the dump.
- Never open, print or copy .env, .railway-secrets.env or any secret.
- No commit or push unless Amit says "commit".
- Verify: npm run typecheck (≤ 122, baseline 122), npm run lint (≤ 353, baseline 353), npm run build (must pass). Report before/after counts.

ACCEPTANCE
- `npm run db:schema` without DATABASE_URL exits with a clear message and prints no secrets.
- README documents the drift; checks.sql exists; database.ts placeholder exists.
Finally set MST-01 to IN-PROGRESS in docs/audits/02_masters_gap_audit.md (Amit marks it DONE after running the dump).
```

**Hindi:** सुबह का P1 कभी चला ही नहीं था, ये उसी का नया version है। Cursor दो scripts बनाएगा। पहला live database की पूरी structure (tables, columns, indexes, policies) एक JSON/SQL file में निकालेगा, दूसरा उससे TypeScript types बनाएगा। Cursor खुद database से नहीं जुड़ेगा, script आप Railway से चलाएँगे। आज मैंने जो फ़र्क पकड़े, वो सब एक README में लिखे जाएँगे: कौन-सी migrations record नहीं हुईं, पुराने app की कौन-सी tables अभी भी पड़ी हैं, और code किन tables को ढूँढता है जो live पर हैं ही नहीं। एक `checks.sql` भी बनेगी, जिससे आप कभी भी जाँच सकें। App का behaviour नहीं बदलेगा, कोई migration नहीं बनेगी।

---

### R4: RLS by module, admin role, portal secrets, ai_models (old P2 minus what R1 did; MST-02, 03, 06, 07)

```text
Repo: Consultancy Management. Read .cursorrules, .cursor/rules/10-database-migrations.mdc, docs/audits/02_masters_gap_audit.md (MST-02, 03, 06, 07 and section D/P2) and backend/database/schema/README.md (+ live_schema.json if present) first. Prerequisite: the R1 migration 20261008130000_emergency_auth_lockdown.sql exists (it defines public.app_is_admin()). If it's missing, stop and tell me.

LIVE FACTS
- 73 policies on 63 public tables are USING(true) for authenticated. anon has SELECT on 69 tables (from GRANT SELECT ON ALL TABLES ... TO anon in 20260501000001:333, 20261003210000:339, 20261003220000:120).
- 257 rows in bis_projects have plaintext portal_password (portal_user_id + portal_password text). frontend/web/src/features/bis/projects/manakExtensionBridge.ts:57 puts it in the URL as `passwd`; bisProjectsApi.ts ~348 saves it.
- ai_models (1 row, api_key filled) has policies ai_models_all and consultancy_ai_models_all = true for all authenticated users.
- email_accounts is already owner-scoped (uid() = user_id). Leave it.
- pgcrypto is installed.

DO: new migration backend/database/migrations/<timestamp later than newest>_rls_by_module_and_secrets.sql (idempotent)
1. user_profiles.role text CHECK (role in ('admin','staff','viewer')) DEFAULT 'staff'; backfill 'admin' where the designation is in the full-access list. Update app_is_admin() to return true for role='admin' OR the designation list. Only admins can change role (extend R1's guard trigger).
2. public.app_module_level(p_module text) returns 'none'|'view'|'edit'|'full', SECURITY DEFINER STABLE. Mirror frontend/web/src/lib/moduleAccess.ts and features/settings/module-access/resolveModuleAccess.ts exactly (read them; replicate defaults and designation matching). Admin → 'full'.
3. Per-command policies on the master tables: clients, client_master_options, is_codes, is_code_files, is_code_master_options, test_parameters, test_parameter_units, accreditation_bodies, products_services_master, product_item_categories, product_makes, gst_rates, lab_master_options, lab_settings, company_settings. SELECT for authenticated; INSERT/UPDATE when app_module_level('<key>') in ('edit','full'); DELETE only app_is_admin(). Get the module keys from lib/appNav.ts / moduleCatalog.ts. Drop the old true policies by name: look them up in pg_policies inside a DO block, and only for these tables.
4. REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM anon. Re-grant only what logged-out pages need: grep the public site (features/public-site, website CMS) for anon reads. The CMS uses the RPC get_public_website_content() and the logo uses get_public_company_brand(), so ideally no table grants are needed. Loop over pg_tables in public and ENABLE ROW LEVEL SECURITY on any table still without it.
5. Portal credentials: table client_portal_accounts (id, client_id FK clients ON DELETE RESTRICT, portal text CHECK in ('manak','crs','fmcs','hallmarking','other'), username, secret_enc bytea, notes, created_by, updated_at). Encrypt with pgp_sym_encrypt using current_setting('app.portal_secret_key', true); RAISE a clear error if it is not set. Backfill from bis_projects.portal_user_id/portal_password ONLY when the key is set (otherwise RAISE NOTICE and skip). Add bis_projects.portal_account_id FK. RPC reveal_portal_secret(p_account uuid) RETURNS text: admin or edit-level on the BIS module, and it logs each call into portal_secret_access_log (user, account, at). Keep the old columns, with COMMENT 'deprecated — clear after verification'.
6. ai_models: view ai_models_public without api_key; SELECT on the base table for admins only; switch all frontend reads except the AI settings page to the view. Check backend/services/functions (qiAssistant) reads ai_models with the service role so it is unaffected.
7. A commented MANUAL TEST block at the end (non-admin cannot delete clients, cannot write module_access_rules; anon cannot select clients).

FRONTEND
- lib/permissions.ts: canEdit(moduleKey) / canDelete(), loaded once from the auth context.
- RequireModuleAccess: in view mode, hide or disable save/delete/import buttons (not only CSS).
- Manak bridge: never put a password in a URL. Call reveal_portal_secret, then send the credentials to the extension content script with window.postMessage, and have the listener in frontend/extensions/qe-consultancy-chrome (and safari) check event.origin against the allowed app origins (https://qengineering.in, https://www.qengineering.in, the frontend Railway domain, localhost in dev). Auto-login must keep working.
- BIS project form: the portal password field goes through client_portal_accounts (masked, with a "Reveal" button that calls the RPC).

HOUSE RULES
- New migration only. Never edit, rename or delete applied migrations. Never run db:migrate/railway/psql. Amit applies migrations himself.
- Never open, print or copy .env, .railway-secrets.env or any secret.
- No commit or push unless Amit says "commit".
- Keep data and Hindi labels; grep every usage before changing a table.
- Verify: npm run typecheck (≤ 122, baseline 122), npm run lint (≤ 353, baseline 353), npm run build (must pass). Report before/after counts.

REPORT
Policies created/dropped per table, new functions, frontend changes, and the exact Railway step for Amit (without any value): set the database parameter app.portal_secret_key (ALTER DATABASE <db name> SET app.portal_secret_key = '<long random key chosen by Amit>') BEFORE applying, so the backfill encrypts the 257 passwords. Set MST-02/03/06/07 to IN-PROGRESS.
```

**Hindi:** R1 के बाद ये बड़ा security काम है। अभी हर logged-in user हर master (Clients, IS Codes वगैरह) में कुछ भी बदल या delete कर सकता है, क्योंकि रोक सिर्फ़ screen पर है, database में नहीं। ये prompt database में module-wise permission लगाएगा: देखना सबको, बदलना सिर्फ़ जिनके पास "edit" access है, और delete सिर्फ़ Admin। Manak portal के 257 passwords अभी सादे text में पड़े हैं और URL में भी जाते हैं। इन्हें encrypt करके नई table में रखा जाएगा, "Reveal" button से ही खुलेंगे और हर reveal का log बनेगा। Extension को password अब URL से नहीं, सुरक्षित message से मिलेगा। AI की API key सिर्फ़ Admin देख पाएगा। Apply करने से पहले आपको Railway database पर एक secret key set करनी होगी, उसका तरीका Cursor बताएगा। कोई data नहीं मिटेगा।

---

### R5: Audit log, archive, safe delete (old P3; MST-04, MST-36)

```text
Repo: Consultancy Management. Read .cursorrules, .cursor/rules/10-database-migrations.mdc, docs/audits/02_masters_gap_audit.md (MST-04, MST-36, section D/P3) and backend/database/schema/README.md first. Use public.app_is_admin() and app_module_level() from earlier migrations (if missing, stop and tell me).

LIVE FACTS
- FKs into clients: license_surveillance.client_id and bis_sample_failure_replies.client_id are ON DELETE CASCADE; bis_projects, iso_projects, transactions, quotations, bis_new_applications, bis_renewal_applications, finance_quotations/sales_orders/proforma_invoices/tax_invoices/credit_notes/customer_statements → clients are SET NULL.
- FKs into is_codes: is_code_files CASCADE; bis_projects and bis_new_applications SET NULL; test_parameters, license_surveillance and bis_sample_failure_replies RESTRICT.
- Hard deletes: frontend/web/src/features/masters/clients/ClientsMasterPage.tsx ~949; IsCodesMasterPage.tsx ~1106-1118 (removes storage objects BEFORE the DB delete, which RESTRICT can then block); bis/projects/bisProjectsApi.ts ~362.
- No audit/history table exists. bis_projects has 1 row with NULL client_id and 124 with NULL is_code_id.

DO: new migration <timestamp>_master_audit_archive.sql (idempotent)
1. audit_log (id bigserial, table_name, row_id text, action char(1), changed_by uuid default auth.uid(), changed_at timestamptz default now(), old_data jsonb, new_data jsonb, diff jsonb) + audit_row_change() trigger (SECURITY DEFINER; skips when nothing changed; strips secret columns such as portal_password/secret_enc/api_key). Attach it to clients, is_codes, is_code_files, test_parameters, products_services_master, lab_settings, company_settings, module_access_rules, user_profiles, bis_projects. RLS: SELECT admin only; no direct writes.
2. On the master tables add, IF NOT EXISTS: is_active boolean default true, archived_at, archived_by, updated_by. Add created_by only where it's missing (clients and is_codes already have created_by). Trigger to set updated_at/updated_by.
3. Change to ON DELETE RESTRICT: license_surveillance.client_id, bis_sample_failure_replies.client_id, bis_projects.client_id, and every other FK into clients/is_codes listed above, EXCEPT is_code_files (keep CASCADE, but delete through the RPC). Look up constraint names in pg_constraint inside DO blocks.
4. master_reference_counts(p_table text, p_id uuid) → table(ref_table, ref_count), found dynamically through pg_constraint.
5. delete_master_row(p_table, p_id) SECURITY DEFINER: whitelist of tables, admin only; raises a friendly error listing references; otherwise deletes. archive_master_row / restore_master_row (edit-level).
6. View v_orphan_master_refs (bis_projects, quotations and finance docs with NULL or dangling client_id / is_code_id).

FRONTEND
- Client, IS Code, Test Parameter, Product & Services masters: "Delete" becomes "Archive" (edit-level) plus an admin-only "Delete permanently" via delete_master_row that shows the reference list on error. Default filter "Active", with a "Show archived" toggle; bulk actions work the same way.
- IS Code delete: call master_reference_counts first, delete through the RPC, and remove storage objects only AFTER the DB delete succeeds.
- Pickers show only active rows but still display an already-selected archived row with an "Archived" badge.
- Admin-only "History" tab in ClientDetailsDialog and IsCodeDetailsDialog reading audit_log.
- grep -rn "\.delete()" frontend/web/src and route every master delete through these functions.

HOUSE RULES
- New migration only; never edit applied migrations; never run db:migrate/railway/psql; Amit applies.
- Never open, print or copy .env, .railway-secrets.env or any secret.
- No commit or push unless Amit says "commit". Keep data and Hindi labels.
- Verify: npm run typecheck (≤ 122, baseline 122), npm run lint (≤ 353, baseline 353), npm run build (must pass). Report before/after counts.

ACCEPTANCE
Deleting a client with surveillance or licences is refused with a clear message; archive works; deleting an IS with references never removes its files; audit_log records the user id. Set MST-04/36 to IN-PROGRESS and give Amit `select * from v_orphan_master_refs` to run after applying.
```

**Hindi:** अभी किसी client को delete करने पर उसके surveillance और sample-failure records भी अपने आप मिट जाते हैं, और licences का client खाली हो जाता है। IS Code delete करने पर कभी-कभी PDF files तो मिट जाती हैं पर row बची रहती है। ये prompt "Delete" की जगह "Archive" लाएगा। Record छिप जाएगा पर मिटेगा नहीं। पक्का delete सिर्फ़ Admin कर पाएगा, और वो भी तभी जब उस record से कुछ जुड़ा न हो, नहीं तो साफ़ message आएगा कि क्या जुड़ा है। हर बदलाव (किसने, कब, क्या बदला) एक `audit_log` में दर्ज होगा, जो Finance के लिए भी ज़रूरी है। Apply करने के बाद एक query से पता चलेगा कि कितने licences बिना client या IS के हैं (अभी 124 बिना IS के हैं)।

---

### R6: Client Master v2 (old P4 + MST-84 scale + GST duplicates)

```text
Repo: Consultancy Management. Read .cursorrules, .cursor/rules/10-database-migrations.mdc, docs/audits/02_masters_gap_audit.md (MST-05, 10–18, 20, 77, section D/P4, section C7 validators) and backend/database/schema/README.md first. Follow the detailed P4 spec in the 02 audit, with the corrections below.

LIVE FACTS (override the 02 audit where different)
- clients has 17,902 rows. The GST column is **gst_number** (not gstin). Mobile is in mobile/phone, contact in contact_person_name, PIN in pin_code. Other columns: company_type, company_scale, company_status, payment_term, balance_type, opening_balance, phone_country_code, country_code, district, city, state, country, remark, notes, name (legacy, synced by trigger trg_clients_sync_name).
- company_scale = 'Medium' for 17,871 rows (the bulk-import default, not real data); Micro 15, Large 10, Small 6. ClientsMasterPage.tsx ~248 defaults NULL to 'Medium'.
- 41 GST numbers are shared by 83 clients (same GSTIN = same legal entity in that state, so these are duplicates or sites of one firm). 0 GST numbers fail the format regex. 0 bad mobiles.
- company_type: Manufacturer 17,893, Testing Laboratory 9. payment_term has both '100 % Advance' and '100% Advance'.
- Unique indexes live: idx_clients_company_name (exact) and clients_company_name_lower_trim_unique (lower(trim)), the second not in any repo migration. pg_trgm is NOT installed.
- Old-app table app_dropdown_options holds client_master.* option values (city 340, pin_code 2,882, state 19, company_type 7…). The app reads client_master_options (19 rows) instead.

DO: migration <timestamp>_clients_v2.sql (idempotent)
1. india_states (code text PK = 2-digit GST code, name, short_code, is_ut, manak_name), seeded with all 28 states + 8 UTs + '97' Other Territory + '96' Foreign (for export). Use the official GST state-code list.
2. CREATE UNIQUE INDEX IF NOT EXISTS clients_company_name_lower_trim_unique with the same definition as live (records it in the repo). Keep idx_clients_company_name for now; it can be dropped in a later migration once nothing uses onConflict:'company_name' (see the frontend step).
3. New nullable client columns as in P4 (pan, cin, llpin, udyam_no, msme_category, udyam_date, constitution, sector, is_startup, startup_dpiit_no, is_women_entrepreneur, gst_registration_type, gst_state_code FK india_states, billing_currency default 'INR', credit_days, credit_limit, tds_section, client_status default 'Active', lead_source, referred_by, account_manager_id FK user_profiles). CHECK constraints NOT VALID. Normalise trigger (upper/trim gst_number, pan, udyam; derive gst_state_code and pan from gst_number when empty).
4. MST-84: add company_scale_source text ('imported_default','udyam','manual'). Backfill 'imported_default' for rows where company_scale='Medium' AND created_at between '2026-08-01' and '2026-09-01' (the bulk import), else 'manual'. Do not change company_scale values. When msme_category is set from Udyam, sync company_scale and set the source to 'udyam'.
5. CREATE EXTENSION IF NOT EXISTS pg_trgm; GIN trigram index on company_name; find_similar_clients(p_name, p_gst) (top 5 by similarity or exact GST).
6. View v_client_gst_duplicates (gst_number, count, client ids, names). No partial unique index on gst_number yet (the 41 duplicate groups would block it). Create it later after the merge tool cleans them, guarded by a "no duplicates" check.
7. client_sites and client_contacts exactly as in P4, with backfill (Registered Office + Factory copy from the client address; primary contact from contact_person_name/mobile/email). bis_projects.factory_site_id FK, backfilled to the client's Factory site. FKs ON DELETE RESTRICT. Backfill in batches (17,902 clients) to keep the migration fast.
8. RLS for the new tables using app_module_level/app_is_admin (from R4); if R4 isn't applied yet, mirror the existing style and leave a TODO.
9. Seed client_master_options with any missing values (client types Importer, Foreign Manufacturer, AIR, Jeweller, Trader; payment terms normalised to one spelling) and UPDATE clients from '100% Advance' to the canonical '100 % Advance'.

FRONTEND
- frontend/web/src/lib/indiaValidators.ts (GSTIN regex + mod-36 checksum + state code, PAN, Udyam, CIN, LLPIN, mobile ^[6-9]\d{9}$ for +91, PIN, IFSC, email, gstinStateCode, panFromGstin).
- features/masters/clients/clientsApi.ts (normaliseClient, validateClient, createClient, updateClient, searchClients, checkDuplicates). ClientsMasterPage, AddClientDialog and every other clients insert/update (grep "from('clients')") use it.
- ClientsForm sections: Statutory, Sites, Contacts, Billing, Lifecycle. Scale shows a "Not verified (imported default)" chip when company_scale_source='imported_default'. Stop defaulting NULL scale to 'Medium' in the UI. Defaults come from company settings, not hard-coded Raipur/Chhattisgarh. State select from india_states.
- Duplicate panel before save (similar names + same GST). Admin "Merge clients" dialog: pick the survivor; re-point every FK (list them from master_reference_counts); archive the other row; log it in audit_log.
- CSV import: preview with per-row errors (invalid GST, unknown option, possible duplicate), import only valid rows, error CSV; upsert on id or on a lower(trim) name match done in code, not onConflict:'company_name'.
- "Copy client" asks for a new name.
- BIS Form-I (features/bis/print/bisForm1Html.ts ~418-447): office address from the Registered Office site, factory from bis_projects.factory_site_id (fallback: client address), sector from clients.sector, top management/signatory from client_contacts, scale from company_scale (if imported_default, ask the user to confirm before printing). BisProjectsForm gets a "Factory site" select with quick-add.

HOUSE RULES
- New migration only; never edit applied migrations; never run db:migrate/railway/psql; Amit applies.
- Never open, print or copy .env, .railway-secrets.env or any secret.
- No commit or push unless Amit says "commit". Keep data, legacy columns and Hindi labels; don't break quotations, sale documents, BIS projects, consent letters, OSL, email tools.
- Verify: npm run typecheck (≤ 122, baseline 122), npm run lint (≤ 353, baseline 353), npm run build (must pass). Report before/after counts.

ACCEPTANCE
Invalid GSTIN blocked in form, quick-add and import; case/space duplicate names blocked; v_client_gst_duplicates lists the 41 groups; a client can have several factory sites and Form-I prints the selected one; imported-default scale is flagged. Set MST-05 (clients), 10–15, 17, 18, 20, 77, 84 to IN-PROGRESS.
```

**Hindi:** Client Master को BIS और Finance दोनों के लायक बनाने वाला prompt। नए fields जुड़ेंगे: PAN, CIN, Udyam और MSME category, startup/women entrepreneur flags (इन्हीं से BIS fee में छूट तय होती है), GST state code, credit days, TDS। एक client की कई factories (sites) और कई contacts (Top Management, Signatory, Accounts…) रखे जा सकेंगे, और Form-I में सही factory का पता छपेगा। GSTIN की पूरी जाँच (checksum + state) form, quick-add और import तीनों में होगी। सबसे ज़रूरी बात: अभी 17,871 clients का scale "Medium" लिखा है, जो import के समय default में भरा गया था, असली नहीं। इसे "verify नहीं हुआ" के रूप में mark किया जाएगा, ताकि fee गलत न बने। 41 GST numbers 83 clients में दोहराए गए हैं। उनकी list बनेगी और Admin के लिए "Merge clients" tool आएगा। पुराने columns चलते रहेंगे।

---

### R7: BIS reference masters (old P5 + seeds; MST-61, 70, 71, 73, 75, 76)

```text
Repo: Consultancy Management. Read .cursorrules, .cursor/rules/10-database-migrations.mdc, docs/audits/02_masters_gap_audit.md (MST-61, 70, 71, 73, 75, 76, sections C1/C4/C5, D/P5) and backend/database/schema/README.md first. Follow the detailed P5 spec in the 02 audit with these corrections.

LIVE FACTS
- bis_projects (29,777 rows): branch_name, branch_state, branch_head_*, inspection_officer_*, dealing_officer_*, type_of_inspection are EMPTY in every row. The option values live in lab_master_options (bis_inspection_officer_name 4, bis_branch_head_name 1) and in the old-app table app_dropdown_options (option_key bis_application.bis_branch_name 6, bis_application.inspection_officer_name 5, bis_application.dealing_officer_name 5, *_designation, nature_of_inspection, marking_clause 6, packaging_clause 7).
- project_kind is TEXT: Licence 29,729, Application 10, application 32, Inclusion 6. status is enum project_status incl. 'stop_marking' (581 rows). license_number holds bare digits (no 'CM/L-' prefix).
- india_states exists if R6 was applied (else use text state columns).

DO: migration <timestamp>_bis_reference_masters.sql (idempotent)
1. certification_schemes seeded as in P5 (SCHEME_I, FMCS, SCHEME_II CRS, SCHEME_IV, SCHEME_X, HALLMARKING, ECOMARK authority 'CPCB', ISO_MSCS), with a licence_no_regex that also accepts the stored bare digits (e.g. '^(CM/L-)?\d{10}$' for Scheme-I, '^(R-)?\d{8}$' for CRS). Validity values carry a "verify against BIS" comment.
2. bis_offices: seed the 5 regional offices (CRO, ERO, NRO, SRO, WRO) and the Eastern Region branches from https://www.bis.gov.in/regional-branch-offices-bis-list/?lang=en: Patna (PTBO), Bhubaneswar (BHBO), Guwahati (GHBO), Kolkata (KKBO), Raipur (RPBO: Manakalaya, Plot No. 13-C, Sector-24, Nava Raipur – Atal Nagar, Chhattisgarh 492101; Tel 0771-2412236; email hrpbo@bis.gov.in; head Ms. Anurita Jojo, Scientist-E; mark "as on 8 Oct 2026, verify"), Jamshedpur (JDBO). Also insert the other branch office names from that page with name + region only (Bhopal, Ghaziabad, Faridabad, Jaipur, Delhi-I, Delhi-II, Lucknow, Noida, Parwanoo, Dehradun, Kashmir, Chandigarh, Bengaluru, Hyderabad, Coimbatore, Kochi, Vijayawada, Chennai, Madurai, Hubli, Ahmedabad, Surat, Pune, Rajkot, Nagpur, Mumbai). Then insert the distinct app_dropdown_options 'bis_application.bis_branch_name' values that don't match any name (code NULL).
3. bis_officers (name, grade, role, bis_office_id, email, phone, is_active), seeded from the distinct values of app_dropdown_options bis_application.inspection_officer_name / dealing_officer_name / branch_head_name and lab_master_options bis_inspection_officer_name / bis_branch_head_name (dedupe case-insensitively; take designation from the *_designation options where possible).
4. licence_statuses (operative, deferred, stop_marking, suspended, expired, cancelled, surrendered + manak_label). bis_projects.licence_status_code FK, backfilled: status='stop_marking' → 'stop_marking'; project_kind='Licence' and license_validity_date < current_date → 'expired'; other Licence rows → 'operative'. Keep workflow status untouched.
5. Normalise project_kind: UPDATE bis_projects SET project_kind='Application' WHERE project_kind='application'. Add CHECK (project_kind in ('Licence','Application','Inclusion','Renewal')) NOT VALID after the update. grep the frontend for lowercase 'application' writes (features/bis/projects/* and bisModuleImportApi.ts) and fix them.
6. document_types seeded as in P5. bis_project_files.document_type_id FK (backfill where doc_kind matches a code).
7. bis_projects: certification_scheme_id (backfill SCHEME_I), bis_office_id, and officer FK columns next to the existing text columns (text stays as a snapshot).
8. RLS: read for all authenticated; write edit-level; delete admin.

FRONTEND
- Route /masters/bis-reference (tabs: Schemes, BIS Offices, Officers, Licence Statuses, Document Types) using the existing MasterPage pattern; add it to lib/appNav.ts under Masters and register module key masters_bis_reference in the module catalog.
- BisProjectsForm / application details: searchable selects with quick-add for branch and officers (write the FK + text snapshot); scheme select (licence number validated by the scheme regex); licence status select separate from workflow status.
- manakExtensionBridge.ts: use the scheme regex instead of the hard-coded CM/L 10-digit rule.

HOUSE RULES
- New migration only; never edit applied migrations; never run db:migrate/railway/psql; Amit applies.
- Never open, print or copy .env, .railway-secrets.env or any secret.
- No commit or push unless Amit says "commit". Keep text values and Hindi labels; don't break BIS prints, surveillance, sample failure, dashboard (its stop_marking KPI must still work).
- Verify: npm run typecheck (≤ 122, baseline 122), npm run lint (≤ 353, baseline 353), npm run build (must pass). Report before/after counts.

ACCEPTANCE
Filters on Application now include all 42 rows; a CRS project accepts R-12345678 and rejects CM/L; the Raipur BO is selectable; the dashboard counts are unchanged. Set MST-61/70/71/73/75/76 to IN-PROGRESS.
```

**Hindi:** BIS से जुड़ी चीज़ें, जो अभी खुले text में लिखी जाती हैं, उनके छोटे masters बनेंगे: Certification Schemes (ISI Scheme-I, CRS, FMCS, Hallmarking…), BIS Branch Offices, BIS Officers, Licence Status (Operative/Stop Marking/Expired…) और Document Types। Raipur Branch Office का पूरा पता, फ़ोन, email और Head का नाम मैंने आज bis.gov.in से लिया है, वो पहले से भरा जाएगा। पुराने app में जो branch और officer के नाम पड़े थे, वो भी यहाँ आ जाएँगे। अभी "application" और "Application" दो अलग spellings की वजह से 32 records filter में छूट जाते हैं, वो ठीक होगा। Licence status अब workflow status से अलग रहेगा। पुराने text वाले fields वैसे ही रहेंगे, कुछ नहीं मिटेगा।

---

### R8: IS Code Master v2 (old P6; MST-05 IS, 30–33, 35, 37)

```text
Repo: Consultancy Management. Read .cursorrules, .cursor/rules/10-database-migrations.mdc, docs/audits/02_masters_gap_audit.md (MST-05, 30–33, 35, 37, sections C1/C2, D/P6) and backend/database/schema/README.md first. Follow the detailed P6 spec in the 02 audit with these corrections.

LIVE FACTS
- is_codes: 1,427 rows. revision_year int4 NOT NULL, reaffirmation_year int4, amendment_number text. Live columns also include legacy is_code_title, aspect_of_is (synced by trigger trg_sync_is_codes_lims_aliases; keep it working). title is filled in every row; aspect = 'Specification' everywhere; product_manual_number is filled in only 27 rows; MMF fee columns are filled in 1,381 rows (don't touch fees here).
- Unique index is_codes_number_revision_unique (is_number, revision_year) exists; 0 duplicates; 0 values like "IS /IEC"; 28 rows contain IEC/ISO.
- The bug is in code only: IsCodesMasterPage.tsx ~1015-1020 rebuilds the number as `IS ${rest}`, so "IS/IEC 62368" would become "IS /IEC 62368". AddIsCodeDialog.tsx ~103-113 and the CSV import (~1198-1278) don't normalise at all.
- Extension scraper frontend/extensions/qe-consultancy-chrome/is-code-fetch.js ~866-917 sees Voluntary/Mandatory, Department and Technical Committee but discards them.

DO: migration <timestamp>_is_codes_v2.sql (idempotent)
- As in P6: structured columns (is_prefix, base_number, part_no, section_no, is_key), BIS metadata columns, certification_category, certification_scheme_id FK (from R7), bis_detail_url, last_synced_at; parse_is_number(text) SQL function + backfill; unique (is_key, revision_year) only if there are no clashes (else NOTICE); is_code_amendments, is_code_qcos, is_code_products (backfill one product row per IS from title + product_manual_number). There is NO need for smallint shadow columns (revision_year is already int).
- RLS like R4.

FRONTEND
- frontend/web/src/lib/isNumber.ts (parseIsNumber, normalizeIsNumber, formatIsLabel). frontend/web/src/lib/formatIsCodeLabel.ts becomes a wrapper.
- features/masters/is-codes/isCodesApi.ts; IsCodesMasterPage, AddIsCodeDialog, CSV import and all 16 files that query is_codes go through it for writes.
- IsCodesForm structured inputs with a live label preview; tabs Amendments / QCOs / Products & Varieties; import preview with per-row errors.
- Extension: map Technical Department, Technical Committee, ICS, Certification, Superseding, Degree of Equivalence and Group into the new columns; set last_synced_at; show a diff before overwriting values the user edited. Update both the chrome and safari folders if they share the file.
- Form-I: product name from the selected is_code_products row; Part/Section from the structured fields.

HOUSE RULES
- New migration only; never edit applied migrations; never run db:migrate/railway/psql; Amit applies.
- Never open, print or copy .env, .railway-secrets.env or any secret.
- No commit or push unless Amit says "commit". Keep is_number values working for every caller; don't touch fee columns (R9 does that); keep Hindi labels.
- Verify: npm run typecheck (≤ 122, baseline 122), npm run lint (≤ 353, baseline 353), npm run build (must pass). Report before/after counts.

ACCEPTANCE
"IS/IEC 62368 (Part 1): 2018" saves as prefix IS/IEC, base 62368, part 1, year 2018 (never "IS /IEC"); duplicate IS+year blocked in form, quick-add and import; extension fetch fills TC/department/certification. Set MST-05 (IS), 30–33, 35, 37 to IN-PROGRESS.
```

**Hindi:** IS Code Master को BIS की "Know your standard" website जैसा बनाया जाएगा। IS number के हिस्से अलग-अलग रखे जाएँगे (prefix जैसे IS/IEC, number, Part, Section, year), ताकि "IS/IEC" वाला bug ("IS /IEC" बन जाना) हमेशा के लिए खत्म हो और duplicate न बने। नए fields: Technical Committee, Department, ICS, status (Current/Withdrawn), Compulsory/Voluntary। अलग tabs बनेंगे: Amendments की list, QCO (Quality Control Order) की details, और Products/Varieties, क्योंकि एक IS में कई products होते हैं और Form-I में सही product का नाम छपना चाहिए। Chrome extension जो जानकारी अभी फेंक देता है, वो भी save होगी। Fees को नहीं छुआ जाएगा।

---

### R9: BIS fee master + estimator (old P7; MST-34, MST-74)

```text
Repo: Consultancy Management. Read .cursorrules, .cursor/rules/10-database-migrations.mdc, docs/audits/02_masters_gap_audit.md (MST-34, MST-74, sections C3/C4, D/P7) and backend/database/schema/README.md first. Depends on R6 (msme_category, is_startup, is_women_entrepreneur, company_scale_source), R7 (certification_schemes) and R8 (is_key). If they're missing, stop and tell me.

LIVE FACTS
- Fee columns on is_codes (20261004200000_is_codes_qe_fee_fields.sql:4-16): mmf_large_scale, mmf_medium_scale, mmf_small_scale, mmf_micro_scale, slab_1..3 quantity (text) / rate, unit_of_is. 1,381 of 1,427 rows have mmf_large_scale > 0.
- BIS fee page (checked 8 Oct 2026; last updated 14 Sep 2026): base notification 05.08.2021, latest amendment 10.06.2026, plus a "Fees concession extension for Scheme-I" PDF. Marking fee PDF: https://www.bis.gov.in/wp-content/uploads/2026/09/Marking-fee-for-all-products-under-certification-scheme-1.pdf
- 99.8% of clients have an unverified 'Medium' scale (company_scale_source='imported_default' after R6).

DO: follow P7 exactly (bis_fee_components, is_code_marking_fees with generated small = 0.5×large and micro = 0.2×large, fee_concessions, is_codes_current_fees view, estimate_bis_fees()). Extra rules:
- In estimate_bis_fees, when the client's company_scale_source = 'imported_default' and msme_category is NULL, return a warning row ('SCALE_NOT_VERIFIED') and compute with Large/Medium rates (no concession). Never assume a concession.
- Backfill is_code_marking_fees from the existing columns (effective_from '2021-08-05' unless a better date is known), and RAISE NOTICE with how many rows have stored small/micro values that differ from the derived ones.
- Keep the old is_codes fee columns (COMMENT 'deprecated, read is_codes_current_fees').
- RLS like R4 (fee masters: read all, write admin).

FRONTEND
- Route /masters/bis-fees (Fee components; Marking fees per IS with history; Concessions) + appNav/module catalog. Import of the marking-fee CSV (made from the BIS PDF) with preview, matched by is_key.
- IS details "Fees" tab; the old fee inputs in IsCodesForm become read-only, pointing to the tab.
- Quotation form: "Add BIS statutory fees" → pick IS + scheme (+ man-days, annual qty) → estimate_bis_fees → lines marked pure-agent/reimbursable (GST 0 by default, editable) with the concession shown, plus a visible warning when the scale is not verified.
- Any code reading is_codes.mmf_* switches to is_codes_current_fees, with a fallback.

HOUSE RULES
- New migration only; never edit applied migrations; never run db:migrate/railway/psql; Amit applies.
- Never open, print or copy .env, .railway-secrets.env or any secret.
- No commit or push unless Amit says "commit". Existing quotation totals must not change. Keep Hindi labels.
- Verify: npm run typecheck (≤ 122, baseline 122), npm run lint (≤ 353, baseline 353), npm run build (must pass). Report before/after counts.

ACCEPTANCE
A new effective_from keeps old quotes intact and shows history; a micro, women-led client gets the stacked concession on the marking fee only; an unverified-scale client gets the warning. List every seeded amount Amit must verify against the BIS PDFs. Set MST-34/74 to IN-PROGRESS.
```

**Hindi:** BIS की सरकारी fees (application ₹1,000, inspection per man-day, annual licence fee, marking fee, CRS fees वगैरह) एक fee master में तारीख के साथ रखी जाएँगी, क्योंकि BIS 2021 से अब तक 25 से ज़्यादा बार marking fee बदल चुका है (आखिरी बदलाव 10.06.2026)। MSME, startup और women entrepreneur की छूट भी master में रहेगी। Quotation में एक button से IS और scheme चुनकर सरकारी fees अपने आप जुड़ जाएँगी, बिना GST के ("pure agent")। ज़रूरी सावधानी: जिन clients का scale import के समय default "Medium" भरा था, उनके लिए system छूट नहीं देगा और warning दिखाएगा, ताकि गलत fee quote न हो। पुरानी quotations के totals नहीं बदलेंगे।

---

### R10: Laboratory master (old P8; MST-16, 38, 72)

```text
Repo: Consultancy Management. Read .cursorrules, .cursor/rules/10-database-migrations.mdc, docs/audits/02_masters_gap_audit.md (MST-16, 38, 72, section C6, D/P8) and backend/database/schema/README.md first. Depends on R8.

LIVE FACTS
- 9 clients have company_type = 'Testing Laboratory'. They are looked up by fuzzy name in frontend/web/src/features/bis/projects/bisProjectsApi.ts ~220-276.
- is_codes.testing_charges is a single number. Old-app tables lab_accreditations (0 rows) and bis_renewal_applications.test_lab_name/test_lab_nabl_no (0 rows) exist.

DO: follow P8 exactly (laboratories, laboratory_is_scope, laboratory_is_rates with overlap guard, backfill from the 9 lab clients keeping legacy_client_id, laboratory_id FK wherever OSL / sample tables store a lab, laboratories_expiring view, RLS like R4). Do NOT delete or change the 9 client rows (finance may bill them).
FRONTEND: /masters/laboratories (list, form, Scope and Rates tabs, CSV import) + appNav/module catalog; bisProjectsApi lab lookup and OSL screens use laboratories (fallback to the old lookup for rows without laboratory_id); IS details "Labs" tab; testing_charges labelled "Indicative"; dashboard card "Labs expiring soon".

HOUSE RULES
- New migration only; never edit applied migrations; never run db:migrate/railway/psql; Amit applies.
- Never open, print or copy .env, .railway-secrets.env or any secret.
- No commit or push unless Amit says "commit". Keep Hindi labels.
- Verify: npm run typecheck (≤ 122, baseline 122), npm run lint (≤ 353, baseline 353), npm run build (must pass). Report before/after counts.
ACCEPTANCE: existing OSL/sample records still show their lab; a lab with expired recognition is flagged when picked. Set MST-16/38/72 to IN-PROGRESS.
```

**Hindi:** अभी 9 testing labs को "client" बनाकर रखा गया है और उन्हें नाम से अंदाज़े से ढूँढा जाता है। ये prompt Laboratory का अलग master बनाएगा: lab का type (BIS lab, BIS-recognised OSL, NABL), OSL code, recognition और NABL की validity, कौन-से IS वो test करती है, और हर IS का testing rate। उन 9 labs को नए master में copy किया जाएगा, client वाली rows नहीं हटेंगी। जिस lab की मान्यता खत्म होने वाली हो, वो dashboard पर दिखेगी, और expired lab चुनने पर warning आएगी।

---

### R11: Test Parameter Master v2 (old P9; MST-40, 41, 42)

```text
Repo: Consultancy Management. Read .cursorrules, .cursor/rules/10-database-migrations.mdc, docs/audits/02_masters_gap_audit.md (MST-40..42, D/P9) and backend/database/schema/README.md first. Depends on R8.

LIVE FACTS
- test_parameters: 164 rows covering only 11 IS codes; 0 duplicates on (is_code_id, clause_no, lower(trim(item_name))); FK to is_codes is ON DELETE RESTRICT; trigger trg_sync_test_parameters_lims_aliases syncs legacy test_name/unit/specified_value (keep it). test_parameter_units has only id, name (10 rows).

DO: follow P9, but since there are 0 duplicates, skip the merge step: just create the unique index (guarded by a "no duplicates" check with NOTICE). Add the structured nullable columns, the test_parameters_v view, the is_code_label sync trigger, and the accreditation junction backfilled from under_accreditation_ids. RLS like R4.
FRONTEND: structured limits, unit select, test type/frequency/sample size; LIMS-only fields inside a collapsed "LIMS fields" section; import keyed on is_code_id (resolved via isCodesApi) + clause_no + item_name, deduped within the file, with a preview; the FTR and Scheme-of-Inspection builders use structured limits when present (old prints unchanged).

HOUSE RULES
- New migration only; never edit applied migrations; never run db:migrate/railway/psql; Amit applies.
- Never open, print or copy .env, .railway-secrets.env or any secret.
- No commit or push unless Amit says "commit". Keep Hindi labels; FTR/SOI prints must look the same for old data.
- Verify: npm run typecheck (≤ 122, baseline 122), npm run lint (≤ 353, baseline 353), npm run build (must pass). Report before/after counts.
ACCEPTANCE: re-importing the same CSV creates no duplicates. Set MST-40..42 to IN-PROGRESS.
```

**Hindi:** Test Parameter Master में अभी 164 parameters हैं, पर ये सिर्फ़ 11 IS codes के हैं। ये prompt duplicate रोकने के लिए database में unique rule लगाएगा (अभी कोई duplicate नहीं है)। Requirement को structured बनाएगा: min/max limit, unit, test type (Acceptance/Routine/Type), frequency, sample size। इससे FTR और Scheme of Inspection की prints बेहतर बनेंगी। LIMS वाले फ़ालतू fields एक बंद section में चले जाएँगे। Import में IS के हिसाब से मिलान होगा, ताकि वही file दोबारा डालने पर duplicate न बने। पुरानी prints वैसी ही दिखेंगी।

---

### R12: Consultancy service catalogue (old P10; MST-50..54)

```text
Repo: Consultancy Management. Read .cursorrules, .cursor/rules/10-database-migrations.mdc, docs/audits/02_masters_gap_audit.md (MST-50..54, D/P10) and backend/database/schema/README.md first. Depends on R7 (schemes) and R9 (fees).

LIVE FACTS
- products_services_master has 1 row (columns: item_type, item_code [unique], item_category, item_name, item_description, hsn_code, sale_price, purchase_price, gst_percent, discount, unit_of_measurement, make, opening_stock, low_stock_alert). product_item_categories 2, product_makes 3, gst_rates 5 (0/5/12/18/28; columns id, rate, created_at). The old LIMS table product_master_items (1 row) is not used by the code.
- The old-app table service_offerings has 10 real consultancy services: "BIS — New license", "BIS — Renewal", "BIS — New inclusion", "BIS — Maintenance" (category BIS); "ISO 17025 (NABL / QAI / IQAS)", "ISO 9001 / 14001 / 45001", "Food safety (ISO 22000 / HACCP)" (ISO); "5S / Six Sigma / Risk analysis" (Consulting); "Product testing" (Testing); "Instrument calibration" (Calibration).
- quotation_line_items already has hsn_sac. The tables behind dead modules (nabl_scope, equipment_master) do NOT exist live.

DO: follow P10 (sac_hsn_codes seed, new columns service_kind / code_type / sac_hsn_code FK / certification_scheme_id / is_code_id / price_micro..large / is_reimbursable / is_pure_agent / category_id / make_id, seeded categories and services at price 0, government-fee items as pure agent with GST 0). In addition: copy the 10 service_offerings rows into products_services_master (service_kind 'Consultancy' or 'Testing'; item_code generated like SRV-001; skip any lower(item_name) that already exists) and COMMENT ON TABLE service_offerings 'legacy — copied into products_services_master'. RLS like R4.
FRONTEND: service_kind first; inventory fields only for Product; SAC/HSN picker with validation; scale-based prices; reimbursable/pure-agent toggles; scheme/IS links; quotation/sale line picker uses the client's msme_category price (fallback rate) and shows pure-agent lines separately. Delete features/masters/product-services (NABL) and features/masters/equipment-master if grep shows no imports from live routes (their tables don't exist), and list what you removed.

HOUSE RULES
- New migration only; never edit applied migrations; never run db:migrate/railway/psql; Amit applies.
- Never open, print or copy .env, .railway-secrets.env or any secret.
- No commit or push unless Amit says "commit". Existing quotation lines and totals unchanged; keep Hindi labels.
- Verify: npm run typecheck (≤ 122, baseline 122), npm run lint (≤ 353, baseline 353), npm run build (must pass). Report before/after counts.
ACCEPTANCE: "Scheme-I new licence" for a small-scale client fills price_small; existing items still load and save. Set MST-50..54 to IN-PROGRESS.
```

**Hindi:** Product & Services master अभी Lab (Calibration/Testing) के हिसाब से बना है और उसमें सिर्फ़ 1 item है। ये prompt इसे BIS consultancy की service list बनाएगा: New Licence, Renewal, Inclusion, Surveillance support, Sample failure reply, CRS, FMCS, Hallmarking, ISO, Documentation, Retainer वगैरह, सबकी price 0, जो आप भरेंगे। पुराने app में आपकी 10 services पहले से बनी थीं, वो भी यहाँ copy हो जाएँगी। Services के लिए SAC code (9983xx) अलग होगा, scale के हिसाब से अलग price (Micro/Small/Medium/Large) होगी, और सरकारी fees "pure agent" के रूप में बिना GST के जुड़ेंगी। NABL और Equipment जैसे बेकार modules, जिनकी tables भी अब नहीं हैं, हटाए जाएँगे। Finance इसी list से invoice बनाएगा।

---

### R13: Company profile + finance readiness (old P11; MST-60, 17, 51)

```text
Repo: Consultancy Management. Read .cursorrules, .cursor/rules/10-database-migrations.mdc, docs/audits/02_masters_gap_audit.md (MST-60, MST-17, "Finance module: what it needs", D/P11) and backend/database/schema/README.md first. Depends on R6 (india_states, client gst_state_code, client_sites).

LIVE FACTS
- lab_settings: 1 row; company_settings: 1 row (id=1); same company name and GST number in both. lab_settings already has bank_name, branch_name, account_number, ifsc, upi, gst_number; company_settings has bank_* and letterhead/print fields. Neither has PAN, TAN, CIN, Udyam, GST state code, LUT or e-invoice flag. sync_company_settings_to_lab_settings() (SECURITY DEFINER) keeps them in step.
- Document numbering is split: lab_prefixes (name, prefix, last_number; 0 rows; used by 5 code files) and the old-app app_settings (document_number_prefix/suffix, reference_prefix/suffix; 1 row; not read by code). Finance tables live: finance_quotations (1), finance_sales_orders, finance_proforma_invoices, finance_tax_invoices, finance_credit_notes, finance_customer_statements (0 each), each with its own *_number text column; LIMS quotations (1) + quotation_line_items.
- gst_rates: 0, 5, 12, 18, 28 with no effective dates. GST rates were rationalised from 22 Sep 2025 (5% / 18% plus a 40% special rate; many 12% and 28% items moved). Consulting services (SAC 9983) stay at 18%. Keep the old rates for history, add 40, and have Amit verify.

DO: follow P11 (canonical active lab_settings row + partial unique index, company_profile view, statutory columns, document_series + next_document_number() with SELECT … FOR UPDATE, RLS select-all/write-admin). In addition:
- Seed document_series from the current max numbers in the finance_* tables and lab_prefixes (parse a trailing number; when the format is unknown, next_number = 1 and NOTICE). Doc types: QUOTATION, SALES_ORDER, PROFORMA, TAX_INVOICE, CREDIT_NOTE, CUSTOMER_STATEMENT, PAYMENT_RECEIPT.
- gst_rates: add effective_from/effective_to/notes, backfill '2017-07-01', insert 40 with effective_from '2025-09-22' and a note "verify".
- COMMENT ON TABLE app_settings 'legacy — numbering moved to document_series'.
FRONTEND: lib/gstPlaceOfSupply.ts (intra/inter/export from company gst_state_code vs the client billing site or GST state; SEZ/overseas → inter/export); quotation and sale forms default the GST mode from it (the template toggle becomes an override with a warning); Company Settings single-profile UI with statutory + LUT/e-invoice fields validated by indiaValidators; a "Document Series" tab.

HOUSE RULES
- New migration only; never edit applied migrations; never run db:migrate/railway/psql; Amit applies.
- Never open, print or copy .env, .railway-secrets.env or any secret.
- No commit or push unless Amit says "commit". Existing document numbers and totals must not change; keep Hindi labels.
- Verify: npm run typecheck (≤ 122, baseline 122), npm run lint (≤ 353, baseline 353), npm run build (must pass). Report before/after counts.
ACCEPTANCE: Chhattisgarh company + Odisha client → IGST; same state → CGST+SGST; next_document_number is gap-free under concurrency (explain the lock). Set MST-60/17/51 to IN-PROGRESS.
```

**Hindi:** Finance module शुरू करने से पहले का आखिरी कदम। Company का एक ही profile रहेगा, जिसमें PAN, TAN, CIN, Udyam, GST state code, LUT और e-invoice की जानकारी होगी। हर document type (Quotation, Proforma, Tax Invoice, Credit Note, Receipt) की numbering financial year के हिसाब से अपने आप चलेगी और कोई number छूटेगा नहीं। अभी numbering दो अलग जगह बिखरी है, वो एक जगह आ जाएगी। Client का state देखकर system खुद तय करेगा कि CGST+SGST लगेगा या IGST (जैसे Chhattisgarh से Odisha = IGST)। GST rates में तारीख जुड़ेगी, और सितंबर 2025 वाले नए GST slabs (5/18/40) भी जुड़ेंगे, जिन्हें आप एक बार verify कर लें। Consultancy services पर 18% ही रहता है। पुराने invoice numbers और totals नहीं बदलेंगे।

---

### R14: Server-side lists + legacy cleanup (old P12; MST-08, 21, 54, 86)

```text
Repo: Consultancy Management. Read .cursorrules, .cursor/rules/10-database-migrations.mdc, docs/audits/02_masters_gap_audit.md (MST-08, 21, 54, D/P12) and backend/database/schema/README.md ("Legacy tables") first. Run after R2 and R5.

LIVE FACTS
- PGRST_DB_MAX_ROWS=10000; clients 17,902; bis_projects 29,777 (bisProjectsApi already pages with .range). R2 added fetchAllRows as a stop-gap.
- pg_trgm: installed by R6 (if not, CREATE EXTENSION IF NOT EXISTS pg_trgm here).
- Legacy old-app tables (no code refs): app_users, profiles (+ function current_user_is_admin()), portal_roles, app_dropdown_options, service_offerings, app_settings, company_terms, company_scope_of_work, company_notes, iso_projects, project_documents. Tables that code references but that don't exist: master_clients, nabl_scope, equipment_master, sample_receiving_options.

DO
1. Migration <timestamp>_master_search_indexes_and_legacy.sql: trigram GIN indexes on clients(company_name, gst_number, city), is_codes(is_number, title), test_parameters(item_name), products_services_master(item_name); btree on FKs used in filters. COMMENT ON TABLE 'legacy (old Consultancy Pro) — not used; candidate for archive' for each legacy table; ENABLE RLS and REVOKE ALL FROM anon, authenticated on profiles, portal_roles, app_dropdown_options, service_offerings, app_settings, company_terms, company_scope_of_work, company_notes, iso_projects, project_documents (only after grep confirms 0 code references; current_user_is_admin() keeps working as SECURITY DEFINER). Do NOT drop anything.
2. frontend/web/src/hooks/useServerList.ts (table/view, select, ilike search columns, filters, sort, page, pageSize, .range + count:'exact', debounced). Switch the Client, IS Code, Test Parameter and Product & Services master pages to it (same columns, filters, look). Export does a paged fetch of all matching rows. Pickers use server search (ilike, limit 30) instead of loading every row; remove the fetchAllRows stop-gap where it's no longer needed.
3. Remove code paths that query master_clients / nabl_scope / equipment_master / sample_receiving_options if R12 didn't (list what you removed).

HOUSE RULES
- New migration only; never edit applied migrations; never run db:migrate/railway/psql; Amit applies.
- Never open, print or copy .env, .railway-secrets.env or any secret.
- No commit or push unless Amit says "commit". Same UI look; keep Hindi labels.
- Verify: npm run typecheck (≤ 122, baseline 122), npm run lint (≤ 353, baseline 353), npm run build (must pass). Report before/after counts.
ACCEPTANCE: lists show correct totals beyond 10,000; search hits the server; the Client Directory opens fast. Set MST-08/21/54 to IN-PROGRESS.
```

**Hindi:** R2 में list पूरी तो दिखने लगेगी, पर 18,000 clients एक साथ लाना धीमा है। ये prompt search और pagination को server पर ले जाएगा: हर page पर सिर्फ़ ज़रूरी rows आएँगी, search database में होगी, और list तुरंत खुलेगी। Search तेज़ करने के लिए indexes बनेंगे। पुराने app की जो tables अब इस्तेमाल नहीं होतीं, उन्हें "legacy" mark करके lock किया जाएगा, मिटाया नहीं जाएगा। Code में जो हिस्से ऐसी tables ढूँढते हैं जो अब हैं ही नहीं, वो साफ़ होंगे।

---

## 6. What Finance will depend on (and which prompt prepares it)

| Finance need | Master / object | Live today | Prompt |
|---|---|---|---|
| Bill-to / ship-to, GSTIN per site | client_sites | missing | R6 |
| Place of supply (CGST+SGST vs IGST) | india_states, client gst_state_code, company gst_state_code | missing | R6 + R13 |
| PAN, GST registration type, credit days/limit, TDS 194J, accounts contact | clients, client_contacts | missing (only opening_balance + Dr/Cr, payment_term) | R6 |
| Correct MSME scale for fee concessions | clients.msme_category / company_scale_source | 99.8% default "Medium" | R6, R9 |
| Company PAN/TAN/CIN/LUT/e-invoice, bank, UPI | company_profile | bank fields exist; statutory missing | R13 |
| Gap-free FY numbering | document_series + next_document_number() | split (lab_prefixes 0 rows, legacy app_settings) | R13 |
| Service catalogue with SAC, GST, scale prices | products_services_master + sac_hsn_codes | 1 item; 10 services stranded in legacy service_offerings | R12 |
| GST rates with dates (incl. Sep-2025 slabs) | gst_rates | 0/5/12/18/28, no dates | R13 |
| BIS statutory fees at actuals + concessions | bis_fee_components, is_code_marking_fees, fee_concessions, estimate_bis_fees() | fixed columns on is_codes | R9 |
| Invoice ↔ licence ↔ client ↔ factory ↔ scheme ↔ IS | bis_projects FKs | scheme/site missing | R6 + R7 |
| Lab cost pass-through | laboratory_is_rates | missing | R10 |
| Audit trail; billed clients can't be deleted | audit_log, archive, RESTRICT FKs | missing; finance FKs are SET NULL | R5 |
| DB-enforced permissions on finance tables | app_is_admin / app_module_level | everything `true` | R1 + R4 (extend to finance_* when Finance starts) |
| Finance tables themselves | finance_quotations/sales_orders/proforma/tax_invoices/credit_notes/customer_statements + LIMS quotations | exist live, nearly empty (1 quotation) | Finance phase (GimBooks comparison) |

---

## 7. Couldn't verify / caveats

- **Didn't actively probe the anon exposure** of `app_users` (no request with the anon key). The conclusion comes from grants + no RLS + PostgREST config (`anon` role, schema `public`), which is enough to treat it as exposed.
- **GoTrue behaviour** with `GOTRUE_DISABLE_SIGNUP=true` (admin-API creation keeps working) is standard GoTrue behaviour; I didn't test it live.
- **Didn't check** whether the 257 portal passwords are still valid, or whether the old app used `PORTAL_CREDENTIAL_KEY` on some other column. Values in `bis_projects` are plain (average 11 characters).
- **Didn't run `npm run build`** (only typecheck = 122 and lint = 353), to avoid writing `dist/`, which is gitignored anyway.
- **links.bis.gov.in** was not re-tested. The BIS branch list was fetched with curl from the box (the fetch tool timed out). Raipur BO details are "as on 8 Oct 2026".
- GST Sep-2025 rate change: stated from general knowledge. Verify the exact rates before seeding.
- Live checks were read-only `SELECT`s on Postgres-MC1Y, plus a few non-secret flags from the `auth` and `rest` services. Temporary query scripts in `/tmp/qe_audit` on the Mac were removed afterwards. No repo file was modified.
