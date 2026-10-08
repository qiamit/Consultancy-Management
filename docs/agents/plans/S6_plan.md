# S6: Manak passwords encrypted + BIS module-level RLS + roles + audit history UI + archived-free pickers + search_clients

Status: APPROVED (Amit, 2026-10-08 20:15 IST)
Revised 2026-10-08 20:21 IST: S6 in-scope is unchanged. S6b is recorded as decision #7. S6b starts only after S6 closes.
Expected HEAD: `ff2b9f7`  ·  Work-order slot: Masters (S6 of S6–S10)

## 1. Amit's instruction (restated)
- Encrypt client Manak Online passwords (approved 08-Oct-2026, reverses the MST-07 exclusion; decisions.md #11). Lists never return them; only Admin can reveal; the extension gets one only at login time; audit_log never stores them.
- Server-side client list (R14 / MST-08), shared client data layer, pickers hide archived rows (MST-05, decision #13).
- Audit history view on masters (Admin). Role column (MST-03). BIS permissions like S4 masters. Schema drift fix (MST-01 / R3).
- Standing rules: AI/MCP-ready, responsive 360/390/768/1280, small futuristic items. Split into S6/S6b if too big.

## 2. Evidence (file:line, live facts, earlier reports)
- 257 plaintext passwords in `bis_projects.portal_password` (live, read-only count); returned by list queries (`types.ts:93,385`, `BisProjectsTable.tsx:155`, `LegalDocumentsModuleDialog.tsx:1217`).
- Password in URL: `manakExtensionBridge.ts:57` (`passwd=`); postMessage `'*'` at `:81,164,211,340,341,436`. Extension also builds `passwd=` URLs (`background.js:696`, `content.js:766,2433`) and stores it (`background.js:918`).
- BIS tables + `bis-project-files` bucket: USING(true) policies (live `pg_policies`). Audit: `/workspace/bis/bis_ops_audit.md` G1/G2.
- No role column; admin = designation (`lib/isLaboratoryDirector.ts`). Re-audit `04_masters_reaudit.md` R3/R4/R14.
- Live-only: `bis_projects.is_qe_managed`, `application_stage`, table `bis_renewal_applications`.
- Pickers include archived: `clientsCache.ts:36`, `bisProjectsApi.ts:204,217,285`, `bisRenewalsApi.ts:26`.

## 3. Scope
- In (S6): migration (encryption + access log + RPCs, audit secret stripping + history RPC, role + viewer cap, BIS RLS + bucket + audit triggers, reconciliation, search_clients + trigram indexes); frontend password UI and bridge; clientsApi + archived-free pickers; AuditHistoryDialog on 4 masters; role in UI; api-catalog.
- Out → S6b (decision #7, after S6 closes): (1) browser-extension hardening, Chrome and Safari together; (2) Client Directory server-side search and paging; (3) dump-schema / gen-types / drift-check; (4) drop deprecated `portal_password` columns and the compatibility trigger after S6 has been live for a week; (5) optional move of the encryption key to functions variable `PORTAL_CREDENTIAL_KEY` (Amit sets the Railway variable). Email-account passwords are a later item. Finance/quotation open write policies are F1.

## 4. Items
| ID | Title | Priority | Files | Acceptance criteria |
|---|---|---|---|---|
| S6-A | Migration `20261008200000_s6_portal_secrets_bis_rls.sql` | P0 | backend/database/migrations | Applies once, idempotent; 0 plaintext; flags = secrets; anon executes only 2 public RPCs |
| S6-B | Password UI + bridge | P0 | features/bis/projects/* | No password in list responses or URLs; Admin Reveal 20 s; IE login via extension works |
| S6-C | clientsApi + pickers exclude archived | P1 | lib/clientsApi.ts, clientsCache.ts, bisProjectsApi.ts, bisRenewalsApi.ts, Quotation/SaleDocument pages | Archived not offered; existing docs still show their client |
| S6-D | Audit History dialog | P1 | components/lims/AuditHistoryDialog.tsx, lib/auditApi.ts, 4 master footers/pages | Admin sees who/when/what; non-admin no button |
| S6-E | Role in UI | P1 | useAuth.ts, isLaboratoryDirector.ts, resolveModuleAccess.ts, UserManagementForm/Table | role admin = admin; viewer = view-only; E4 skippable |
| S6-F | Docs | P2 | docs/agents/api-catalog.md, reports/coding/S6_coding.md | 6 RPC rows added |

## 5. Migration (if any)
File: `backend/database/migrations/20261008200000_s6_portal_secrets_bis_rls.sql` (~826 lines, idempotent, verbatim in `S6_coder_prompt.md`).
- pgcrypto AES-256; key generated in DB in schema `private` (no API grants; not exposed by PostgREST). Vault rejected (root key not on the Railway volume). **No Railway variable needed.** Caveat: a full DB dump contains key + ciphertext.
- Backfill with verified count (RAISE → whole file rolls back), then NULL + CHECK constraints; compatibility trigger for the old frontend.
- New SECURITY DEFINER functions all `SET search_path = public, pg_temp` (exceptions: list_team_users keeps its existing `public, auth, pg_temp`; private.portal_key uses `private, pg_temp`) and REVOKE PUBLIC/anon. `SET LOCAL lock_timeout = '5s'`.
- Rollback-tested? Yes, by Grok Bot on 08-Oct-2026 19:54–19:58 IST — ON LIVE inside BEGIN…ROLLBACK: 81/82 (1 test-query bug, not a migration failure), live unchanged. **This caused an app outage (locks)**; rule added: never again on live. Later edits (2 SET LOCAL lines) reviewed statically only.

## 6. Standing design rules
- AI/MCP-ready: `bis_portal_secret_set`, `bis_portal_secret_get`, `get_audit_history`, `set_user_role`, `search_clients`, `app_can_view`; api-catalog rows; typed `bisPortalSecretApi.ts`, `clientsApi.ts`, `auditApi.ts`.
- Responsive: BIS project form password row, AuditHistoryDialog (cards < 640 px), pickers, Users form — at 360/390/768/1280.
- Futuristic in scope: auto-mask after 20 s with countdown; Admin Copy without display; "Saved • encrypted" badge. Proposed: "last changed by/when" from the access log; AI agent client lookup via search_clients MCP tool; per-user reveal alerts to Admin.

## 7. Risks and decisions needed from Amit
1. **Approve S6 / S6b split.**
2. Users whose BIS Module Access is None lose BIS access (correct, but visible). Check Settings → Module Access before deploy.
3. `db:migrate` takes brief exclusive locks: run only when nobody is using the app (coder asks Amit first).
4. A few minutes between migrate and frontend deploy: old UI opens Manak without auto-filled password.
5. Key in DB (not a Railway variable): protects against API/browser leaks, not against someone with a full DB dump. Upgrade path in S6b.

## 8. Test plan for QE Tester
| # | Role | Steps | Expected |
|---|---|---|---|
| 1 | Admin | BIS project with password → Reveal / Copy | Shows 20 s then hides; logged as reveal |
| 2 | IE (BIS edit) | Same project | No Reveal; Manak Assist auto-login via extension; no `passwd=` in any URL |
| 3 | Any | Network tab on BIS list | No password values; `portal_password_set` only |
| 4 | IE | ZZ TEST project: change / clear password | Saved / Not set after reopen |
| 5 | Test user | BIS View, then None | View: read-only; None: no rows, Manak refused |
| 6 | Admin | Users → role Viewer / Staff; self-demote | Viewer view-only everywhere; self-demote refused |
| 7 | Admin / IE | Masters → History | Admin sees history; IE no button |
| 8 | Any | Pickers with archived ZZ TEST client | Not offered; existing document still shows name |
| 9 | Any | 360/390/768/1280 | No clipped controls |
| 10 | SQL read-only | Queries in POST-DEPLOY #10 | 0 plaintext; migrate 257; audit has no secrets |

## 9. Session summary (filled by QE Planner at close)
Shipped in `e5dd94a` on 2026-10-08. 257 Manak passwords are encrypted. Plaintext left is 0. BIS module permissions, roles, history on four masters, and archived-client pickers are live.
Tester verdict: PASS WITH ISSUES. No blocker. Amit should still check Reveal for 20 seconds, Copy, and Manak Assist in a browser that has the extension. Also check Safari, iPhone, Android, and Firefox.
Two medium leftovers stay out of S6b: a Viewer who still has a director designation remains an admin, and renewal search drops an archived client's name. `bis_new_applications` had 0 password rows, so nothing was lost there.
S6b remains decision #7. Dropping the old password columns waits until S6 has been live for a week.
