# S6b: Extension hardening + Client Directory paging + schema drift tools

Status: APPROVED (Amit, 2026-10-08, "Approval")
Revised 2026-10-09: coding stopped because eight rule files were dirty. Those files are now on the git add list. Coder start check allows a dirty path only when the prompt lists it. Scope of the product work is unchanged.
Expected HEAD: `e5dd94a`  ·  Work-order slot: Masters follow-up after S6 (decision #7, #10)

## 1. Amit's instruction (restated)
Amit approved S6b as the next session. S7–S10 stay unscoped and are not in this run. Coding, then one audit, then one test. The next plan comes from those observations.

This run is the part of S6b that can ship today:
- Browser extension hardening (Chrome and Safari source copies together).
- Client Directory server-side search and paging through `search_clients`.
- Schema dump + drift check. No new dependency.

Out of this run (decision #7 timing):
- Drop `portal_password` columns and the compatibility trigger. S6 went live on 2026-10-08. That drop waits until about 2026-10-15.
- Optional move of the encryption key to `PORTAL_CREDENTIAL_KEY`. No Railway variable in this run.

## 2. Evidence
- Extension still builds `passwd=` URLs: `background.js:696`, `content.js:766` and `:2433`. `rememberPortal` keeps the password (`background.js:626`, `:918`). `APP_TAB_URLS` includes `*.railway.app` (`background.js:21-24`). `bridge.js` posts with `'*'` and handles `QE_CAPTCHA_AI` (`bridge.js:227`). Same files exist under `qe-consultancy-safari/`.
- Client Directory loads every client: `ClientsMasterPage.tsx:276` via `fetchAllRows`. About 17,902 rows. PostgREST caps a single response at 10,000, so the end of the A–Z list never appears (MST-08). `search_clients` already exists (`20261008200000_s6_portal_secrets_bis_rls.sql:740`) and `clientsApi.searchClients` wraps it. It does not return `payment_term` or `remark`.
- No `db:drift` script. `backend/scripts/` has only `apply-migrations.mjs` and `refuse-hosted-cloud.cjs`.

## 3. Scope
- In: extension source copies, Client Directory list loading, schema scripts, `package.json` scripts, api-catalog note, coding report.
- Out: S7–S10, column drop, key move, `macos-generated/` regeneration, finance tables, email passwords, the two S6 medium leftovers (viewer+director designation, renewal search).

## 4. Items
| ID | Title | Priority | Files | Acceptance criteria |
|---|---|---|---|---|
| S6b-A | Extension hardening | P0 | `frontend/extensions/qe-consultancy-chrome/` and `qe-consultancy-safari/` (not `macos-generated/`) | No `passwd=` built. Password not persisted. Railway hosts not app targets. OCR/AI captcha path removed. User still types the captcha. Version `2.2.33` |
| S6b-B | Client Directory paging | P0 | `ClientsMasterPage.tsx`, `clientsApi.ts` if a field map is needed | Opening Clients does not call `fetchAllRows` on `clients`. Search and page come from `search_clients`. Edit loads that one row by id |
| S6b-C | Schema drift tools | P1 | `backend/scripts/dump-schema.mjs`, `check-schema-drift.mjs`, `package.json` | `npm run db:drift` exits 0 against the committed column list. Output has no URL and no row data |
| S6b-D | Docs | P2 | api-catalog, coding report, STATUS | Catalog notes the directory caller. No migration file |

## 5. Migration
None. Do not run `npm run db:migrate`. Do not add a SQL file.

## 6. Standing design rules
- AI/MCP-ready: the directory uses existing RPC `search_clients` (already in api-catalog). No new RPC.
- Responsive: Clients list at 360 / 390 / 768 / 1280. Cards stay below `lg`. Page controls at least 40px. Search box not clipped.
- Futuristic in scope: the footer shows "Showing X–Y of N" from `total_count`. Proposed only: saved recent client searches.

## 7. Risks and decisions already made
1. Column drop and key move are not in this commit.
2. `search_clients` limit is capped at 200. Page size options above 200 must be capped at 200.
3. Server order is `company_name`. Column sort reorders only the current page. Say that in the coding report.
4. CSV export exports the current page, not all 17,902 rows.
5. Schema scripts may read `DATABASE_URL` the same way as `apply-migrations.mjs`. They must not print the URL or the Railway JSON.
6. Chrome and Safari source files stay in sync. Do not edit `macos-generated/`.

## 8. Test plan for QE Tester
| # | Role | Steps | Expected |
|---|---|---|---|
| 1 | Admin | Open Masters → Clients | Network shows `search_clients` (or one page), not a full-table loop. Footer total is about 17,902 |
| 2 | Admin | Search a known client, then a nonsense string | Match appears. Nonsense shows an empty page and total 0 |
| 3 | Admin | Next page, then Show archived | Page 2 is a new request. Archived `ZZ TEST` client appears only when Show archived is on |
| 4 | Admin | Edit one client | Form has payment term and remark (loaded by id), save still works. Use a `ZZ TEST` row only if creating one |
| 5 | Admin | Widths 360, 390, 768, 1280 | Cards or table usable. Search and pager not clipped |
| 6 | Admin | Chrome with the updated extension, Manak Assist on a `ZZ TEST` licence | Address has `userId` and no `passwd=`. Password is filled in the form. Captcha is typed by the user, not auto-read |
| 7 | — | `npm run db:drift` | Exit 0. Output has no database URL |

## 9. Session summary (filled by QE Planner at close)
