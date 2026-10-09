RETIRED 2026-10-09 (decision #17). Do not execute this file. One chat plans and codes. Product scope is still `S7_plan.md`.

S7 — Client Master v2
======================

Repo: /Users/amitkumar/Documents/Softwares/Consultancy Management   (branch main, HEAD must be 6da1adb)
Approved by Amit on 2026-10-09 05:39 IST. Plan: docs/agents/plans/S7_plan.md

DO NOT run npm run db:migrate. DO NOT git commit. DO NOT git push.
Write the migration file only. Live DB stays as it is until Amit says "commit".

git add list (start check 3 only — do not stage, do not commit, do not edit these four)
- .cursorrules
- .cursor/rules/05-qe-standards.mdc
- .cursor/rules/qe-coder.mdc
- .cursor/rules/qe-planner.mdc
These four files are already dirty from decision #12. Leave them exactly as they are. Product scope is unchanged.
When finished, STATUS stage CODED, owner QE Planner.
End with: NEXT: open "QE Planner" chat and paste: @qe-planner S7 coding done, no commit — read docs/agents/reports/coding/S7_coding.md

NOT in this prompt
- Do not change company_scale from Udyam or MSME (MST-84, decision #10).
- Do not add a client TDS rate. TDS stays on the receipt (decision #24).
- Do not add e-Invoice fields (decision #26).
- Do not build a laboratory master, IS Code v2, fee master, or a merge-clients tool.
- Do not remove LegalDocumentsModuleDialog or bis_project_files. That removal is a later plan.
- Do not drop clients.name or portal_password.

WHY
- Form-I prints the same address for office and factory, and sector is the word Private (bisForm1Html.ts:421-436).
- Client form has one address and one contact (clients/types.ts). GSTIN check is regex only.
- Unique index is exact company_name, so case and spaces are not duplicates.
- Decision #22: Buyer, Vendor, and Both stay on the client, not a second master.
- Amit, 2026-10-09: GST, MSME, and other legal certificates are common for every licence of a client. Upload them on the client. Beside the GST number field, button "Upload GST Certificate". Beside Scale, button "Upload MSME Certificate". Under those fields, a table: certificate name + its files. More named certificates can be added in that table. Do not copy the file onto each BIS project.
- S6b testing, same day: the Clients directory shows payment term `100 % Advance` and an empty remark for every row, because `search_clients` does not return those columns and the mapper fills the form default (`ClientsMasterPage.tsx` list mapper, `ClientsTable.tsx` around the payment term cell). CSV of that page would export the fake default. Fix it in this session. Also raise Archive, Import, Export, and Delete to at least 40px (`ClientsFooterBar.tsx`). In both extension copies, strip `passwd` and `password` from any URL before opening it, and clear `fillSentAt` inside `clearRememberedPortal`.

PART A — new file backend/database/migrations/20261009060000_s7_client_master_v2.sql
Header comment. Then:
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

1. india_states (gst_code text primary key, name text not null, is_ut boolean not null default false).
   Seed the GST codes that appear on GSTINs: 01 Jammu and Kashmir, 02 Himachal Pradesh, 03 Punjab, 04 Chandigarh, 05 Uttarakhand, 06 Haryana, 07 Delhi, 08 Rajasthan, 09 Uttar Pradesh, 10 Bihar, 11 Sikkim, 12 Arunachal Pradesh, 13 Nagaland, 14 Manipur, 15 Mizoram, 16 Tripura, 17 Meghalaya, 18 Assam, 19 West Bengal, 20 Jharkhand, 21 Odisha, 22 Chhattisgarh, 23 Madhya Pradesh, 24 Gujarat, 26 Dadra and Nagar Haveli and Daman and Diu, 27 Maharashtra, 28 Andhra Pradesh, 29 Karnataka, 30 Goa, 31 Lakshadweep, 32 Kerala, 33 Tamil Nadu, 34 Puducherry, 35 Andaman and Nicobar Islands, 36 Telangana, 37 Andhra Pradesh, 38 Ladakh, 97 Other Territory.
   28 and 37 are both Andhra Pradesh (old and current GSTIN prefixes). Insert ON CONFLICT DO NOTHING.

2. clients add nullable columns: pan, cin, llpin, udyam_no, msme_category, udyam_date, constitution, sector, is_startup, startup_dpiit_no, is_women_entrepreneur, gst_registration_type, gst_state_code (text, no hard FK so old rows load), client_status text not null default 'Active', lead_source, referred_by, account_manager_id uuid.
   Checks NOT VALID: pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$' when not null; gst_number when not null matches the 15-char shape; client_status in Prospect, Active, Inactive, Blacklisted; sector in Private, Public, Government, Cooperative, Other when not null.
   Do not UPDATE company_scale.

3. client_sites and client_contacts as in the plan, RLS on, policies:
   select if app_can_view('/masters/clients'), insert/update if app_can_edit('/masters/clients'), delete if app_is_admin().
   Grants to authenticated only. Revoke from anon.
   Backfill one Registered Office and one Factory per client from address, district, state, pin_code, gst_number. Backfill one primary contact from contact_person_name, mobile, email.
   Trigger: when the primary site or primary contact changes, copy it back onto clients.address / district / state / pin_code / contact_person_name / mobile / email so quotations keep working.

4. bis_projects.factory_site_id uuid null references client_sites(id) on delete set null. Index it. Backfill to that client's Factory site when there is exactly one.

5. Unique index clients_company_name_lower_uidx on lower(btrim(company_name)).
   First count clashes (same lower(btrim(name)), different id). If the count is not zero, skip the new index and RAISE NOTICE with the count only (no client names in the notice if you can avoid a long list; a count is enough). Do not delete clients.
   Partial unique index on gst_number where gst_number is not null and gst_number <> ''. Same clash rule.

6. client_certificate_files (id, client_id FK on delete cascade, cert_name text not null, file_name, storage_path, file_size, mime_type, created_by, created_at).
   cert_name examples: GST Certificate, MSME Certificate, or a name typed in the table.
   Private bucket client-certificates. Storage path client_id/file_id/file_name. Policies: read if app_can_view('/masters/clients'), write if app_can_edit, delete if app_can_edit. No USING (true). Max 25 MB. pdf, jpg, png, webp.
   RLS on the table matches client_sites.

7. find_similar_clients(p_name text, p_gstin text) returns id, company_name, gst_number, similarity.
   SECURITY INVOKER, search_path public, pg_temp. Limit 5. Uses pg_trgm (already created in S6). Revoke from public and anon. Grant execute to authenticated.
   Empty name returns no rows.

8. search_clients must also return payment_term and remark.
   CREATE OR REPLACE cannot change the return type. DROP FUNCTION public.search_clients(text, integer, integer, boolean, text) and create it again with the same arguments, the same filters, and those two extra columns in the same order as the old columns plus payment_term, remark at the end.
   Grant execute to authenticated only. Revoke from public and anon. Keep SECURITY INVOKER and search_path public, pg_temp.
   Do not default a missing payment term to 100 % Advance inside the function.

NOTIFY pgrst, 'reload schema';

PART A2 — S6b test fixes (same session, no extra migration file)
- clientsApi.ts ClientSearchRow: add payment_term and remark. Map them from the RPC. Null stays null.
- ClientsMasterPage list mapper: use those fields. Do not write payment_term '100 % Advance' or remark null as a stand-in for "not loaded".
- Page CSV export uses the same loaded values. A row whose term is 30 Days exports 30 Days.
- ClientsFooterBar: Archive, Import, Export, and Delete use min-h-10 (40px). Do not shrink search or the pager.
- Chrome and Safari background.js: before any tabs.create or window open of a Manak URL, delete the passwd and password query params. clearRememberedPortal also deletes fillSentAt entries. Do not log the password.

PART B — frontend
- lib/indiaValidators.ts: GSTIN shape + mod-36 checksum + state code in india list, PAN, mobile ^[6-9][0-9]{9}$ when country code is +91, PIN. panFromGstin and gstinStateCode.
- features/masters/clients/clientsApi.ts: load/save sites and contacts, checkDuplicates via the RPC, and list/upload/delete client certificate files.
- Clients form sections: Statutory, Sites, Contacts, Lifecycle. State select includes the UT names. GSTIN blur fills PAN and gst state when empty.
- Duplicate panel before save. Copy asks for the new name.
- CSV: preview invalid rows, import only valid rows, offer an error CSV download.
- Add the options Buyer, Vendor, Both, Importer, Foreign Manufacturer, Trader to client_master_options by migration seed, and load types from that table. Keep the existing types.
- Quick-add AddClientDialog uses the same GSTIN and name checks.
- BIS project form: Factory site select for this client, saved to factory_site_id.
- bisForm1Html.ts: office from the Registered Office site, factory from factory_site_id, sector from clients.sector (fallback Private only when sector is empty), top management from the signatory or top-management contact.
- Certificate UI on the client form only. Upload GST Certificate sits on the GST number row. Upload MSME Certificate sits on the Scale row. Below, a table grouped by cert_name with upload, view, and delete. New clients can upload only after the client row exists (save first, then upload). Do not change the BIS Legal Documents screen in this session.

PART C — verify, do not ship
npm run typecheck must not exceed 122 new errors in touched files.
npm run lint must not exceed 352 new problems in touched files.
npm run build must pass.
Write docs/agents/reports/coding/S7_coding.md and one api-catalog row.
Do not migrate. Do not commit. Do not push.

Responsive: sections stack at 360px. Site and contact editors are cards under 640px. Touch targets at least 40px.
Footer of the client form can show "PAN from GSTIN" when it was derived. Nothing else futuristic.
