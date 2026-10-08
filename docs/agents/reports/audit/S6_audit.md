# S6 audit report

- Date/time (IST): 2026-10-08 20:46 IST · Commit audited: `ff2b9f7..e5dd94a`
- Verdict: PASS WITH ISSUES

No BLOCKER. Encryption, RLS, access log, and the admin-only reveal path match the approved prompt. Three behaviour gaps should be tested and then decided by QE Planner (none of them reopen plaintext list access).

## Baselines (re-run)
| Check | Now | Baseline |
|---|---|---|
| typecheck | 122 errors | 122 |
| lint | 352 problems (313 errors, 39 warnings) | 352 |
| build | pass (existing CSS `button` warning and chunk-size warning) | pass |

`functions:check` not re-run. The functions service is not in this diff.

## Findings
| # | Severity | Area | File:line | Problem | Suggested fix |
|---|---|---|---|---|---|
| 1 | MEDIUM | SQL/RLS | `backend/database/migrations/20261008200000_s6_portal_secrets_bis_rls.sql:103` and `frontend/web/src/lib/isLaboratoryDirector.ts:9` | `role = viewer` does not make a user read-only when their designation is still an admin designation. `app_is_admin()` returns true on designation before `app_module_level` can cap the role (`:133`). The same early return is in `resolveModuleAccess.ts:73` and `:134`. The Users page can show Viewer while that person still has admin (History, Reveal, edits). A Staff user with no admin designation is capped correctly. | In `app_is_admin()` and `isLaboratoryDirector()`, ignore the designation list when `role` is `viewer`. Directors were already backfilled to `role = admin`, so they stay admins until an admin changes the role. |
| 2 | MEDIUM | Secrets | `backend/database/migrations/20261008200000_s6_portal_secrets_bis_rls.sql:548` | `bis_new_applications.portal_password` is set to NULL and then CHECK-locked. Those values are not copied into `private.bis_portal_secrets`. The live UI does not read this table. If it held Manak passwords that were not also on `bis_projects`, they are gone. | No recovery in this session. Tester counts rows only (never the column). If the table was unused, close this. |
| 3 | MEDIUM | Frontend | `frontend/web/src/features/bis/renewals/bisRenewalsApi.ts:28` | Archived clients are hidden from pickers, which is correct. The same `.is('archived_at', null)` is on `matchingClientIds`, which also feeds renewal list search. Searching a renewal by an archived client's name no longer finds that renewal. | Filter archived clients only in dropdown lookups. Leave list search able to match the client already stored on the renewal. |
| 4 | LOW | Frontend | `frontend/web/src/features/bis/projects/bisProjectsApi.ts:23` | The BIS list still selects `*`, so the JSON still has the key `portal_password`. The column is forced NULL, so this is not the secret. | Tester confirms every list response has `portal_password: null` and `portal_password_set` only. A later session can drop the column (S6b). |
| 5 | LOW | Frontend | `frontend/web/src/features/bis/projects/bisPortalSecretApi.ts:16` | Unknown RPC errors are rethrown with the raw PostgREST message. Known permission, rate-limit, and length errors are replaced. | Map any remaining error to a fixed sentence so a database message cannot echo the argument. |
| 6 | LOW | Frontend | `frontend/web/src/index.css:181` | View-only mode only blocks amber and red buttons. Change, Clear, and Manak Assist stay clickable. Writes and password RPCs still fail on the server for a real viewer. | Tester confirms a non-director Viewer cannot save. A later session can disable those outline actions when `data-module-access="view"`. |

## Scope and hygiene
- Diff matches the approved prompt, including the QE workflow files the prompt told the coder to commit. One new migration, status `A` only: `20261008200000_s6_portal_secrets_bis_rls.sql`. No older migration was edited.
- `docs/prompts/` is untracked and is not in `e5dd94a`.
- No `.env`, backup JSON, or hard-coded key in the diff. The portal key is generated inside the database (`private.app_keys`).
- Frontend `passwd=` is gone. `postMessage` target is `window.location.origin`. The extension still builds `passwd=` URLs and stores passwords; that is S6b, not this commit.
- Functions service, Dockerfile, and `frontend/web/package.json` are unchanged.

## Standing design rules
- AI/MCP-ready: business rules for set, reveal, login, role, history, and client search are RPCs under the caller's JWT. Typed clients: `bisPortalSecretApi.ts`, `clientsApi.ts`, `auditApi.ts`. Catalog rows are in `docs/agents/api-catalog.md`. `search_clients` is `SECURITY INVOKER` (caller RLS). The other new functions are `SECURITY DEFINER` with `search_path` set, `REVOKE` from `PUBLIC` and `anon`, and a permission check inside. `private.portal_key()` is not granted to `authenticated`.
- Responsive: password row wraps and uses 40px targets (`BisProjectsForm.tsx:210`, `:657`). History dialog is `w-[min(42rem,calc(100vw-1rem))]`, table from 640px, cards below (`AuditHistoryDialog.tsx:177`, `:196`). Users table scrolls (`UserManagementTable.tsx:33`). BIS form dialog uses `calc(100vw-1.5rem)`.
- Futuristic suggestions (max 3):
  1. A small admin list of `portal_secret_access_log` on the BIS project form (who revealed or logged in, never the value).
  2. Press `H` for History when exactly one master row is selected.
  3. Picker hint: "Archived clients are hidden."

## Regressions checked
- Anon is not granted the new RPCs. Settings writes were not reopened. `user_profiles_guard_privileged` now also blocks `role`. Self-demotion is refused (`set_user_role`, `:251`).
- BIS table policies are dropped and recreated from `app_can_view` / `app_can_edit` / `app_is_admin`. No `USING (true)` write. Storage policies for `bis-project-files` are the same four names, now with the module check.
- `bis_projects` delete stays admin-only. Audit triggers on BIS tables are created after the password backfill. `audit_strip_secrets` removes keys ending in password, secret, token, and `key_hex`, and the migration scrubs existing `audit_log` rows.
- S1–S5 helpers (`app_can_edit`, archive, `delete_master_rows`) are not rewritten except `app_is_admin` and `app_module_level`, which keep the old designation rule and add `role`.

## Tester must check
1. Do not paste any password into chat or the testing report.
2. Admin, BIS project with a saved password: Reveal and Copy. Password shows for 20 seconds, then hides. Access log action is `reveal`. A BIS editor sees no Reveal or Copy.
3. BIS editor, Manak Assist with the extension: login works, and no URL contains `passwd=`.
4. Network tab on the BIS list: `portal_password` is null. `portal_password_set` is the only flag.
5. BIS editor: change and clear a `ZZ TEST` project's password. Reopen shows Saved or Not set.
6. Non-director test user: Module Access View, then None. View cannot save. None sees no BIS rows and Manak password RPC is refused. Then Users role Viewer: view-only. Do not expect this for a Laboratory Director (finding 1). Self-demote is refused.
7. Admin vs editor on Clients, IS Codes, Products/Services, and Test Parameters: History only for admin, and only when one row is selected.
8. Pickers (BIS project, Quotation, other sale documents): archived `ZZ TEST` client is not offered. An existing quotation that already uses that client still shows the name.
9. Renewals search by that archived client's name (finding 3): record whether the renewal disappears.
10. Widths 360, 390, 768, and 1280: BIS password row, History dialog, Users role column, quotation client picker. No clipped controls. Touch targets at least 40px.
11. Read-only SQL, counts only: `portal_password` null count, `portal_password_set` count, secret-table count, `portal_secret_access_log` action `migrate` count, and zero `audit_log` keys that look like passwords. Also the row count of `bis_new_applications` (finding 2). Confirm the deployed frontend commit is `e5dd94a` before UI tests.
