# S7: Client Master v2 (identity, sites, contacts, GSTIN, duplicates)

Status: APPROVED (Amit, 2026-10-09 05:39 IST)
Revised 2026-10-09: Amit confirmed the client gaps. Certificates that are the same for every licence of a client (GST, MSME, and other legal files) are stored on the client, not re-uploaded on each BIS licence. The BIS Legal Documents module stays until a later plan removes it.
Revised 2026-10-09: S6b testing issues are in this session. The directory must show the saved payment term and remark, not `100 % Advance`. Footer actions are at least 40px. Extension strips `passwd` from any opened URL and forgets the in-memory fill key. Chrome reload of the extension stays Amit's own check.
Revised 2026-10-09: Coder stopped at start check 3. The four uncommitted rule files from decision #12 are named on the prompt git add list so the dirty tree is allowed. Do not edit or commit them in this run. Product scope is unchanged.
Expected HEAD: `6da1adb` (S6b) · Work-order slot: Masters, after S6b
Decision: #13 (proposed). Does not change #10 MST-84, #22 vendors, #24 TDS, #26 e-Invoice.

## 1. Amit's instruction
Masters continues. S7 is the Client Master. Tell Amit what is missing today and what this session will add. No commit until he says "commit". No audit or test after this session.

## 2. What is missing today
Evidence is `docs/audits/02_masters_gap_audit.md` B1 and Form-I at `bisForm1Html.ts:421-436`.

| Gap | What the screen does now |
|---|---|
| One address | Office and factory on Form-I are the same `client.address`. BIS needs a separate application per factory. |
| One contact | Top management on Form-I is the single contact person. No signatory, QC, or accounts contact. |
| Thin identity | No PAN, CIN/LLPIN, Udyam, constitution, or sector. Form-I sector is hard-coded `Private`. |
| GSTIN check | Regex only. No checksum. No check that the first two digits match the state. |
| Duplicates | Unique on exact `company_name`. `Acme` and `acme` can both exist. No "similar name" warning. |
| Copy | Save as `Name - Copy` without asking. |
| Defaults | New client starts as Chhattisgarh, not from company settings. |
| State list | Hard-coded names. Some UTs are missing (Chandigarh, Ladakh, and others). |
| Company types | Code has Manufacturer, Service Provider, labs, Supplier. Decision #22 also needs Buyer / Vendor / Both. DB options and the form can disagree. |
| CSV import | Invalid GSTIN and unknown options are not shown row by row before import. |
| Scale | MST-84 stays out. Do not overwrite `company_scale` from Udyam. |
| Legal files per licence | `bis_project_files` (`doc_kind` legal) is stored on each BIS project (`LegalDocumentsModuleDialog.tsx`). The same GST, MSME, and other certificates are uploaded again for every licence of that client. |

Not in S7 (later): removing the BIS Legal Documents module. That happens in a later plan, after client certificates are in use. Also later: IS Code master, BIS offices, fee master, laboratory master, test parameters, service catalogue, company profile for finance.

## 3. Scope
- In: migration for states, client columns, sites, contacts, factory link, similar-name RPC, and client certificates. Client form sections. GST field has Upload GST Certificate. Scale field has Upload MSME Certificate. Below that, a certificate table (name + files). Form-I reads office site, factory site, sector, and signatory. Validators on the form, quick-add, and CSV preview. Buyer / Vendor / Both added to the option list. Duplicate warning. Copy asks for the new name.
- Out: auto company scale (MST-84). TDS on the client (decision #24). e-Invoice flags (decision #26). A merge-clients tool. Dropping `clients.name`. Laboratory master. Removing the BIS Legal Documents module (later plan). Commit, push, audit, test.

## 4. Items
| ID | Title | Priority | Acceptance |
|---|---|---|---|
| S7-A | Migration `20261009060000_s7_client_master_v2.sql` | P0 | New tables RLS on. Old clients still load. Scale column is not rewritten. |
| S7-B | Statutory + sites + contacts on the client form | P0 | A client can have more than one factory. Primary office and primary contact stay in the old columns. |
| S7-C | GSTIN checksum, duplicate warning, CSV preview, copy name | P0 | Bad checksum blocked. Case-only duplicate blocked when the new unique index can be created. |
| S7-D | Form-I and BIS project factory select | P1 | Form-I office and factory can differ. Sector is the client value, not the word Private. |
| S7-E | Client certificates | P0 | GST and MSME upload from those fields. Extra rows in a name + file table. One client's files are visible for that client only. BIS Legal module is not removed. |
| S7-F | S6b test fixes | P0 | Directory and page CSV show the saved payment term and remark. Archive, Import, Export, and Delete are at least 40px. Extension does not open a URL that still contains `passwd`. |
| S7-G | Docs | P2 | api-catalog rows for `find_similar_clients`, `search_clients` extra columns, and client certificate upload. No commit. |

## 5. Migration
File: `backend/database/migrations/20261009060000_s7_client_master_v2.sql`.
`SET LOCAL lock_timeout = '5s'`. Do not run it until Amit says "commit".
New tables `india_states`, `client_sites`, `client_contacts`, `client_certificate_files`. Private bucket `client-certificates`. Nullable columns on `clients`. `bis_projects.factory_site_id`. RPC `find_similar_clients` is `SECURITY INVOKER`. Policies use `app_can_view` / `app_can_edit` / `app_is_admin` on `/masters/clients`. No `USING (true)` write policy. Max file 25 MB, same as BIS project files.

## 6. Standing design rules
- AI/MCP-ready: `find_similar_clients` plus `clientsApi.ts` for create, update, sites, contacts, the duplicate check, and certificate upload/list/delete.
- Responsive: new sections stack at 360px. Site and contact rows are cards under 640px. Buttons at least 40px.
- Futuristic in scope: GSTIN fill derives PAN and state code into the form. Proposed: "possible duplicate" opens the other client.

## 7. Risks Amit should see before approve
1. Backfill creates one Registered Office and one Factory from today's single address. They start identical. You pick the real factory later.
2. If two live clients differ only by case or spaces, the new unique index is skipped and a notice is written. The form still warns.
3. This does not commit. Live DB changes only when you say "commit".
4. Quotation and sale documents keep using the client name and the old address columns. Those columns stay filled from the primary site and primary contact.
5. Existing legal files on BIS licences are not moved in S7. New uploads go to the client. The Legal module on the licence stays until a later plan.

## 8. Test plan (for the later module test, not this week)
| # | Check |
|---|---|
| 1 | Bad GSTIN checksum cannot save. A valid GSTIN fills PAN and state. |
| 2 | Second factory can be added. Form-I shows office and that factory as different addresses. |
| 3 | Signatory contact prints on Form-I. Sector is not forced to Private. |
| 4 | `acme` vs `Acme` is blocked or warned. Scale is unchanged. |
| 5 | Buyer, Vendor, and Both appear. Archived client behaviour from S6 still works. |
| 6 | Widths 360, 390, 768, 1280. |
| 7 | GST Certificate and MSME Certificate upload from those fields. A third named certificate can be added in the table. The file is stored once on the client. The BIS Legal module still opens. |
| 8 | A client saved with payment term 30 Days shows 30 Days on the directory row and in the page CSV. Remark is the saved text, not blank. |
| 9 | Archive, Import, Export, and Delete on Clients are at least 40px tall. |

## 9. Session summary
Coded 2026-10-09 07:57 IST. Migration file is written and not applied. Frontend, Form-I, factory select, certificates, and the S6b directory fixes are in the working tree. Verify stayed at typecheck 122, lint 352, build pass. Not committed. Live DB changes only when Amit says "commit", and the migration must run before that frontend is deployed.
