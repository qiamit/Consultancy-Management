S6b — Extension hardening + Client Directory server-side paging + schema drift tools
================================================================================================

Repo: /Users/amitkumar/Documents/Softwares/Consultancy Management   (branch main, HEAD must be e5dd94a — S6)
Approved by Amit on 2026-10-08 ("Approval"). Plan: docs/agents/plans/S6b_plan.md
No migration in this session. Do not run npm run db:migrate. Do not create a SQL file.

NOT in this prompt (do not start them):
- S7, S8, S9, S10
- Dropping portal_password columns or the compatibility trigger (wait until about 2026-10-15)
- Moving the encryption key to PORTAL_CREDENTIAL_KEY (no Railway variable)
- qe-consultancy-safari/macos-generated/ and qe-consultancy-safari/macos/
- The two S6 leftovers: viewer role plus a director designation, and renewal search by an archived client name

WHY
- The extension still puts the Manak password in the URL (background.js ebisLoginHref around line 696; content.js loginCredentialsFromUrl around 766; content.js import-QR redirect around 2433) and keeps it in rememberPortal (background.js around 626 and 918). App result tabs include *.railway.app (background.js APP_TAB_URLS around 21–24, and the same hosts in both manifest.json content_scripts). bridge.js postMessage uses target origin '*' and forwards QE_CAPTCHA_AI (around line 227). captcha-assist.js has a local OCR path (recognizeImage / recognizeBinary) and askAppAiCaptcha. The live login path the user needs is solvePageCaptcha / waitForCaptchaTyped: Amit types the captcha. Keep that.
- ClientsMasterPage.tsx loadClients (around line 276) uses fetchAllRows on public.clients, so the directory tries to load about 17,902 rows. search_clients and clientsApi.searchClients already exist. The RPC does not return payment_term or remark (migration 20261008200000 around line 748).
- There is no schema drift script. Newest migration file is 20261008200000_s6_portal_secrets_bis_rls.sql. Do not add another one.

WHAT S6b DOES
- Part A: Chrome and Safari extension source copies, same edits in both trees. Version 2.2.33.
- Part B: Client Directory list uses searchClients. Edit of one row still loads the full row by id.
- Part C: dump-schema + drift check. Read-only. No row data. No printed URL.
- Part D: api-catalog note, coding report, STATUS.

HOUSE RULES
- Do NOT edit any applied migration. Do NOT add a migration. Do NOT run npm run db:migrate.
- Do NOT open or print .env, .railway-secrets.env, any *backup*.json, or any secret. If you call railway variables the same way apply-migrations.mjs already does, never print the JSON or the URL.
- NEVER git add docs/prompts/, .env*, .railway-secrets.env, any *backup*.json. No git add -A or git add .
- Passwords: never console.log, toast, URL, chrome.storage.local, or the coding report.
- Minimal changes. No new npm dependency. pg is already a root dependency. No refactors outside this list.
- Chrome and Safari copies of each edited file must match, except manifest name/description if they already differ. Do not hand-edit macos-generated.
- Standing rules: directory goes through search_clients; screens work at 360/390/768/1280; footer shows "Showing X–Y of N".

=====================================================================
PART A — extension (both chrome and safari source folders)
=====================================================================
Bump version to 2.2.33 in both manifest.json files and in frontend/extensions/README.md.

A1. Stop putting the password in any URL.
- background.js ebisLoginHref: set userId only. Never set passwd or password.
- content.js loginCredentialsFromUrl: keep reading userId. Do not read passwd or password from the query string (return password "").
- content.js around line 2433: when redirecting to eBIS login, set userId only. Do not set passwd. The password must already be applied by the fill message, not by the address bar.
- Grep both copies for `passwd`. The only allowed hits are comments or the HTML field name `input[name='passwd']` used to find the form field. No searchParams.set("passwd".

A2. Do not persist the password.
- rememberPortal may keep userId and password in the service-worker variable lastPortal for the current fill only.
- Do not write the password into chrome.storage.local (including qeManakPortal if that object is stored). If a stored portal object exists, store userId only.
- Call clearRememberedPortal when the Manak session is detected as logged in, and also 2 minutes after rememberPortal.
- scheduleLoginFill may still send the password in the in-memory fill message so the form is filled.

A3. App origins.
- APP_TAB_URLS and APP_HOST_RE in background.js: keep localhost, 127.0.0.1, and qengineering.in. Remove railway.app, up.railway.app, consultancy-production, and frontend-production.
- Both manifest.json content_script match lists for bridge.js: same removal. Keep localhost and qengineering.in (including www and subdomains already listed).
- Do not add externally_connectable. The app talks through postMessage, not external messaging.
- Do not change Manak / BIS / BSB host matches. Those are the portals the extension fills.

A4. bridge.js
- Every window.postMessage(..., "*") becomes window.postMessage(..., window.location.origin).
- On the message listener, ignore the event unless event.origin === window.location.origin (keep the existing event.source === window check).

A5. Remove automatic captcha reading. Keep manual typing.
- Delete the QE_CAPTCHA_AI handler in background.js (around line 818) and in bridge.js (around line 212).
- In captcha-assist.js remove recognizeImage, recognizeBinary, askAppAiCaptcha, and helpers that exist only for that OCR path. Do not remove solvePageCaptcha, waitForCaptchaTyped, highlightCaptcha, prepareManualCaptcha, or the 10 second hold.
- If a helper is shared with the manual path, keep it and say so in the report.
- content.js and is-code-fetch.js must still call solvePageCaptcha. Amit types the captcha. The extension must not fill the captcha from an image.

A6. After the edits, run node --check on each edited JS file in both copies.

=====================================================================
PART B — Client Directory (frontend/web/src/features/masters/clients/ClientsMasterPage.tsx)
=====================================================================
B1. loadClients must not use fetchAllRows and must not select the whole clients table.
- Call searchClients from @/lib/clientsApi with:
  - search: the current search box, debounced about 300ms
  - limit: the page size, but never above 200 (the RPC cap)
  - offset: (page - 1) * limit
  - includeArchived: showArchived
- Store total from the result. pageCount = max(1, ceil(total / limit)).
- Map each ClientSearchRow into the list row. payment_term and remark are not on the RPC. Use the same defaults the page already uses for a missing payment term. Do not invent data.
- Reset to page 1 when search or showArchived or page size changes.
- District and PIN option lists must not be built by scanning every client. Keep client_master_options (loadMasterOptions). Remove the merge that copies district and pin_code off the full client array.

B2. The on-screen list is the RPC page. Remove the client-side filter that slices a full in-memory array for paging. Column header sort may reorder the current page only. Do not add a new sort RPC.

B3. Edit / copy / details of one row: load that row with supabase.from('clients').select(...).eq('id', id).single() using the columns the form already needs, including payment_term and remark. Do not use the thin search row as the only source for the form.

B4. CSV export exports the current page only. Toast: "Exported this page (N of TOTAL)." Do not loop the whole table.

B5. Footer text: "Showing X–Y of N" using total_count. Existing pager stays. Touch targets on the pager and search stay at least 40px. Cards below lg stay. Check that 360px does not clip the search box (limsToolbarScrollClass if a toolbar is added).

B6. If a page-size choice in the UI is greater than 200, cap the request at 200 and keep the footer math on that cap. Do not raise the RPC limit.

=====================================================================
PART C — schema tools (no SQL migration)
=====================================================================
C1. Add backend/scripts/dump-schema.mjs and backend/scripts/check-schema-drift.mjs.
- Resolve the database URL the same way as backend/scripts/apply-migrations.mjs (getDatabaseUrl). Never print the URL, the Railway JSON, or any row from public.clients or any password column.
- Query only information_schema.columns for table_schema = 'public': table_name, column_name, data_type, is_nullable, ordinal_position. Order by table_name, ordinal_position.
- dump-schema writes backend/database/schema/public-columns.json (pretty JSON). Print one line: column count and table count.
- check-schema-drift runs the same query and compares it to that file. Print only added or removed lines as table.column. Exit 0 when equal, exit 1 when not.
- If the URL is missing, print "DATABASE_URL not found" and exit 1. Do not invent a URL.

C2. package.json scripts:
- "db:dump-schema": "node backend/scripts/dump-schema.mjs"
- "db:drift": "node backend/scripts/check-schema-drift.mjs"
Do not change db:migrate or db:push.

C3. From the JSON, write frontend/web/src/lib/dbSchema.generated.ts:
- export const publicTables
- export const publicColumns as a record of table name to column names
- No runtime import from app screens in this session. The file must typecheck on its own (no unused locals).

C4. Run npm run db:dump-schema, then npm run db:drift. Drift must exit 0. Commit the JSON and the generated ts file. If dump fails, STOP. Do not commit a hand-written column list.

=====================================================================
PART D — docs
=====================================================================
D1. docs/agents/api-catalog.md: on the search_clients row, note that Masters → Clients calls it for the directory page (limit max 200, archived flag, total_count). Do not add a new RPC.
D2. docs/agents/reports/coding/S6b_coding.md from the template. BASELINES.md only if typecheck or lint improved. STATUS.md as in ORDER step 7.

=====================================================================
ORDER + STOP RULES (follow exactly)
=====================================================================
1. VERIFY after Parts A–D are written. Do this before any database script:
     npm run typecheck  → must not exceed 122 errors, and no new errors in files you touched
     npm run lint       → must not exceed 352 problems, and no new problems in files you touched
     npm run build      → must succeed
     node --check on each edited extension JS file
   functions:check is not needed.
   If anything gets worse, fix it. If you cannot, STOP. Do not commit. REPORT.
2. Do NOT run npm run db:migrate. There is no new SQL file. If you believe a migration is required, STOP and report why.
3. npm run db:dump-schema then npm run db:drift. Drift exit 0. Never print a URL. If dump fails, STOP. Do not commit.
4. Write the coding report.
5. git add ONLY these paths when you actually changed them:
     frontend/extensions/qe-consultancy-chrome/background.js
     frontend/extensions/qe-consultancy-chrome/content.js
     frontend/extensions/qe-consultancy-chrome/bridge.js
     frontend/extensions/qe-consultancy-chrome/captcha-assist.js
     frontend/extensions/qe-consultancy-chrome/manifest.json
     frontend/extensions/qe-consultancy-safari/background.js
     frontend/extensions/qe-consultancy-safari/content.js
     frontend/extensions/qe-consultancy-safari/bridge.js
     frontend/extensions/qe-consultancy-safari/captcha-assist.js
     frontend/extensions/qe-consultancy-safari/manifest.json
     frontend/extensions/README.md
     frontend/web/src/features/masters/clients/ClientsMasterPage.tsx
     frontend/web/src/lib/clientsApi.ts
     frontend/web/src/lib/dbSchema.generated.ts
     backend/scripts/dump-schema.mjs
     backend/scripts/check-schema-drift.mjs
     backend/database/schema/public-columns.json
     package.json
     .cursorrules
     .cursor/rules/00-project-core.mdc
     .cursor/rules/05-qe-standards.mdc
     .cursor/rules/50-workflow-prompts.mdc
     .cursor/rules/qe-auditor.mdc
     .cursor/rules/qe-coder.mdc
     .cursor/rules/qe-planner.mdc
     .cursor/rules/qe-tester.mdc
     docs/agents
   Plus any other file you had to touch for B3 or A5. Name it in the report.
   Then git status --short, git diff --cached --stat, and the secret scan from qe-coder.mdc.
   docs/prompts/ stays untracked. No .env. No macos-generated.
The eight rule files above are already edited (Hinglish replies, decision #9). Do not rewrite them. Include them in this commit so the tree can start clean of anything outside the git add list.

6. git commit -m "S6b: harden Manak extension (no password in URLs), Client Directory paging via search_clients, schema drift check"
7. git push origin main
8. REPORT, set STATUS to stage AUDIT, owner QE Auditor, IST time from date '+%Y-%m-%d %H:%M %Z', one log row.
   End with exactly:
   NEXT: open "QE Auditor" chat and paste: @qe-auditor Start audit for S6b (commit <short-hash>)

=====================================================================
REPORT (paste back)
=====================================================================
- typecheck / lint / build versus 122 / 352 / pass
- node --check results
- db:dump-schema one-line count, db:drift exit code
- confirm npm run db:migrate was not run
- commit hash, push result
- files, one line each
- anything skipped (OCR helper kept because it was shared, page size cap, sort is current-page only)

=====================================================================
POST-DEPLOY CHECKS (for QE Tester, after the frontend deploy)
=====================================================================
The extension is not deployed by Railway. Amit reloads it in Chrome. Safari needs a rebuild later; this commit only updates the Safari source copy.
1. Clients page: search_clients in the network tab. Total about 17,902. A search hits. Page 2 is another request. Show archived off hides archived rows.
2. Edit one existing client: payment term and remark load. Do not change a real client. A ZZ TEST client is allowed if one is created and then deleted.
3. Widths 360, 390, 768, 1280: search and pager usable.
4. With the reloaded extension, Manak Assist on a test licence: address has no passwd=. The password field is filled. The captcha box waits for typing.
5. npm run db:drift exits 0 and prints no database URL.
6. Logged-out home and login still show. S6 reveal still masks the password. anon REST still 401.
