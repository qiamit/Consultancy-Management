# 02 — Masters Gap Audit + Cursor Fix Prompts (Consultancy Pro / Q Engineering)

- **Repo:** `qiamit/Consultancy-Management` @ `main` 9495c4c (audited read-only from Amit's MacBook, 8 Oct 2026, IST)
- **Scope:** every master module (Client, IS Code, Test Parameter, Product & Services, Company Settings, Users/Module Access, lookup/option masters) + masters that BIS work needs but the app does not have yet.
- **Method:** reviewed migrations in `backend/supabase/migrations/`, `scripts/apply-migrations.mjs`, master pages in `frontend/src/features/masters/**`, BIS consumers in `frontend/src/features/bis/**`, finance consumers in `frontend/src/features/finance/**`, and the Chrome extension. Checked against public BIS / Manak Online / CRS / LIMS-BIS pages (section C).
- **Status legend (used by the regular-work prompt in section E):** `OPEN` → `IN-PROGRESS` → `DONE (commit <sha>)` / `WONTFIX (reason)`
- **Suggested repo location:** copy this file to `docs/audits/02_masters_gap_audit.md` so Cursor can read and update it. The prompts below assume that path.

> **Read this first: the repo's migrations do not describe the live database.** `scripts/apply-migrations.mjs:11-36` marks the LIMS baseline, the products/finance stack and `20261003190000_consultancy_bis_domain.sql` as "skipped", because the tables already existed from the old Consultancy Pro app. Live columns used by the code (`clients.name/phone/city/notes`, `is_codes.is_code_title/aspect_of_is`, `test_parameters.test_name/unit/specified_value`, `product_master_items`, `finance_*`, `transactions`) are not created by any migration in the repo. Prompt P1 fixes this, and every later prompt depends on it.

---

## (A) Masters inventory

| # | Master | Route / UI | Main tables | Key frontend files | List / search / export / import | Validation | Audit / soft-delete | Used by |
|---|---|---|---|---|---|---|---|---|
| 1 | **Client Master** | `/masters/clients` | `clients` (+ `client_master_options`; legacy unused `master_clients`) | `features/masters/clients/*` (ClientsMasterPage 1545 lines, ClientsForm, ClientsTable, ClientDetailsDialog); quick-add `features/sample-handling/receiving/AddClientDialog.tsx` | Client-side search/sort/paginate over the full table; CSV export/import; print courier slip; bulk delete (UI-gated to Director) | GSTIN regex, 10-digit mobile, email, PIN (`clients/types.ts:142-164`), main form only | `created_at/updated_at` only; hard delete | bis_projects, bis_new_applications, license_surveillance (CASCADE), bis_sample_failure_replies (CASCADE), quotations, finance sale docs (`saleDocumentsApi.ts:113`), samples, equipment, consent letters, OSL lab lookup, email tools, dashboard (18 files query `clients` directly) |
| 2 | **IS Code Master** (Amit's "IS pod master") | `/masters/is-codes` | `is_codes`, `is_code_files` (+ storage bucket), `is_code_master_options` (aspect) | `features/masters/is-codes/*` (IsCodesMasterPage 1485 lines, IsCodesForm, IsCodeDetailsDialog, files dialog); quick-add `sample-handling/receiving/AddIsCodeDialog.tsx`; extension `extensions/qe-consultancy-chrome/is-code-fetch.js` | Client-side search; CSV export/import (upsert on `is_number,revision_year`); file attach; fetch from BIS via extension | Must start with "IS", needs a revision year and a title | timestamps only; hard delete | bis_projects.is_code_id, license_surveillance (RESTRICT), sample failure (RESTRICT), test_parameters (SET NULL), FTR/OSL/print modules, QI assistant, knowledge search (16 files query `is_codes`) |
| 3 | **Test Parameter Master** | `/masters/test-parameter` | `test_parameters`, `test_parameter_units`, `accreditation_bodies` | `features/masters/test-parameter/*` (Master 1293, Table 1433, Uncertainty dialog 1287) | Client-side search; CSV import with partial dedupe | Required item name only | none | FTR (`FactoryTestReportModuleFields`, `FtrIsTestParameterDialog`), OSL sample requirements, scheme-of-inspection print, LIMS leftovers |
| 4 | **Product & Services** | `/masters/product-services` | `products_services_master`, `product_item_categories`, `product_makes`, `gst_rates`, units (`test_parameter_units`) | `features/masters/products-services/*` (the route maps here via `ProductServicesPage.tsx`) | Search, export/import, delete | Numeric parsing | none | Quotation and sale documents (line items) |
| 5 | NABL Scope (legacy LIMS) | none (no route) | `nabl_scope` | `features/masters/product-services/*` | n/a | n/a | n/a | Dead code |
| 6 | Equipment Master (legacy LIMS) | none (no route) | `equipment_master`, `iqc_masters` | `features/masters/equipment-master/*` | n/a | n/a | n/a | Dead code |
| 7 | **Company Settings** (company master) | `/settings/lab` | `lab_settings` (not a singleton) + `company_settings` (singleton id=1), synced by `20261004010000` | `features/settings/LabSettingsPage.tsx` (2156), `lab-settings/LaboratoryDetailsTab.tsx` | single record | GST input uppercase only | none | Letterheads, quotation/invoice header, bank details, BIS print signatory |
| 8 | **Users / Module Access** | `/settings/users`, `/settings/module-access` | `user_profiles`, `module_access_rules`, GoTrue `auth.users` | `features/settings/user-management/*`, `module-access/*`, `lib/moduleAccess.ts`, `lib/isLaboratoryDirector.ts` | list | n/a | none | Every module (UI gating), `case_handled_by`, staff modules |
| 9 | Lookup / option masters | inline "+" buttons | `client_master_options`, `is_code_master_options`, `lab_master_options` (BIS branch names, officer names, inspection type, designation…), `sample_receiving_options` | `bis/projects/bisMasterOptions.ts`, `settings/lab-settings/labMasterOptions.ts`, `MasterOptionFieldWithAdd.tsx` | add/rename/delete inline | none | none | Client form, application details, staff modules |
| 10 | **Missing masters BIS work needs** | none | none | none | none | none | none | Factory/manufacturing sites, client contacts, BIS branch offices, BIS officers, laboratories (BIS/OSL/empanelled), certification schemes, BIS fee schedule, licence status, document types, state/GST state codes, SAC codes |

---

## (B) Gap tables (ID · gap · severity · evidence · recommended fix)

Severity: **Critical** = data loss, security or legal risk now · **High** = blocks BIS correctness or the finance module · **Medium** = quality/UX/maintainability · **Low** = cleanup.
All items start as `OPEN`.

### B0. Cross-cutting (all masters)

| ID | Gap | Sev | Evidence | Recommended fix | Status |
|---|---|---|---|---|---|
| MST-01 | Repo migrations do not match the live schema. Several migrations are "skipped" and legacy columns or tables exist only in the live DB. No generated DB types. | High | `scripts/apply-migrations.mjs:11-36`; `20261003210000_module_schema_bridge.sql:10-12,69-71,130-155` reference `is_code_title`, `aspect_of_is`, `test_name`, `product_master_items`; `20260501000001_lims_compat_on_consultancy_db.sql:12-22` reference `clients.phone/notes/city` | Commit a `pg_dump --schema-only` snapshot to `backend/supabase/schema/live_schema.sql`, generate `frontend/src/types/database.ts`, and record the real column types (e.g. `revision_year`, `project_kind`, `status`) | OPEN |
| MST-02 | RLS is `USING (true) WITH CHECK (true)` for every authenticated user on all masters. Delete/import is limited only in the UI (`LaboratoryDirectorOnly`), and "view-only" module access is just a CSS class, so any logged-in user can still change or delete data through the API. | High | baseline `20260501000000_baseline_schema.sql:1047-1063`; `20261003210000:166-181`; `20261003220000:106-117`; `ClientsFooterBar.tsx:63`; `RequireModuleAccess.tsx:51-56` | Add SQL helpers `app_is_admin()` and `app_module_level(module_key)` that mirror `lib/moduleAccess.ts`, then per-command policies: SELECT for all authenticated, INSERT/UPDATE need `edit`, DELETE needs admin | OPEN |
| MST-03 | Privilege escalation: any authenticated user can write `module_access_rules` and (per the baseline) update `user_profiles.designation`. Admin is a free-text designation match. `handle_new_user` copies `designation` from signup metadata, which the user controls. | Critical | `20260813000001_module_access_rules.sql:46-65`; baseline `:1131,1133` (verify live); `lib/isLaboratoryDirector.ts:5-16`; `20260820000000_user_profiles_handle_new_user_email.sql:25`; `hooks/useAuth.ts:289-299` | Only admins can write module_access_rules and the designation/status columns. Ignore designation from signup metadata. Confirm GoTrue `GOTRUE_DISABLE_SIGNUP=true` on Railway. Add a `role` column (enum) next to designation | OPEN |
| MST-04 | Hard deletes with no audit trail or soft delete. **Deleting a client cascades** to its surveillance records and sample-failure replies, and orphans its licences (bis_projects.client_id → NULL). | Critical | `20261003240000_bis_surveillance_sample_failure.sql:6,34` (`ON DELETE CASCADE`); `20261003190000_consultancy_bis_domain.sql:27` (`SET NULL`); `ClientsMasterPage.tsx:949` (`.delete().in('id', ids)`) | Add `is_active`, `archived_at`, `archived_by`, `created_by`, `updated_by` on masters; a generic `audit_log` trigger; replace delete with Archive; add an admin-only `delete_master_row()` RPC that refuses when references exist; change those FKs to RESTRICT | OPEN |
| MST-05 | No shared data layer. Quick-add dialogs skip the master's validation and normalisation, which creates duplicates in different formats. | High | 18 files `from('clients')`, 16 files `from('is_codes')`; `sample-handling/receiving/AddClientDialog.tsx:272-292` (no GST/mobile/PIN checks, no title case), used by `BisProjectsForm.tsx:707` and `QuotationForm.tsx:2441`; `AddIsCodeDialog.tsx:100-113` (no IS normalisation, `testing_charges: null`) | Create `features/masters/clients/clientsApi.ts` and `is-codes/isCodesApi.ts` (normalise, validate, insert, update, search) and have every caller use them | OPEN |
| MST-06 | `GRANT SELECT ON ALL TABLES … TO anon`. Safety depends entirely on RLS being on for every table. | Medium | `20261003210000_module_schema_bridge.sql:339`; `20261003220000_master_support_tables.sql:120` | Revoke from anon and re-grant only the public CMS tables (`website_*`). Add a check query that lists public tables without RLS | OPEN |
| MST-07 | Secrets readable by every user: Manak portal passwords stored in plain text on `bis_projects` and put into the URL query string (browser history, referrer, server logs); AI provider API keys in `ai_models` are readable by all authenticated users. | Critical | `20261003190000:43-44`; `bisProjectsApi.ts:348`; `manakExtensionBridge.ts:48-62` (`passwd` query param); baseline `:18,1041` | Move credentials to `client_portal_accounts` with pgcrypto encryption and an admin-only, audited `reveal_portal_secret()` RPC; pass credentials to the extension via `postMessage`, never in a URL; expose `ai_models` through a view without `api_key` | OPEN |
| MST-08 | Lists fetch the whole table and filter in the browser. A PostgREST max-rows cap can silently cut lists short, and this slows down as data grows. | Medium | `ClientsMasterPage.tsx:238-241`; `IsCodesMasterPage.tsx:269` | Server-side search (`ilike` + `pg_trgm` index), `range()` pagination, count | OPEN |

### B1. Client Master

| ID | Gap | Sev | Evidence | Recommended fix | Status |
|---|---|---|---|---|---|
| MST-10 | Missing statutory identity fields: PAN, CIN/LLPIN, Udyam no. + MSME category + date, constitution (Proprietorship/Partnership/LLP/Pvt Ltd/Public Ltd/Govt/Trust), sector (Private/Public; Form-I hardcodes "Private"), startup (DPIIT) and women-entrepreneur flags, which drive BIS fee concessions (80% micro/startup, 50% small, +10% women). | High | `clients/types.ts:15-35`; baseline `:58-79`; `bis/print/bisForm1Html.ts:436` | New columns + validators; compute company_scale from Udyam category; concession flags feed the fee master (MST-74) | OPEN |
| MST-11 | Only one address. No separate registered office / **factory (manufacturing premises)** / billing / correspondence addresses. Form-I uses the client address for both office and factory. BIS needs a separate application per factory location. | Critical | `bisForm1Html.ts:421-422,431-434`; BIS FAQ Q10-11 | New `client_sites` table (site_type, address, district, state, PIN, GSTIN per site, geo, contact). `bis_projects.factory_site_id` FK; Form-I/OSL/location map read from the site | OPEN |
| MST-12 | Only one contact (name/mobile/email). No top management, authorised signatory, QC in-charge or accounts contact, no landline/website. Form-I top management comes from the single contact person. | High | `bisForm1Html.ts:437-439`; `clients/types.ts:21-24` | New `client_contacts` table (role, name, designation, mobile, email, is_primary, is_signatory); keep legacy columns synced from the primary contact | OPEN |
| MST-13 | Validation gaps: GSTIN regex only (no checksum, no state-code ↔ state check, PAN not derived from it); mobile accepts any 10 digits regardless of country code; **CSV import skips all validation**; quick-add has none. | High | `clients/types.ts:142-158`; `ClientsMasterPage.tsx:1040-1063`; `AddClientDialog.tsx:272-292` | Shared `lib/indiaValidators.ts` (GSTIN mod-36 checksum, PAN, Udyam, CIN, LLPIN, mobile `^[6-9]\d{9}$` for +91, PIN, email) used by form, import (row-level error report) and quick-add; DB CHECK constraints `NOT VALID` so old rows keep working | OPEN |
| MST-14 | Weak duplicate detection: unique index on exact, case-sensitive `company_name`, while the dedupe migration matched `lower(trim())`. No GSTIN/PAN uniqueness. The dedupe migration DELETEd rows without re-pointing child FKs. "Copy" makes "X - Copy" clients. | High | `20261005110000_clients_company_name_unique.sql:7-19,24`; `ClientsMasterPage.tsx:751` | Unique on `lower(btrim(company_name))`, partial unique on GSTIN; pg_trgm "possible duplicate" warning before save; one-off orphan-check SQL; a merge-clients admin tool | OPEN |
| MST-15 | Option lists drift between code and DB. TS enums differ from the seeded options (e.g. "Trader", "50 % Advance", "Net 30" exist only in the DB). CSV import silently changes unknown values to defaults. Types missing for BIS work: Importer, Foreign Manufacturer, AIR (FMCS), Jeweller, Trader. | Medium | `clients/types.ts:1-13,57-70` vs `20261003220000:75-99`; `pickCsvEnum` in `ClientsMasterPage.tsx:1047-1061` | One source of truth: the `client_master_options` table seeded with the full list, loaded via a hook; import reports unknown values instead of coercing them | OPEN |
| MST-16 | Testing labs are stored as clients (`company_type='Testing Laboratory'`) and looked up by fuzzy name. There is no OSL code, recognition validity or IS scope. | High | `bis/projects/bisProjectsApi.ts:246-276` | Separate Laboratory master (MST-72); migrate those rows; OSL module stores `laboratory_id` | OPEN |
| MST-17 | Finance fields are thin: opening balance + Dr/Cr only. No GST state code / place of supply, credit limit/days, TDS section (194J), billing currency, or e-invoice applicability. Quotation GST mode (intra/inter) comes from template toggles, not from the client's state. | High | `clients/types.ts:30-32`; `finance/sale/quotation/QuotationForm.tsx:413-414`; `quotation/types.ts:305-337` | Add the billing fields; derive `gst_state_code` from GSTIN; finance chooses CGST+SGST or IGST by comparing company and client state codes | OPEN |
| MST-18 | Defaults hard-coded to Raipur/Chhattisgarh in TS and DB. | Low | `clients/types.ts:72,177`; baseline `:71` | Read defaults from company settings | OPEN |
| MST-20 | No client lifecycle: status (Prospect/Active/Inactive/Blacklisted), lead source / referred by, account manager (user FK). `case_referred_by` / `case_handled_by` are free text on projects. | Medium | `20261003190000:38-39`; `bis/projects/types.ts:60-61` | `client_status`, `lead_source`, `referred_by`, `account_manager_id` on clients; projects default from the client | OPEN |
| MST-21 | Legacy leftovers: unused `master_clients` table; `clients.name` legacy NOT NULL column kept in sync by a trigger. | Low | baseline `:325-338`; `20261005120000_clients_sync_name_column.sql` | Document now; drop later once MST-01 confirms nothing reads them | OPEN |

### B2. IS Code Master

| ID | Gap | Sev | Evidence | Recommended fix | Status |
|---|---|---|---|---|---|
| MST-30 | Missing BIS standard metadata: prefix (IS, IS/IEC, IS/ISO), part, section, ICS, technical department, technical committee (e.g. "CED 2"), superseding IS / superseded by, status (Current/Withdrawn/Superseded), degree of equivalence, group/sub-group, certification category (Voluntary / Compulsory / Not certifiable). The extension already sees "Voluntary/Mandatory", "Department" and "Technical Committee" but throws them away. | High | `is-codes/types.ts:18-41`; baseline `:214-226`; `extensions/qe-consultancy-chrome/is-code-fetch.js:866-917` | New columns; extend the scraper's `fields` map and the form | OPEN |
| MST-31 | No QCO / compulsory-certification data: scheme (Scheme-I / II / IV / X / FMCS / Hallmarking), QCO name, S.O. number and date, ministry, enforcement date, transition or extension orders. | High | none exist; see section C2 | New table `is_code_qcos` (many per IS) + `certification_scheme_id` (MST-73) | OPEN |
| MST-32 | IS number normalisation bug: the form forces `IS ${rest}`, so "IS/IEC 62368" becomes "IS /IEC 62368". Part/Sec are typed in inconsistently. Import and quick-add don't normalise. The natural-key unique index came from the skipped baseline and may be missing live. | High | `IsCodesMasterPage.tsx:1015-1020,1054-1055,1221`; `AddIsCodeDialog.tsx:101`; baseline `:856` | Structured fields (prefix, number, part, section, year) + generated `is_key` (canonical, uppercase) with a unique index; one `normalizeIsNumber()` used everywhere | OPEN |
| MST-33 | Amendments stored as one text field (a count); reaffirmation is a single year. No amendment list (no., date, summary, PDF). | Medium | `is-codes/types.ts:23`; baseline `:218-219` | New `is_code_amendments` table (amendment_no, issued_on, effective_on, summary, file) | OPEN |
| MST-34 | Fees are hard-coded columns on `is_codes` (MMF for 4 scales + 3 slabs) with no effective dates or history. BIS has amended the marking-fee notification ~25 times (latest 02.01.2026 and 10.06.2026). Small/micro should be derived (0.5× / 0.2× large), and concessions depend on the client, not the IS. | High | `20261004200000_is_codes_qe_fee_fields.sql:4-16`; BIS fee page (C3) | `is_code_marking_fees` (effective_from/to, unit, MMF large/medium, slab rows) + derived small/micro; keep the old columns as a read-only compatibility view until callers move | OPEN |
| MST-35 | Product and standard are mixed up. The IS title is used as the product name in Form-I, Part/Section are blank, and one IS can cover many products or varieties. No product manual / SIT / grouping-guideline link or HSN code. | High | `bisForm1Html.ts:440-447`; `is-codes/types.ts:28` (only `product_manual_number`) | New `is_code_products` table (product name, varieties/grades, HSN, unit, PM no., SIT file, grouping guideline); licence scope picks varieties from it | OPEN |
| MST-36 | The delete flow loses files: storage objects are removed **before** the DB delete, and that delete is blocked (RESTRICT) when surveillance or sample-failure rows reference the IS. Result: PDFs gone, row still there. | Critical | `IsCodesMasterPage.tsx:1106-1118`; `20261003240000:7,35` | Check references first (RPC), delete DB rows in a transaction, remove storage last; prefer Archive (MST-04) | OPEN |
| MST-37 | `revision_year` type is unclear: text in the baseline, but the code treats it as int ("QE DB: revision/reaffirmation are int"). Label format differs between modules. | Medium | baseline `:217`; `IsCodesMasterPage.tsx:1026`; `formatIsCodeLabel.ts:1-16` | Confirm via MST-01; standardise to `smallint` + one label formatter (BIS style `IS 1786 : 2008`, configurable) | OPEN |
| MST-38 | `testing_charges` is a single number, but BIS-recognised labs charge different amounts per IS. | Medium | `is-codes/types.ts:26` | Move to `laboratory_is_rates` (MST-72); keep the field as "indicative" | OPEN |

### B3. Test Parameter Master

| ID | Gap | Sev | Evidence | Recommended fix | Status |
|---|---|---|---|---|---|
| MST-40 | No DB uniqueness. Import dedupe uses the free-text `is_code_label` + item name (not clause) and doesn't dedupe within the file. The denormalised label goes stale when the IS is revised. | High | `TestParameterMasterPage.tsx:1112-1133`; baseline `:567-584`; backfill `20261003220000:48-72` | Unique `(is_code_id, coalesce(clause_no,''), lower(item_name))` (after cleanup); label becomes a view/computed value; import keys on `is_code_id` | OPEN |
| MST-41 | Requirement is free text. No structured limits (min/max/nominal/comparator + unit FK), test type (Acceptance / Routine / Type), SIT frequency, sample size, or criticality, all of which the FTR / Scheme of Inspection prints need. | Medium | `test-parameter/types.ts:1-18`; `bis/print/updatedSchemeOfInspectionHtml.ts`, `bis/projects/factoryTestReportModel.ts` | Add structured columns (nullable) + `unit_id` FK; keep text for display | OPEN |
| MST-42 | LIMS-only fields (department, designation, uncertainty JSON, `under_accreditation_ids uuid[]`, which can't have an FK) clutter consultancy use. | Low | `test-parameter/types.ts:10-16` | Hide behind a "LIMS fields" section; junction table if accreditation is still needed | OPEN |

### B4. Product & Services Master

| ID | Gap | Sev | Evidence | Recommended fix | Status |
|---|---|---|---|---|---|
| MST-50 | The catalogue is LIMS-shaped (Calibration/Testing). There is no consultancy service list: BIS Scheme-I new licence (normal / simplified), renewal, inclusion, surveillance support, sample-failure reply, CRS registration / renewal / inclusion, FMCS + AIR, Hallmarking registration, ISO, testing coordination, documentation, annual retainer. | High | `products-services/types.ts:7`; seed `20261003210000:164-165` | Seed consultancy categories and services; add `service_kind`, `certification_scheme_id`, optional `is_code_id`, pricing by company scale | OPEN |
| MST-51 | HSN and SAC are not distinguished (only `hsn_code`). Consulting needs SAC (9983xx). `gst_rates` has no effective dates. | Medium | `products-services/types.ts:18`; `20261003220000:17-26` | `code_type` (HSN/SAC) + code validated against a small `sac_hsn_codes` master; effective-dated GST rate | OPEN |
| MST-52 | Inventory fields (opening stock, low-stock alert, purchase price, make) don't apply to services. No "government fee at actuals / pure-agent reimbursement" flag for BIS fees billed to clients. | Medium | `products-services/types.ts:16-28` | Show inventory fields only for `item_type='Product'`; add `is_reimbursable` / `is_pure_agent` + default GST 0 for BIS statutory fees | OPEN |
| MST-53 | Make/category are stored as text; renames are cascaded by app code; no FK. | Low | `products-services/makeApi.ts:81`; `itemCategoryApi.ts:82-96` | FK columns `make_id` / `category_id` (keep text for now) | OPEN |
| MST-54 | Dead masters still shipped: NABL scope, Equipment master, LIMS uncertainty tools. | Low | `ProductServicesPage.tsx:5-14` (no `/masters/nabl-scope` route in `App.tsx`); `features/masters/equipment-master/*` (no route) | Mark deprecated or delete after confirming nothing imports them | OPEN |

### B5. Company Settings, Users, lookups

| ID | Gap | Sev | Evidence | Recommended fix | Status |
|---|---|---|---|---|---|
| MST-60 | Two sources of truth for company data: `company_settings` (singleton) and `lab_settings` (multi-row, newest wins). Missing PAN, CIN, Udyam, GST state code, LUT/e-invoice flags, FY document-number series. | High (finance) | `20261004010000_sync_company_settings_to_lab_settings.sql:22-26`; baseline `:290-323`; `20261003190000:79-87` | Make `lab_settings` a singleton (or a `company_profile` view); add the statutory fields; add `document_series` (doc_type, FY, prefix, next_no) | OPEN |
| MST-61 | Free-text option lists for BIS concepts (branch name, officer names, inspection type) in `lab_master_options`. All officer roles share one list. | Medium | `bis/projects/bisMasterOptions.ts:4-35`; `20261004160000_bis_application_details_fields.sql:8-16` | Replaced by MST-70/71 (keep text columns as fallback) | OPEN |

### B6. Masters that BIS work needs but the app doesn't have

| ID | Gap | Sev | Evidence | Recommended fix | Status |
|---|---|---|---|---|---|
| MST-70 | **BIS Branch Office master**: code (e.g. DLBO-I, KKBO), region (CRO/ERO/NRO/SRO/WRO), address, head, email, states covered. | Medium | `bis_projects.branch_name/branch_state` free text (`20261004160000:8-9`) | `bis_offices` table seeded from bis.gov.in; `bis_projects.bis_office_id` | OPEN |
| MST-71 | **BIS Officer master**: name, grade (Scientist-B…G), role, branch FK, contact. | Medium | `bisMasterOptions.ts:10-23` | `bis_officers` table; project officer fields become FKs plus a text snapshot | OPEN |
| MST-72 | **Laboratory master**: type (BIS lab / BIS-recognised OSL / empanelled / in-house / NABL), OSL code, recognition valid from/to (LRS: about 3 years), NABL cert no. + validity, address, IS scope, testing rate per IS, contact. | High | MST-16 evidence | `laboratories`, `laboratory_is_scope`, `laboratory_is_rates` | OPEN |
| MST-73 | **Certification scheme master**: Scheme-I (ISI, CM/L-), Scheme-II (CRS, R-), Scheme-IV (CoC), Scheme-X, FMCS (Scheme-I foreign + AIR), Hallmarking, ECO mark (now CPCB). Each has a licence-number prefix, validity rules and fee components. `bis_projects` has no scheme column, so everything is treated as a CM/L licence. | High | `bis/projects/types.ts:32-41`; `manakExtensionBridge.ts:122-125` (10-digit CM/L assumption) | `certification_schemes` seed + `bis_projects.certification_scheme_id` (default Scheme-I) | OPEN |
| MST-74 | **BIS fee master**: application ₹1,000; inspection ₹7,000/man-day; annual licence fee ₹1,000; product marking fee (per IS); CRS ₹1,000 + ₹25,000 (+₹10,000 per extra report), renewal ₹28,000; FMCS contingency ₹10,000; hallmarking per-article charges. All effective-dated, with MSME/startup/women concessions until 31-05-2029. | High (finance) | not in schema; C3 | `bis_fee_components` (scheme, component, amount, unit, effective dates) + `fee_concessions`; helper `estimate_bis_fees(client, is_code, scheme, date)` | OPEN |
| MST-75 | **Document type master** for licence files and checklists per scheme (Form-I, CMPF 305/306/307/310/311, undertakings, plant layout, process flow, test reports, AIR nomination…). Today `doc_kind` is free text defaulting to 'legal'. | Medium | `20261004120000_bis_project_files.sql:6` | `document_types` (code, name, scheme, required_for_stage, sort) + FK on files | OPEN |
| MST-76 | **Licence status lookup** matching Manak (Operative / Deferred / Under Stop Marking / Suspended / Expired / Cancelled), kept separate from workflow status. App status options include `stop_marking`, which is not in the `project_status` enum; app project kinds ('Application'/'Licence'/'Inclusion') don't match the `bis_project_kind` enum (verify live types via MST-01). | High | `bis/projects/types.ts:22-41` vs `20261003190000:3-21` | `licence_statuses` table + `bis_projects.licence_status_id`; reconcile column types after MST-01 | OPEN |
| MST-77 | **State / GST state-code master** (36 states/UTs, 2-digit GST code, Manak state spelling). Used to validate GSTIN, set place of supply and match Manak reports. | Medium | `clients/types.ts:75-108` (missing UTs such as Chandigarh, DNH&DD, Lakshadweep, A&N) | `india_states` seed table; client/site state becomes an FK-backed select | OPEN |

---

## (C) BIS reference summary (fields to adopt + sources)

> Fetched 8 Oct 2026. **links.bis.gov.in could not be reached** (fetch tool got HTTP 500; curl from the box got a TLS handshake EOF on https and a timeout on http). Items marked *(verify against PDF)* come from search excerpts or secondary sources. Check them against the linked BIS PDF before entering amounts.

### C1. Manak Online: licence / application data model
Source: https://www.manakonline.in/MANAK/ApplicationLicenceRelatedrpt (public reports: Licence Details, Application Status, Know Your Product, Licence-wise Contact)
- **Licence list columns:** Licence No · Firm Name & Address · District · State · Country · Technical Division · IS No · Validity Date · Status · Variety/Type · Brand Names. → `bis_projects`: licence_no, factory_site (address/district/state/country), technical_division, is_code, valid_upto, licence_status, varieties, brands.
- **Licence status values:** Operative · Deferred · Under Stop Marking (plus Suspended / Expired / Cancelled in the BIS rules). → MST-76.
- **Licence number prefixes:** `CM/L-` + 10 digits (Scheme-I ISI), `R-` + 8 digits (CRS registration). Hallmarking registration and FMCS have their own forms. → MST-73 `licence_no_pattern`.
- **Application status columns:** Application No · Branch · Category · Procedure (Normal / Simplified) · Scale (Large/Medium/Small/Micro) · Sector · Firm Address vs Factory Address and contacts. → separate firm and factory site (MST-11), branch (MST-70), scale (MST-10).
- **Know Your Product:** IS No · Product Name · Technical Committee · Group · Marking Fee/year · Scheme of Testing & Inspection. → MST-30/34/35.
- **Licence-wise contacts** split into user / factory / firm contacts. → MST-12 roles.

### C2. Standards metadata (BIS Connect "Know your standards")
Source: https://www.services.bis.gov.in/php/BIS_2.0/bisconnect/knowyourstandards/Indian_standards/isdetails/MjU4ODE=
Fields shown: IS Number (with Part/Sec and dual-number e.g. IS/IEC) · Title · Superseding IS · Degree of Equivalence · Revision no. · Amendments (list) · Reaffirmation year · Technical Department · Technical Committee · ICS · Group / Sub-group / Sub-sub-group · Aspect · Certification (Voluntary / Not certifiable / Compulsory) · Ministries · ITC-HS. → MST-30/32/33.
Compulsory lists and QCOs:
- https://www.bis.gov.in/product-certification/products-under-compulsory-certification/?lang=en
- https://www.bis.gov.in/product-certification/products-under-compulsory-certification/scheme-i-mark-scheme/?lang=en
- https://www.bis.gov.in/product-certification/products-under-compulsory-certification/scheme-ii-registration-scheme/?lang=en
- https://www.bis.gov.in/upcoming-qcos-notified-and-due-for-implementation/?lang=en
→ `is_code_qcos`: qco_title, ministry, so_number, so_date, enforcement_date, scheme, status (Notified / In force / Deferred / Withdrawn), source_url. (MST-31)

### C3. Fees (product certification, Scheme-I)
- FAQ: https://www.bis.gov.in/product-certification/product-certification-faq/?lang=en: application fee ₹1,000; inspection ₹7,000 per man-day; annual licence fee ₹1,000 plus the product marking fee; **a separate application for each IS and each factory** (Q10/11); licence validity up to 2 years initially, renewal up to 5 years; Option-1 normal procedure (factory inspection then grant) vs Option-2 simplified procedure (test report from a BIS / BIS-recognised lab first); test reports not older than 90 days *(verify against PDF)*.
- Fee notification and amendments: https://www.bis.gov.in/product-certification/product-certification-fee/?lang=en (base 05.08.2021, amendments up to 02.01.2026 and 10.06.2026, including the concession extension).
- Marking fee for all products (latest PDF): https://www.bis.gov.in/wp-content/uploads/2026/09/Marking-fee-for-all-products-under-certification-scheme-1.pdf. Columns: S.No · IS No · Product · Unit · Minimum Marking Fee (large, medium) · slab rates per unit. **Small = 0.5× large, Micro = 0.2× large** (MMF). → MST-34.
- MSME/startup concessions *(verify against PDF; secondary source)*: micro and startups 80%, small 50%, extra 10% for women-led units, valid until 31-05-2029. https://evtlindia.com/bis-notification-marking-fee-relief-msmes-startups → `fee_concessions` (MST-74).

### C4. Other schemes
- Conformity Assessment Regulations 2018, Schemes I–X overview (secondary): https://www.lkslaw.com/insights/articles/understanding-the-conformity-assessment-schemes-of-bis
- **CRS (Scheme-II):** fee structure https://www.crsbis.in/BIS/app_srv/tdc/gl/docs/FeeStructure.pdf: application ₹1,000, registration ₹25,000 (+₹10,000 per extra test report / model), renewal ₹28,000, validity 2 years *(verify against PDF)*; FAQ https://www.crsbis.in/BIS/app_srv/tdc/gl/docs/Modified_FAQs.pdf
- **FMCS (foreign manufacturers):** AIR nomination https://www.bis.gov.in/fmcs/certification-process/nomination-of-air/?lang=en; fee list https://www.bis.gov.in/wp-content/uploads/2021/06/LIST-OF-FEE-1.pdf (₹10,000 contingency, inspection per-diem in USD) → client_type "Foreign Manufacturer", contact role "AIR".
- **Hallmarking:** https://www.bis.gov.in/hallmarking-jewellers/?lang=en; guidelines https://www.bis.gov.in/wp-content/uploads/2026/07/Guidelines-for-Jewellers.pdf (jeweller registration, HUID per article).
- **Ecomark:** now administered by CPCB: https://cpcb.nic.in/ecomark-licence/ (keep as a scheme with `authority='CPCB'`).

### C5. Offices
- Branch offices: https://www.bis.gov.in/branch-office/?lang=en · list https://www.bis.gov.in/regional-branch-offices-bis-list/?lang=en · regional offices https://www.bis.gov.in/directory/regional-offices/?lang=en
- Chhattisgarh falls under the Eastern Regional Office (ERO) per https://www.bis.gov.in/system-certification-overview/system-certification-contact-us/?lang=en (check the branch for each client's district).
→ `bis_offices`: code, name, office_type (HQ/RO/BO), region, address, city, state, pin, phone, email, head_name, states_covered[]. (MST-70)

### C6. Laboratories
- BIS LIMS lab search: https://lims.bis.gov.in/home/search_labs/
- Lab Recognition Scheme (LRS): https://www.bis.gov.in/wp-content/uploads/2023/07/LRS_23062020.pdf (recognition about 3 years, OSL code, scope by IS)
- List of BIS-recognised labs: https://www.bis.gov.in/laboratorys/list-of-bis-recognized-lab/?lang=en
→ `laboratories`: name, lab_type, osl_code, bis_recognition_no, recognised_from/upto, nabl_cert_no, nabl_valid_upto, address, state, contact, email; `laboratory_is_scope` (lab, is_code, valid_upto); `laboratory_is_rates` (lab, is_code, rate, tat_days, effective_from). (MST-72)

### C7. Indian identity validators to implement (`lib/indiaValidators.ts`)
| Field | Rule |
|---|---|
| GSTIN | `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$` + mod-36 check digit; chars 1-2 = state code (must match the state); chars 3-12 = PAN |
| PAN | `^[A-Z]{3}[ABCFGHLJPT][A-Z][0-9]{4}[A-Z]$` (4th char = holder type: C company, F firm/LLP, P individual…) |
| Udyam | `^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$` |
| CIN | `^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$` |
| LLPIN | `^[A-Z]{3}-[0-9]{4}$` |
| Mobile (+91) | `^[6-9][0-9]{9}$` |
| PIN | `^[1-9][0-9]{5}$` |
| IFSC | `^[A-Z]{4}0[A-Z0-9]{6}$` |
| IS number | `^(IS|IS/IEC|IS/ISO|IS/ISO/IEC)\s?\d+(\s?\(Part\s?\d+(/Sec\s?\d+)?\))?(\s?:\s?\d{4})?$` (normalise first) |
| CM/L licence | `^CM/L-\d{10}$` · CRS `^R-\d{8}$` |

---

## (D) Ordered fix plan + Cursor prompts

| Order | Prompt | Covers | Why this order |
|---|---|---|---|
| 1 | P1 Live schema snapshot + DB types | MST-01, MST-37 (confirm), MST-76 (confirm types) | Every later migration needs the real schema |
| 2 | P2 Security hardening | MST-02, 03, 06, 07 | Critical; cheap; protects data before bigger changes |
| 3 | P3 Audit log, archive, safe delete | MST-04, 36, 21 (document) | Stops data loss before restructuring |
| 4 | P4 Client Master v2 | MST-05 (clients), 10–15, 17, 18, 20, 77 | Clients feed BIS + finance |
| 5 | P5 BIS reference masters | MST-61, 70, 71, 73, 75, 76 | Needed by IS v2, fees, labs |
| 6 | P6 IS Code Master v2 | MST-05 (IS), 30–33, 35, 37 | |
| 7 | P7 BIS fee master | MST-34, 74 | Needs P4 (scale/concessions) + P6 |
| 8 | P8 Laboratory master | MST-16, 38, 72 | Needs P6 |
| 9 | P9 Test Parameter v2 | MST-40–42 | Needs P6 |
| 10 | P10 Service catalogue for consultancy | MST-50–54 | Needs P5/P7; feeds finance |
| 11 | P11 Company profile + finance readiness | MST-17 (GST mode), 60 | Last step before the Finance module |
| 12 | P12 Server-side lists + cleanup | MST-08, 54, 21 (drop) | Performance + cleanup |

### House rules (included in every prompt)
- Make a **new** migration `backend/supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql` with a timestamp after the newest file (currently `20261005130000`). It must be idempotent (`IF NOT EXISTS`, `DO $$ … $$` guards) and should run inside a transaction.
- **Never edit an already-applied migration.** Never run `scripts/apply-migrations.mjs`, `railway` CLI or anything that touches the live DB. Amit applies migrations himself.
- Never open, print or copy `.env`, `.railway-secrets.env` or any secret.
- Keep existing data (backfill, don't drop). Keep any existing Hindi labels and texts. Don't break other modules that use the table (search all usages first).
- Reuse `limsThemeUi` and the existing MasterPage / form / table patterns.
- Finish with `npm run typecheck`, `npm run lint`, `npm run build`. Fix errors you introduced. Then summarise the changes and set the MST rows in `docs/audits/02_masters_gap_audit.md` to `IN-PROGRESS`.

---

### P1 — Live schema snapshot + DB types (MST-01)

```text
You are working in the Consultancy Management repo (React 19 + TS + Vite frontend in frontend/, self-hosted Supabase stack on Railway, migrations in backend/supabase/migrations/). Read .cursorrules, README.md and docs/audits/02_masters_gap_audit.md (item MST-01) first.

GOAL
The repo's migrations do not describe the live database: scripts/apply-migrations.mjs (SKIP_FILES, lines ~11-36) skips the baseline, the products/finance stack and 20261003190000_consultancy_bis_domain.sql, and legacy columns (clients.name/phone/city/notes, is_codes.is_code_title/aspect_of_is, test_parameters.test_name/unit/specified_value, product_master_items, finance_* tables) exist only live. Build tooling so the real schema is committed and typed. Do NOT connect to the DB yourself.

DO
1. Create scripts/dump-schema.mjs (Node, ESM, no new heavy deps; use the existing `pg` dependency if present, else document `pg_dump`). It reads DATABASE_URL from process.env only (never reads or prints .env files), runs a schema-only introspection of the `public` schema (tables, columns with types/defaults/nullability, constraints, indexes, FKs with ON DELETE rule, enums, views, functions, triggers, RLS flag + policies) and writes:
   - backend/supabase/schema/live_schema.sql (pg_dump --schema-only --schema=public --no-owner --no-privileges, if pg_dump is on PATH), and
   - backend/supabase/schema/live_schema.json (introspection result from information_schema/pg_catalog; works without pg_dump).
   It must never print the connection string.
2. Add npm script "db:schema": "node scripts/dump-schema.mjs" in the root package.json.
3. Create backend/supabase/schema/README.md: how Amit runs it (`DATABASE_URL=... npm run db:schema` or via `railway run`), that the output is committed, and a "Known drift" section listing the skipped migrations from apply-migrations.mjs and the legacy columns above.
4. Create scripts/gen-db-types.mjs that turns live_schema.json into frontend/src/types/database.ts (Row/Insert/Update types per table, enums as string unions). Add npm script "db:types". Commit a placeholder database.ts with a header comment "generated — run npm run db:schema && npm run db:types" (don't invent columns).
5. Add a SQL file backend/supabase/schema/checks.sql (read-only queries, not a migration) that Amit can run: tables without RLS, policies that are USING(true), FKs with ON DELETE CASCADE/SET NULL into masters (clients, is_codes), existence of unique indexes on clients(company_name) and is_codes(is_number, revision_year), data types of is_codes.revision_year, bis_projects.project_kind and bis_projects.status.

CONSTRAINTS
- No migration in this prompt. Don't change app behaviour. Don't touch Railway. Never read/print .env or .railway-secrets.env.
- Keep scripts dependency-light and cross-platform (macOS).

ACCEPTANCE
- `npm run db:schema` fails with a clear message when DATABASE_URL is missing, and does not print secrets.
- README explains the drift and the workflow; checks.sql exists.
- typecheck/lint/build pass.

Finally: summarise the changes, run `npm run typecheck && npm run lint && npm run build`, and set MST-01 to IN-PROGRESS in docs/audits/02_masters_gap_audit.md (Amit will mark DONE after he runs the dump on Railway).
```

### P2 — Security hardening: RLS, roles, secrets (MST-02, 03, 06, 07)

```text
Repo: Consultancy Management. Read .cursorrules, README.md, docs/audits/02_masters_gap_audit.md (MST-02, MST-03, MST-06, MST-07) and backend/supabase/schema/README.md first. If backend/supabase/schema/live_schema.* exists, use it as the truth for column names.

GOAL
Move permissions from UI-only to the database and stop exposing secrets.

EVIDENCE
- RLS policies are USING(true) for all authenticated users: baseline 20260501000000_baseline_schema.sql ~1039-1133, 20261003210000_module_schema_bridge.sql policy loop, 20261003220000_master_support_tables.sql 106-117.
- module_access_rules writable by every authenticated user: 20260813000001_module_access_rules.sql 46-65.
- handle_new_user takes designation from raw_user_meta_data: 20260820000000_user_profiles_handle_new_user_email.sql:25.
- Admin = designation string match: frontend/src/lib/isLaboratoryDirector.ts; view-only = CSS only: components/auth/RequireModuleAccess.tsx 51-56.
- Manak portal password stored on bis_projects.portal_password and sent in the URL as `passwd`: frontend/src/features/bis/projects/bisProjectsApi.ts ~348, manakExtensionBridge.ts 48-62.
- ai_models.api_key readable by all authenticated users.
- GRANT SELECT ON ALL TABLES TO anon: 20261003210000:339, 20261003220000:120.

DO (one new migration, e.g. 20261008100000_security_hardening.sql, idempotent)
1. SQL helpers (SECURITY DEFINER, STABLE, `SET search_path = public`):
   - app_is_admin(): true when the current auth.uid()'s user_profiles row is active and (role = 'admin' OR designation matches the same list as lib/isLaboratoryDirector.ts).
   - app_module_level(p_module text) returns 'none'|'view'|'edit'|'full', mirroring frontend/src/lib/moduleAccess.ts (read it and replicate the rules exactly, including defaults).
   Add a user_profiles.role column (text CHECK in ('admin','staff','viewer'), default 'staff'); backfill 'admin' for the current Laboratory Director designations.
2. Per-command policies on the master tables (clients, client_master_options, is_codes, is_code_files, is_code_master_options, test_parameters, test_parameter_units, accreditation_bodies, products_services_master, product_item_categories, product_makes, gst_rates, lab_master_options, lab_settings, company_settings): SELECT for authenticated; INSERT/UPDATE when app_module_level('<module key>') in ('edit','full') or app_is_admin(); DELETE only for app_is_admin(). Use the module keys from lib/appNav.ts / moduleAccess.ts. Drop the old USING(true) policies by name (guarded with IF EXISTS).
3. module_access_rules: SELECT authenticated; INSERT/UPDATE/DELETE only app_is_admin().
   user_profiles: users may update only their own non-privileged columns (name, phone, avatar). designation, role, status and is_active only by admin (trigger that raises if a non-admin changes them).
4. Replace handle_new_user so it ignores designation/role from raw_user_meta_data (defaults: designation NULL, role 'staff', status 'pending').
5. REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM anon; then GRANT SELECT only on public website_* tables that the public site needs (check the code for anon usage first: grep for website_ and createClient without session). Ensure RLS is enabled on every public table (loop over pg_tables and ENABLE ROW LEVEL SECURITY).
6. Portal credentials: CREATE EXTENSION IF NOT EXISTS pgcrypto; new table client_portal_accounts (id, client_id FK clients ON DELETE RESTRICT, portal text CHECK in ('manak','crs','fmcs','hallmarking','other'), username, secret_enc bytea, notes, created_by, updated_at). Encrypt with pgp_sym_encrypt using current_setting('app.portal_secret_key', true) (raise a clear error if it's not set; document that Amit sets it on Railway with ALTER DATABASE ... SET app.portal_secret_key). Backfill from bis_projects.portal_user_id/portal_password (only when the key is set; otherwise skip and leave a NOTICE). Add bis_projects.portal_account_id FK. RPC reveal_portal_secret(p_account uuid) returns text, admin or edit-level on bis module only, and inserts a row into portal_secret_access_log (user, account, at). Don't drop the old columns yet; add a comment "deprecated, cleared after verification".
7. ai_models: create view ai_models_public without api_key; restrict SELECT on ai_models to admins; switch frontend reads (except the AI settings page) to the view.

FRONTEND
- lib/permissions.ts: fetch role + module level once (reuse the useAuth context) and expose canEdit(module) / canDelete().
- RequireModuleAccess: in view mode hide or disable save/delete/import buttons (not just CSS).
- Manak extension bridge: stop putting passwd in any URL. Send credentials to the extension via window.postMessage to the content script (extend extensions/qe-consultancy-chrome content script with a listener that checks event.origin against the app origin) after calling reveal_portal_secret. Keep the auto-login working.
- BIS project form: portal password field reads/writes through client_portal_accounts (masked, "Reveal" button that calls the RPC).

CONSTRAINTS
- New migration only; don't edit applied migrations; don't run migrations or touch Railway; never print .env or .railway-secrets.env.
- Keep existing data and Hindi labels. Search all usages before changing a table (grep -rn "from('<table>')" frontend/src).
- Write the migration so it's safe to run twice.

ACCEPTANCE
- A non-admin staff user can read masters, edit only where their module level allows, and cannot delete, change module_access_rules or change their own designation/role (show the SQL test steps in a comment block at the end of the migration).
- No URL anywhere contains passwd/password (grep check).
- ai_models.api_key not selected outside settings.
- typecheck/lint/build pass.

Finally: summarise changes (list policies created/dropped), run `npm run typecheck && npm run lint && npm run build`, and set MST-02/03/06/07 to IN-PROGRESS in docs/audits/02_masters_gap_audit.md. Tell Amit exactly which Railway settings to set (app.portal_secret_key, GOTRUE_DISABLE_SIGNUP=true) without showing any secret values.
```

### P3 — Audit log, archive and safe delete (MST-04, MST-36)

```text
Repo: Consultancy Management. Read .cursorrules, README.md, docs/audits/02_masters_gap_audit.md (MST-04, MST-36, MST-21) and the schema snapshot if present.

GOAL
No more silent data loss from master deletes.

EVIDENCE
- license_surveillance.client_id and bis_sample_failure_replies.client_id are ON DELETE CASCADE (20261003240000_bis_surveillance_sample_failure.sql:6,34); bis_projects.client_id ON DELETE SET NULL (20261003190000:27).
- Client delete is a hard delete: ClientsMasterPage.tsx ~949.
- IS delete removes storage files before the DB delete, which can then fail on RESTRICT FKs: IsCodesMasterPage.tsx ~1097-1130.

DO (new migration e.g. 20261008110000_master_audit_archive.sql)
1. audit_log table (id bigserial, table_name, row_id uuid/text, action I/U/D, changed_by uuid default auth.uid(), changed_at timestamptz default now(), old_data jsonb, new_data jsonb, diff jsonb). Generic trigger function audit_row_change() (SECURITY DEFINER, skips when nothing changed). Attach to clients, is_codes, is_code_files, test_parameters, products_services_master, lab_settings, company_settings, module_access_rules, user_profiles. RLS: SELECT admin only; no direct insert/update/delete.
2. On the same master tables add (IF NOT EXISTS): is_active boolean default true, archived_at timestamptz, archived_by uuid, created_by uuid default auth.uid(), updated_by uuid; trigger sets updated_at/updated_by on update.
3. Change FKs to ON DELETE RESTRICT: license_surveillance.client_id, bis_sample_failure_replies.client_id, bis_projects.client_id (and any other FK into clients/is_codes found in the schema snapshot with CASCADE/SET NULL). Drop and recreate by looking up the constraint name in pg_constraint inside a DO block.
4. Function master_reference_counts(p_table text, p_id uuid) returns table(ref_table text, ref_count bigint) using pg_constraint to find referencing FKs dynamically.
5. Function delete_master_row(p_table text, p_id uuid) SECURITY DEFINER: allowed tables only (whitelist), admin only, raises a friendly error listing references if any exist, otherwise deletes. Function archive_master_row / restore_master_row (edit-level).
6. View v_orphan_master_refs: rows in bis_projects / quotations / finance documents whose client_id or is_code_id is NULL or points to nothing (to measure damage from the old dedupe migration 20261005110000, which deleted duplicate clients without re-pointing children).

FRONTEND
- Client, IS Code, Test Parameter, Product & Services masters: replace "Delete" with "Archive" (edit-level) and an admin-only "Delete permanently" that calls delete_master_row and shows the reference list on error. Default list filter is "Active"; toggle "Show archived". Bulk actions work the same way.
- IS Code delete: call master_reference_counts first, delete the DB row via RPC, and only after success remove storage objects; on failure keep the files.
- All pickers/quick-selects (clients, IS codes) show only active rows but still display an archived row that is already selected (with an "Archived" badge).
- Small "History" tab in the client and IS details dialogs reading audit_log (admin only).

CONSTRAINTS
New migration only; never edit applied migrations; don't run migrations/Railway; never print .env/.railway-secrets.env; keep data and Hindi labels; search all usages of `.delete()` on these tables (grep -rn "\.delete()" frontend/src) and route them through the new functions.

ACCEPTANCE
- Deleting a client that has surveillance rows is refused with a clear message; archiving works.
- Deleting an IS with references never removes its files.
- audit_log records insert/update/delete with user id.
- typecheck/lint/build pass.

Finally: summarise changes, run `npm run typecheck && npm run lint && npm run build`, set MST-04/MST-36 to IN-PROGRESS, and give Amit the query `select * from v_orphan_master_refs` to run after applying.
```

### P4 — Client Master v2: identity, sites, contacts, validation, duplicates (MST-05, 10–15, 17, 18, 20, 77)

```text
Repo: Consultancy Management. Read .cursorrules, README.md, docs/audits/02_masters_gap_audit.md (MST-05, MST-10..MST-18, MST-20, MST-77) and the schema snapshot.

GOAL
Make the Client Master correct for BIS applications and ready for finance.

EVIDENCE
- frontend/src/features/masters/clients/types.ts (fields 15-35, enums 1-13/57-70, validators 142-164, defaults 72/177).
- ClientsMasterPage.tsx: save 682-731, copy 751, import 1011-1099 with no validation (payload 1040-1063, upsert onConflict company_name 1086).
- Quick-add without validation: sample-handling/receiving/AddClientDialog.tsx 272-292 (used by BisProjectsForm.tsx:707, QuotationForm.tsx:2441).
- Form-I uses client.address for office AND factory, sector hardcoded 'Private', top management = contact person: bis/print/bisForm1Html.ts 410-453.
- Unique index on exact company_name (20261005110000_clients_company_name_unique.sql:24).

DO — migration (e.g. 20261008120000_clients_v2.sql)
1. india_states (code text PK 2-digit GST code, name, short_code, is_ut boolean, manak_name) seeded with all 28 states + 8 UTs + 97 'Other Territory'.
2. clients new columns (nullable): pan, cin, llpin, udyam_no, msme_category ('Micro','Small','Medium','Large'), udyam_date, constitution, sector ('Private','Public','Government','Cooperative','Other'), is_startup boolean, startup_dpiit_no, is_women_entrepreneur boolean, gst_registration_type ('Regular','Composition','Unregistered','SEZ','Overseas'), gst_state_code (FK india_states), billing_currency default 'INR', credit_days int, credit_limit numeric, tds_section text, client_status ('Prospect','Active','Inactive','Blacklisted') default 'Active', lead_source, referred_by, account_manager_id uuid FK user_profiles.
   CHECK constraints added NOT VALID for gstin/pan/udyam/pin/mobile formats (so legacy rows still load); trigger normalises (upper/trim) gstin, pan, udyam and derives gst_state_code + pan from gstin when empty.
3. CREATE EXTENSION IF NOT EXISTS pg_trgm; GIN trigram index on company_name; replace the exact unique index with a unique index on lower(btrim(company_name)) (first report clashes via a RAISE NOTICE query; only create it when there are none, otherwise leave the old one and notice); partial unique index on gstin where gstin is not null and gstin <> ''.
4. client_sites (id, client_id FK RESTRICT, site_type ('Registered Office','Factory','Billing','Warehouse','Branch','Correspondence'), site_name, address_line1/2, city, district, state_code FK india_states, pin, country default 'India', gstin, latitude, longitude, is_primary, is_active, timestamps). Backfill one 'Registered Office' (and one 'Factory' copy) from clients.address/city/state/pin.
5. client_contacts (id, client_id FK RESTRICT, role ('Top Management','Authorised Signatory','QC In-charge','Accounts','Technical','AIR','Other'), name, designation, mobile, landline, email, is_primary, is_signatory, notes, timestamps). Backfill from contact_person/mobile/email as primary.
6. bis_projects.factory_site_id uuid FK client_sites (nullable) and backfill to the client's Factory site.
7. find_similar_clients(p_name text, p_gstin text) returns top 5 by similarity / exact gstin.
8. RLS for the new tables following the P2 helpers (if P2 isn't applied yet, mirror the existing policy style and leave a TODO).

DO — frontend
- frontend/src/lib/indiaValidators.ts: validateGstin (regex + mod-36 checksum + state code), validatePan, validateUdyam, validateCin, validateLlpin, validateMobileIndia (^[6-9]\d{9}$ only when country code is +91), validatePin, validateIfsc, validateEmail, gstinStateCode, panFromGstin. Small unit-test-like self-check exported as a dev function (no new test framework required).
- features/masters/clients/clientsApi.ts: normaliseClient(), validateClient() (returns field errors), createClient(), updateClient(), searchClients(), checkDuplicates() (calls find_similar_clients). ClientsMasterPage, AddClientDialog, and every other insert/update of clients (grep -rn "from('clients')" frontend/src) must use it.
- ClientsForm: new sections "Statutory" (PAN, CIN/LLPIN, Udyam + category + date, constitution, sector, startup, women entrepreneur), "Sites" (repeatable list with type), "Contacts" (repeatable with role), "Billing" (GST registration type, state code auto from GSTIN, credit days/limit, TDS section, currency), "Lifecycle" (status, lead source, referred by, account manager). Duplicate warning panel before save. State select from india_states. Defaults come from company settings, not hardcoded Raipur/Chhattisgarh.
- Option lists: load from client_master_options (seed missing values, e.g. client types Importer, Foreign Manufacturer, AIR, Jeweller, Trader) through one hook; remove the divergent TS enums or derive them.
- CSV import: parse → preview table with per-row errors/warnings (invalid GSTIN, unknown option, possible duplicate) → import only valid rows; download error report CSV. Keep onConflict behaviour but on the normalised name.
- "Copy client" asks for the new name instead of appending " - Copy".
- BIS Form-I (bis/print/bisForm1Html.ts): office address from the Registered Office site, factory address from bis_projects.factory_site_id (fallback: client address), sector from clients.sector, top management/signatory from client_contacts; BisProjectsForm gets a "Factory site" select (with quick-add).

CONSTRAINTS
New migration only; don't edit applied migrations; don't run migrations/Railway; never print .env/.railway-secrets.env; keep all existing columns working (legacy contact/address columns stay in sync with the primary contact/site via trigger or app code); keep Hindi labels; don't break quotations, sale documents, BIS projects, samples, consent letters, OSL, email tools.

ACCEPTANCE
- Invalid GSTIN (bad checksum or state mismatch) is blocked in form, quick-add and import.
- Duplicate names that differ only by case/spaces can't be created; similar names show a warning.
- A client can have several factory sites; Form-I prints the selected factory site.
- typecheck/lint/build pass.

Finally: summarise changes, run `npm run typecheck && npm run lint && npm run build`, and set MST-05 (clients part), MST-10..MST-18, MST-20, MST-77 to IN-PROGRESS.
```

### P5 — BIS reference masters: schemes, offices, officers, licence statuses, document types (MST-61, 70, 71, 73, 75, 76)

```text
Repo: Consultancy Management. Read .cursorrules, README.md, docs/audits/02_masters_gap_audit.md (MST-61, MST-70, MST-71, MST-73, MST-75, MST-76, section C) and the schema snapshot.

GOAL
Replace free-text BIS concepts with small reference masters while keeping old text values.

EVIDENCE
- bis_projects.branch_name/branch_state and officer names are free text (20261004160000_bis_application_details_fields.sql 3-16); options in lab_master_options via bis/projects/bisMasterOptions.ts 4-35.
- No scheme column; licence number logic assumes CM/L 10 digits (manakExtensionBridge.ts ~122).
- App statuses/kinds (bis/projects/types.ts 22-41, e.g. 'stop_marking', 'Application'/'Licence'/'Inclusion') differ from DB enums in 20261003190000:3-21 — check the snapshot for the real column types before writing FKs.
- bis_project_files.doc_kind is free text default 'legal' (20261004120000:6).

DO — migration (e.g. 20261008130000_bis_reference_masters.sql)
1. certification_schemes (id, code unique, name, authority default 'BIS', licence_no_prefix, licence_no_regex, initial_validity_months, renewal_validity_months, description, sort, is_active). Seed: SCHEME_I (Product Certification – ISI mark, CM/L-, ^CM/L-\d{10}$, 24/60), FMCS (Foreign Manufacturers – Scheme-I, CM/L-), SCHEME_II (CRS registration, R-, ^R-\d{8}$, 24/60), SCHEME_IV, SCHEME_X, HALLMARKING, ECOMARK (authority 'CPCB'), ISO_MSCS (management system certification). Mark validity values with a comment "verify against BIS".
2. bis_offices (id, code unique, name, office_type ('HQ','RO','BO','Lab'), region ('CRO','ERO','NRO','SRO','WRO','HQ'), address, city, state_code FK india_states (if P4 applied, else text), pin, phone, email, head_name, states_covered text[], is_active). Seed the regional offices and the branch offices relevant to Amit's clients (at least Raipur-area coverage, Kolkata ERO, Bhubaneswar, Delhi, Mumbai); add a comment with the bis.gov.in source URLs from section C5 so Amit can complete the list. Backfill distinct bis_projects.branch_name values that don't match into bis_offices with code NULL and name = text.
3. bis_officers (id, name, grade ('Scientist-B'..'Scientist-G','DDG','Other'), role, bis_office_id FK, email, phone, is_active). Backfill from the distinct officer names in lab_master_options / bis_projects officer columns.
4. licence_statuses (code PK: 'operative','deferred','stop_marking','suspended','expired','cancelled','surrendered', label, manak_label ('Operative','Deferred','Under Stop Marking',...), is_active_licence boolean, sort).
5. document_types (id, code unique, name, scheme_id FK, stage ('application','grant','renewal','surveillance','inclusion','other'), is_mandatory, sort, is_active). Seed Scheme-I basics: Form-I application, CMPF/undertakings, plant layout, process flow chart, list of machinery, list of test equipment, calibration certificates, test report from lab, ownership/rent proof, trade licence, authorised signatory letter, brand authorisation, AIR nomination (FMCS), legal docs.
6. bis_projects: add certification_scheme_id (default SCHEME_I backfill), bis_office_id, licence_status_code FK licence_statuses, application_officer_id / inspection_officer_id / ... (one FK per existing officer text column) — keep the existing text columns as snapshots. bis_project_files: add document_type_id FK (backfill where doc_kind matches a code).
7. RLS like P2 (read all authenticated, write edit-level, delete admin).

DO — frontend
- New route /masters/bis-reference with tabs (Schemes, BIS Offices, Officers, Licence Statuses, Document Types) using the MasterPage pattern; add to lib/appNav.ts under Masters (module key "masters_bis_reference", register it in lib/moduleAccess.ts).
- BisProjectsForm / application details: replace free-text branch and officer inputs with searchable selects (quick-add allowed) that also write the text snapshot; scheme select (drives licence number validation using licence_no_regex); licence status select separate from workflow status.
- Reconcile the TS status/kind lists with the real DB types from the snapshot; if the DB column is an enum missing 'stop_marking', move licence status to the new FK instead of changing the enum.
- Manak extension bridge: use the scheme's regex instead of the hardcoded CM/L 10-digit rule.

CONSTRAINTS
New migration only; don't edit applied migrations; don't run migrations/Railway; never print .env/.railway-secrets.env; keep existing text values readable; keep Hindi labels; don't break BIS print templates, surveillance, sample failure, dashboard.

ACCEPTANCE
- Existing projects still show their branch/officer names; new ones store FKs + snapshot.
- A CRS project accepts R-12345678 and rejects CM/L formats.
- typecheck/lint/build pass.

Finally: summarise changes, run `npm run typecheck && npm run lint && npm run build`, set MST-61/70/71/73/75/76 to IN-PROGRESS.
```

### P6 — IS Code Master v2: structured number, BIS metadata, QCOs, amendments, products (MST-05, 30–33, 35, 37)

```text
Repo: Consultancy Management. Read .cursorrules, README.md, docs/audits/02_masters_gap_audit.md (MST-05, MST-30..MST-33, MST-35, MST-37, section C1/C2) and the schema snapshot (confirm is_codes.revision_year type and existing unique indexes).

GOAL
IS Code Master that matches BIS "Know your standards" data and can't create duplicates.

EVIDENCE
- frontend/src/features/masters/is-codes/types.ts 18-41; IsCodesMasterPage.tsx save 1006-1095 (prefix bug 1015-1020: "IS/IEC 62368" becomes "IS /IEC 62368"; revision int comment 1026), import 1198-1278 (no normalisation :1221); AddIsCodeDialog.tsx 100-113; formatIsCodeLabel.ts.
- Extension scraper discards Voluntary/Mandatory, Department, Technical Committee: extensions/qe-consultancy-chrome/is-code-fetch.js 866-917.

DO — migration (e.g. 20261008140000_is_codes_v2.sql)
1. is_codes new columns: is_prefix ('IS','IS/IEC','IS/ISO','IS/ISO/IEC'), base_number text, part_no text, section_no text, is_key text (canonical uppercase "IS/IEC 62368 (PART 1)" without year), ics_code, technical_department, technical_committee, superseding_is, superseded_by_is_id FK is_codes, standard_status ('Current','Withdrawn','Superseded','Under revision') default 'Current', degree_of_equivalence, group_name, sub_group, certification_category ('Compulsory','Voluntary','Not certifiable'), certification_scheme_id FK certification_schemes (if P5 applied), bis_detail_url, last_synced_at.
2. Backfill prefix/base/part/section/is_key from is_number with a SQL parser function parse_is_number(text) (handles "IS 1786", "IS/IEC 62368 (Part 1)", "IS 302 (Part 2/Sec 3)", "IS 14286 : 2010", stray spaces like "IS /IEC"). Fix existing "IS /IEC" style values in is_number.
3. Unique index on (is_key, revision_year) — create only if there are no clashes; otherwise RAISE NOTICE with the duplicates and skip (Amit will merge). Keep or recreate the old (is_number, revision_year) index guarded by IF NOT EXISTS.
4. is_code_amendments (id, is_code_id FK RESTRICT, amendment_no int, issued_on date, effective_on date, summary, file_path, created_at); backfill nothing (old text field stays as count).
5. is_code_qcos (id, is_code_id FK RESTRICT, qco_title, ministry, so_number, so_date, enforcement_date, scheme_id FK, status ('Notified','In force','Deferred','Withdrawn'), source_url, notes).
6. is_code_products (id, is_code_id FK RESTRICT, product_name, varieties text[], grades text[], hsn_code, unit, product_manual_no, sti_file_path, grouping_guideline, is_active). Backfill one row per IS from title + product_manual_number.
7. If revision_year/reaffirmation_year are text in the live DB, add smallint shadow columns + sync trigger instead of altering type (don't break callers).
8. RLS for the new tables following P2.

DO — frontend
- frontend/src/lib/isNumber.ts: parseIsNumber(), normalizeIsNumber(), formatIsLabel(isCode, {withYear, style}) — one formatter used everywhere (replace formatIsCodeLabel usages; keep its export as a wrapper).
- features/masters/is-codes/isCodesApi.ts: normalise, validate, create, update, search, checkDuplicate(is_key, year). IsCodesMasterPage, AddIsCodeDialog, CSV import and any other insert/update of is_codes (grep -rn "from('is_codes')" frontend/src) use it.
- IsCodesForm: structured inputs (prefix select, number, part, section, year) with a live preview label; new metadata section; tabs for Amendments, QCOs, Products/Varieties; certification category + scheme.
- Import: preview + per-row errors (bad format, duplicate is_key/year) like the client import.
- Extension is-code-fetch.js: map Technical Department, Technical Committee, ICS, Certification (Voluntary/Mandatory/Not certifiable), Superseding, Degree of Equivalence, Group fields into the new columns; set last_synced_at; show a diff before overwriting values Amit edited.
- Form-I (bis/print/bisForm1Html.ts): product name from the selected is_code_products row, Part/Section from the structured fields.

CONSTRAINTS
New migration only; don't edit applied migrations; don't run migrations/Railway; never print .env/.railway-secrets.env; keep existing is_number values working for all 16 callers; keep the old fee columns untouched (fees move in P7); keep Hindi labels.

ACCEPTANCE
- "IS/IEC 62368 (Part 1): 2018" saves as prefix IS/IEC, base 62368, part 1, year 2018, label unchanged; no "IS /IEC".
- Duplicate IS+year is blocked in form, quick-add and import.
- Extension fetch fills TC/department/certification.
- typecheck/lint/build pass.

Finally: summarise changes, run `npm run typecheck && npm run lint && npm run build`, set MST-05 (IS part), MST-30..33, 35, 37 to IN-PROGRESS.
```

### P7 — BIS fee master + estimator (MST-34, MST-74)

```text
Repo: Consultancy Management. Read .cursorrules, README.md, docs/audits/02_masters_gap_audit.md (MST-34, MST-74, section C3/C4) and the schema snapshot. Depends on P4 (client msme_category/startup/women flags) and P6.

GOAL
Effective-dated BIS statutory fees with concessions, and a fee estimate that quotations can use.

EVIDENCE
- Fee columns hard-coded on is_codes: 20261004200000_is_codes_qe_fee_fields.sql 4-16 (mmf_large/medium/small/micro, slab_1..3 qty/rate, unit_of_is).
- BIS fee page has many amendments (latest 02.01.2026, 10.06.2026); small = 0.5× large, micro = 0.2× large; concessions micro/startup 80%, small 50%, +10% women until 31-05-2029 (verify against PDF).

DO — migration (e.g. 20261008150000_bis_fee_master.sql)
1. bis_fee_components (id, scheme_id FK certification_schemes, component_code ('APPLICATION','INSPECTION_MANDAY','ANNUAL_LICENCE','MARKING','CRS_REGISTRATION','CRS_EXTRA_REPORT','CRS_RENEWAL','FMCS_CONTINGENCY','HALLMARK_REGISTRATION','OTHER'), label, amount numeric, unit ('per application','per man-day','per year','per report','per article','lump sum'), gst_applicable boolean default false, effective_from date, effective_to date, notification_ref, source_url, notes). Seed the values from section C3/C4 with effective_from '2021-08-05' (CRS/FMCS: put source URL and a "verify" note).
2. is_code_marking_fees (id, is_code_id FK RESTRICT, effective_from, effective_to, unit, mmf_large numeric, mmf_medium numeric, mmf_small numeric GENERATED ALWAYS AS (round(mmf_large*0.5,2)) STORED, mmf_micro GENERATED ... (round(mmf_large*0.2,2)), slab_1_qty, slab_1_rate, slab_2_qty, slab_2_rate, slab_3_qty, slab_3_rate, notification_ref, source_url). Exclusion/overlap guard: unique (is_code_id, effective_from) + trigger preventing overlapping ranges. Backfill one row per is_code from the existing columns (effective_from = coalesce(updated_at::date, '2021-08-05')). Keep a NOTICE when the stored small/micro differ from the derived values.
3. fee_concessions (id, code, label, applies_to ('marking_fee','all'), condition ('micro','small','startup','women'), percent numeric, stackable boolean, effective_from, effective_to, source_url). Seed micro 80, startup 80, small 50, women +10 (stackable) until 2029-05-31.
4. View is_codes_current_fees (is_code_id + the fee row valid today).
5. Function estimate_bis_fees(p_client uuid, p_is_code uuid, p_scheme_code text default 'SCHEME_I', p_on date default current_date, p_mandays numeric default 2, p_annual_qty numeric default null) returns table(component, basis, gross, concession_pct, net) using the client's msme_category/is_startup/is_women_entrepreneur. Marking fee = max(MMF for the client's scale, slab calculation for p_annual_qty) when qty given.
6. Keep the old is_codes fee columns; add a trigger or comment marking them deprecated. Don't drop them.
7. RLS like P2.

DO — frontend
- Route /masters/bis-fees (tabs: Fee components, Marking fees per IS with history, Concessions). Add to appNav Masters + moduleAccess. Import marking fees from a CSV export of the BIS PDF (columns: IS No, Product, Unit, MMF Large, MMF Medium, slabs) with preview, matching IS by is_key.
- IS Code details dialog: "Fees" tab showing the current row and history; the old fee inputs in IsCodesForm become read-only, pointing to the new tab.
- Quotation form (features/finance/sale/quotation): button "Add BIS statutory fees" → pick IS + scheme (+ man-days, qty) → calls estimate_bis_fees → adds lines marked reimbursable / pure agent (GST 0 by default, editable), showing concession applied.
- Any code reading is_codes.mmf_* (grep) switches to is_codes_current_fees with fallback to the old columns.

CONSTRAINTS
New migration only; don't edit applied migrations; don't run migrations/Railway; never print .env/.railway-secrets.env; keep data; keep Hindi labels; don't change totals of existing quotations.

ACCEPTANCE
- Changing a fee with a new effective_from keeps the old quote values intact and history visible.
- A micro, women-led client gets the stacked concession on the marking fee only.
- typecheck/lint/build pass.

Finally: summarise changes, run `npm run typecheck && npm run lint && npm run build`, set MST-34/MST-74 to IN-PROGRESS, and list the seeded amounts Amit must verify against the BIS PDFs.
```

### P8 — Laboratory master (MST-16, 38, 72)

```text
Repo: Consultancy Management. Read .cursorrules, README.md, docs/audits/02_masters_gap_audit.md (MST-16, MST-38, MST-72, section C6) and the schema snapshot. Depends on P6.

GOAL
Labs (BIS labs, BIS-recognised OSLs, NABL/empanelled labs) become their own master with IS scope and rates, instead of being clients with company_type 'Testing Laboratory'.

EVIDENCE
- Labs looked up as clients by fuzzy company_type: frontend/src/features/bis/projects/bisProjectsApi.ts 246-276.
- is_codes.testing_charges single number (is-codes/types.ts:26).

DO — migration (e.g. 20261008160000_laboratories.sql)
1. laboratories (id, name, lab_type ('BIS Lab','BIS Recognised OSL','NABL','Empanelled','In-house','Other'), osl_code, bis_recognition_no, recognised_from, recognised_upto, nabl_cert_no, nabl_valid_upto, address, city, state_code, pin, contact_person, mobile, email, website, legacy_client_id uuid FK clients (nullable), is_active, timestamps). Unique on lower(name)+city.
2. laboratory_is_scope (laboratory_id FK RESTRICT, is_code_id FK RESTRICT, valid_upto, remarks, PK both).
3. laboratory_is_rates (id, laboratory_id, is_code_id, rate numeric, gst_pct, tat_days, effective_from, effective_to, notes) with overlap guard.
4. Backfill laboratories from clients where company_type ilike '%lab%' (keep legacy_client_id; do not delete or change the client rows).
5. Wherever OSL / sample-sending tables store a lab client id or lab name (find them in the snapshot/code: grep -rn "Testing Laboratory\|lab_client\|osl" frontend/src/features/bis), add laboratory_id FK + backfill via legacy_client_id.
6. View laboratories_expiring (recognition or NABL validity within 60 days).
7. RLS like P2.

DO — frontend
- Route /masters/laboratories (list, form, tabs Scope and Rates, CSV import), add to appNav Masters + moduleAccess.
- bisProjectsApi lab lookup and OSL screens use laboratories (fallback to the old client lookup only for rows without laboratory_id).
- IS details dialog: "Labs" tab listing labs with scope + current rate; testing_charges labelled "Indicative".
- Dashboard card: labs expiring soon.

CONSTRAINTS
New migration only; don't edit applied migrations; don't run migrations/Railway; never print .env/.railway-secrets.env; don't delete the lab client rows (finance may reference them); keep Hindi labels.

ACCEPTANCE
- Existing OSL/sample records still show their lab.
- A lab with expired recognition is flagged when picked.
- typecheck/lint/build pass.

Finally: summarise changes, run `npm run typecheck && npm run lint && npm run build`, set MST-16/38/72 to IN-PROGRESS.
```

### P9 — Test Parameter Master v2 (MST-40, 41, 42)

```text
Repo: Consultancy Management. Read .cursorrules, README.md, docs/audits/02_masters_gap_audit.md (MST-40..MST-42) and the schema snapshot. Depends on P6.

GOAL
No duplicate test parameters; structured requirements usable by FTR and Scheme of Inspection prints.

EVIDENCE
- No unique constraint (baseline 567-584); import dedupe on label + item name only: features/masters/test-parameter/TestParameterMasterPage.tsx 1112-1133; is_code_label backfill 20261003220000:48-72.
- Consumers: bis/projects/factoryTestReportModel.ts, FactoryTestReportModuleFields, FtrIsTestParameterDialog, bis/print/updatedSchemeOfInspectionHtml.ts, OSL sample requirements.

DO — migration (e.g. 20261008170000_test_parameters_v2.sql)
1. Report duplicates (same is_code_id, clause_no, lower(trim(item_name))) with RAISE NOTICE; merge them: keep the oldest id, re-point any FK references (find via pg_constraint), merge non-empty fields, then delete extras — wrap in a DO block that only runs when references can be re-pointed safely; log merged ids into audit_log (P3) or a merge table.
2. Unique index on (is_code_id, coalesce(clause_no,''), lower(btrim(item_name))) where is_code_id is not null.
3. New nullable columns: test_type ('Acceptance','Routine','Type','Other'), comparator ('min','max','range','equal','text'), limit_min numeric, limit_max numeric, nominal numeric, unit_id FK test_parameter_units, sti_frequency text, sample_size text, criticality ('Critical','Major','Minor'), sort_order int.
4. View test_parameters_v (adds the live IS label from is_codes via the P6 formatter logic in SQL) — keep is_code_label column, synced by trigger from is_codes.
5. Junction test_parameter_accreditations (test_parameter_id, accreditation_body_id) backfilled from under_accreditation_ids uuid[] (keep the array column).

DO — frontend
- Form: structured limit inputs (shown when comparator chosen), unit select, test type, frequency, sample size; LIMS-only fields (department, designation, uncertainty, accreditation) inside a collapsed "LIMS fields" section.
- Import keys on is_code_id (resolve IS via isCodesApi), clause_no and item_name; dedupe within the file; preview with errors.
- FTR and Scheme-of-Inspection builders use structured limits when present, else the text requirement.

CONSTRAINTS
New migration only; don't edit applied migrations; don't run migrations/Railway; never print .env/.railway-secrets.env; keep text requirement; keep Hindi labels; FTR/SOI prints must look the same for old data.

ACCEPTANCE
- Re-importing the same CSV creates no duplicates.
- typecheck/lint/build pass.

Finally: summarise changes, run `npm run typecheck && npm run lint && npm run build`, set MST-40..42 to IN-PROGRESS.
```

### P10 — Product & Services → consultancy service catalogue (MST-50..54)

```text
Repo: Consultancy Management. Read .cursorrules, README.md, docs/audits/02_masters_gap_audit.md (MST-50..MST-54) and the schema snapshot. Depends on P5 (schemes) and P7 (fees).

GOAL
A service catalogue for BIS consultancy that quotations and invoices can use.

EVIDENCE
- ITEM_CATEGORIES Calibration/Testing: features/masters/products-services/types.ts:7; seed 20261003210000 (product_item_categories).
- Only hsn_code; inventory fields for everything (types.ts 16-28); make/category text with app-side rename cascade (makeApi.ts:81, itemCategoryApi.ts 82-96).
- Dead modules: features/masters/product-services (NABL scope), features/masters/equipment-master (no routes).

DO — migration (e.g. 20261008180000_service_catalogue.sql)
1. sac_hsn_codes (code PK, code_type ('SAC','HSN'), description, default_gst_pct). Seed SAC 998311, 998312, 998313, 998399, 998346 (technical testing & analysis), 999799 and a few HSN used today (from distinct products_services_master.hsn_code).
2. products_services_master new columns: service_kind ('Consultancy','Testing','Government Fee','Reimbursement','Product','Other'), code_type ('SAC','HSN'), sac_hsn_code FK sac_hsn_codes (nullable, backfill from hsn_code), certification_scheme_id FK, is_code_id FK (optional), price_micro, price_small, price_medium, price_large numeric, is_reimbursable boolean default false, is_pure_agent boolean default false, category_id FK product_item_categories, make_id FK product_makes (backfill both from the text columns; keep text).
3. Seed categories (BIS Product Certification, CRS, FMCS, Hallmarking, ISO/Management Systems, Testing Coordination, Documentation, Government Fees, Retainer) and services: Scheme-I new licence (normal / simplified), licence renewal, inclusion of variety/brand, surveillance support, sample failure reply, change of address/ownership, CRS registration / renewal / inclusion, FMCS + AIR services, hallmarking registration, testing coordination, documentation, annual retainer; government fee items (BIS application fee, inspection man-day, annual licence fee, marking fee, CRS fees) with is_pure_agent = true and GST 0 — all with price 0 for Amit to fill. Insert only if a row with the same lower(name) doesn't exist.
4. gst_rates: add effective_from/effective_to (backfill 2017-07-01).

DO — frontend
- Product & Services form: service_kind first; inventory fields shown only for 'Product'; SAC/HSN picker with validation; scale-based prices; reimbursable / pure-agent toggles; scheme/IS links.
- Quotation/sale line picker: price chosen by the client's msme_category (fallback rate); pure-agent lines shown separately in totals (no GST unless overridden).
- Mark features/masters/product-services and features/masters/equipment-master as deprecated (README note + no imports) — delete only if grep shows no imports, and list what you removed.

CONSTRAINTS
New migration only; don't edit applied migrations; don't run migrations/Railway; never print .env/.railway-secrets.env; existing quotation lines and totals unchanged; keep Hindi labels.

ACCEPTANCE
- Picking "Scheme-I new licence" for a small-scale client fills price_small.
- Existing items still load and save.
- typecheck/lint/build pass.

Finally: summarise changes, run `npm run typecheck && npm run lint && npm run build`, set MST-50..54 to IN-PROGRESS.
```

### P11 — Company profile + finance readiness (MST-60, MST-17 GST mode)

```text
Repo: Consultancy Management. Read .cursorrules, README.md, docs/audits/02_masters_gap_audit.md (MST-60, MST-17, "Finance needs" section) and the schema snapshot. Depends on P4.

GOAL
One company profile with statutory data, financial-year document numbering, and GST place-of-supply logic, so the Finance module can be built next.

EVIDENCE
- lab_settings is multi-row; newest wins (20261004010000_sync_company_settings_to_lab_settings.sql 22-26); company_settings singleton (20261003190000:79-87).
- Quotation GST intra/inter comes from template toggles: features/finance/sale/quotation/QuotationForm.tsx 413-414, quotation/types.ts 305-337.

DO — migration (e.g. 20261008190000_company_profile_finance_ready.sql)
1. Pick the canonical lab_settings row (the one the app reads today), keep the others with is_active=false (don't delete), add a partial unique index allowing only one active row. View company_profile exposing the active row merged with company_settings.
2. lab_settings new columns: pan, tan, cin, udyam_no, gst_state_code FK india_states, gst_registration_type, lut_no, lut_valid_upto, e_invoice_applicable boolean, financial_year_start_month int default 4, bank fields if missing (account name, number, IFSC, branch, UPI id).
3. document_series (id, doc_type ('QUOTATION','PROFORMA','TAX_INVOICE','CREDIT_NOTE','PAYMENT_RECEIPT','DEBIT_NOTE','DELIVERY_CHALLAN'), financial_year text e.g. '2026-27', prefix, suffix, next_number int, padding int default 4, reset_yearly boolean default true, unique(doc_type, financial_year)). Function next_document_number(p_doc_type text, p_date date default current_date) returns text, row-locked (SELECT … FOR UPDATE), creates the FY row on first use. Seed from the current max numbers in the existing finance tables (inspect the snapshot; if numbering format is unknown, seed next_number = 1 and leave a NOTICE).
4. RLS: SELECT authenticated, write admin.

DO — frontend
- frontend/src/lib/gstPlaceOfSupply.ts: placeOfSupply(company, client/site) → { mode: 'intra'|'inter'|'export', stateCode } using company gst_state_code vs client billing site / gstin state code; SEZ or overseas → inter/export.
- Quotation and sale document forms: default the GST mode from placeOfSupply (template toggle becomes an override with a warning when it disagrees).
- Company Settings page: statutory + LUT/e-invoice fields with indiaValidators; single-profile UI (no multiple rows).
- A Document Series settings tab (view/edit prefix, next number per FY).

CONSTRAINTS
New migration only; don't edit applied migrations; don't run migrations/Railway; never print .env/.railway-secrets.env; existing document numbers and totals must not change; keep Hindi labels.

ACCEPTANCE
- Chhattisgarh company + Odisha client → IGST; same state → CGST+SGST.
- next_document_number gives sequential numbers per FY with no gaps under concurrent calls (explain the lock).
- typecheck/lint/build pass.

Finally: summarise changes, run `npm run typecheck && npm run lint && npm run build`, set MST-60 and MST-17 to IN-PROGRESS.
```

### P12 — Server-side lists, indexes, cleanup (MST-08, 54, 21)

```text
Repo: Consultancy Management. Read .cursorrules, README.md, docs/audits/02_masters_gap_audit.md (MST-08, MST-54, MST-21) and the schema snapshot.

GOAL
Master lists stay fast and complete as data grows; dead code removed.

EVIDENCE
- Whole-table loads + client-side search: ClientsMasterPage.tsx 238-241, IsCodesMasterPage.tsx 269 (and similar in Test Parameter / Product & Services).
- Unused master_clients table (baseline 325-338); clients.name legacy column (20261005120000).

DO
1. Migration (e.g. 20261008200000_master_search_indexes.sql): pg_trgm GIN indexes on clients(company_name, gstin, city), is_codes(is_number, title), test_parameters(item_name), products_services_master(name); btree on foreign keys used for filters.
2. frontend/src/hooks/useServerList.ts: generic hook (table/view, select, search columns with ilike, filters, sort, page, pageSize) using `.range()` and `count: 'exact'`, debounced search, returns rows/total/loading/error.
3. Switch the four master pages to it; keep existing columns, filters, export (export runs a paged fetch of all matching rows, not just the current page).
4. Confirm via grep that master_clients is unused; add a comment in a NEW migration (COMMENT ON TABLE ... 'deprecated') — do not drop it. Same note for clients.name (still required by the sync trigger).
5. Remove or mark deprecated features/masters/product-services and features/masters/equipment-master if not done in P10.

CONSTRAINTS
New migration only; don't edit applied migrations; don't run migrations/Railway; never print .env/.railway-secrets.env; same UI look; keep Hindi labels.

ACCEPTANCE
- Lists show correct totals beyond 1,000 rows; search hits the server.
- typecheck/lint/build pass.

Finally: summarise changes, run `npm run typecheck && npm run lint && npm run build`, set MST-08/54/21 to IN-PROGRESS.
```

---

## (E) Reusable "regular work" master prompt

Paste this into Cursor whenever you want the next master fix done. It reads this audit file, picks the next open item and follows the house rules.

```text
You are continuing the Masters improvement track in the Consultancy Management repo.

1. READ FIRST: .cursorrules, README.md, docs/audits/02_masters_gap_audit.md (whole file), backend/supabase/schema/README.md and backend/supabase/schema/live_schema.* if they exist. Run `git status` and stop and tell me if there are uncommitted changes that are not yours.
2. PICK: take the lowest-numbered prompt in the "Ordered fix plan" table (P1, P2, …) whose MST rows are not all DONE/WONTFIX. If I named a specific MST id or P number in this chat, do that one instead. Restate in 5-10 lines what you will change (tables, migration name, files) and the acceptance criteria, then start (don't wait for me unless something is ambiguous or destructive).
3. IMPLEMENT using the prompt text for that P in the audit file, plus these house rules:
   - Schema changes only in a NEW idempotent migration backend/supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql with a timestamp later than the newest existing file. Never edit an applied migration.
   - Never run scripts/apply-migrations.mjs, railway CLI or anything touching the live DB. I apply migrations myself.
   - Never open, print or copy .env, .railway-secrets.env or other secrets.
   - Keep existing data (backfill, don't drop), keep Hindi labels, reuse limsThemeUi/MasterPage patterns, and grep every usage of a table before changing it so other modules (BIS projects, quotations, sale documents, OSL, FTR, dashboard, extension) don't break.
   - Shared data access goes through the master's *Api.ts file (clientsApi.ts, isCodesApi.ts, …), never new direct inserts.
4. VERIFY: run `npm run typecheck && npm run lint && npm run build`; fix errors you introduced. Add a commented "manual test" block at the end of the migration (SQL I can run after applying) and list UI steps to test.
5. UPDATE THE AUDIT FILE: set the MST rows you worked on to `IN-PROGRESS` (I mark them `DONE (commit <sha>)` after applying and testing). If you find new gaps, add rows with the next free MST id in the right table with severity and evidence (file:line).
6. REPORT: summary of changes (files, migration name, new tables/columns/functions), checks result, what I must do on Railway (apply migration, settings), risks, and the next P in order.
Don't commit or push unless I say "commit".
```

---

## Finance module: what it needs from the masters

The Finance Management module (Quotation → Proforma → Tax Invoice → Credit Note → Payment Receipt, already in `lib/appNav.ts`) should start only after P4, P7, P10 and P11. It needs:

| Finance need | Master source | Gap / prompt |
|---|---|---|
| Bill-to / ship-to per location, GSTIN per site | `client_sites` | MST-11 · P4 |
| Place of supply → CGST+SGST vs IGST | client/site GST state code vs company state code, `india_states` | MST-17, 60, 77 · P4/P11 |
| PAN, GST registration type (Regular / Composition / Unregistered / SEZ / Overseas) | clients | MST-10, 17 · P4 |
| Credit days / limit, opening balance Dr/Cr, TDS section (194J professional fees), accounts contact for invoices and reminders | clients, `client_contacts` (role Accounts) | MST-12, 17 · P4 |
| Company GSTIN, PAN, TAN, CIN, LUT, e-invoice flag, bank + UPI | company profile (single row) | MST-60 · P11 |
| FY document numbering per document type, gap-free | `document_series` + `next_document_number()` | MST-60 · P11 |
| Service catalogue with SAC codes, GST rate, scale-based prices | products_services_master + `sac_hsn_codes` | MST-50, 51 · P10 |
| BIS government fees billed at actuals (pure agent, no GST) with MSME/startup/women concessions | `bis_fee_components`, `is_code_marking_fees`, `fee_concessions`, `estimate_bis_fees()` | MST-34, 74 · P7 |
| Link invoices to licence / project → client → factory site → scheme → IS | bis_projects FKs | MST-11, 73 · P4/P5 |
| Lab testing cost to pass through or compare | `laboratory_is_rates` | MST-72 · P8 |
| Who changed what (amounts, client GSTIN), and no deletion of billed clients | `audit_log`, archive, RESTRICT FKs | MST-04 · P3 |
| DB-enforced permissions on finance tables | RLS helpers | MST-02, 03 · P2 |

GimBooks comparison (invoice layouts, payment reminders, ledger, GST reports) is deferred to the finance phase as planned. Use the same house rules there.

---

## Appendix: environment facts and things to verify on Railway

- Checks: `npm run typecheck`, `npm run lint`, `npm run build` (root delegates to frontend). No automated test suite.
- Migrations are applied by Amit with `scripts/apply-migrations.mjs` (history in `public.app_schema_migrations`). Some files are permanently skipped (lines 11-36).
- **Verify on Railway (read-only) before P2–P4:**
  1. GoTrue signup is disabled (`GOTRUE_DISABLE_SIGNUP=true`). If open, anyone could sign up and (per MST-03) choose their designation.
  2. Live `user_profiles` and `module_access_rules` policies (`select * from pg_policies where tablename in ('user_profiles','module_access_rules')`).
  3. Unique indexes exist: `clients` company_name, `is_codes (is_number, revision_year)`.
  4. Types of `is_codes.revision_year`, `bis_projects.project_kind`, `bis_projects.status`.
  5. FKs into `clients` / `is_codes` with CASCADE or SET NULL (P1 `checks.sql`).
  6. Orphans left by `20261005110000_clients_company_name_unique.sql` (it deleted duplicate clients without re-pointing child rows).
- links.bis.gov.in was unreachable from both the fetch tool and the box (TLS EOF / timeout) on 8 Oct 2026. Re-check from the office network if specific pages are needed.
