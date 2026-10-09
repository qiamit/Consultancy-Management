# S6b audit report

- Date/time (IST): 2026-10-09 05:24 IST · Commit audited: `e5dd94a..6da1adb`
- Verdict: PASS WITH ISSUES

No BLOCKER. Extension hardening matches the prompt. One Clients Directory behaviour is wrong on screen and in CSV.

## Baselines (re-run)
| Check | Now | Baseline |
|---|---|---|
| typecheck | 122 errors | 122 |
| lint | 352 problems (313 errors, 39 warnings) | 352 |
| build | pass (existing CSS `button` warning and chunk-size warning) | pass |

`node --check` passed on `background.js`, `content.js`, `bridge.js`, and `captcha-assist.js` in both the Chrome and Safari copies. `functions:check` was not re-run. The functions service is not in this diff.

## Findings
| # | Severity | Area | File:line | Problem | Suggested fix |
|---|---|---|---|---|---|
| 1 | HIGH | Frontend | `frontend/web/src/features/masters/clients/ClientsMasterPage.tsx:189` | `search_clients` does not return `payment_term` or `remark`. The list mapper writes `100 % Advance` and `remark: null` on every row. The table shows that term (`ClientsTable.tsx:307`). CSV export of the page writes the same values (`ClientsMasterPage.tsx:1139`). Import would save them. Edit and copy load the real row by id (`:407`, `:836`), so the form is correct and the list is not. | Show a blank payment term and remark on list rows. For export, load those two columns for the current page ids before writing the CSV. Do not put the form default on rows that were not loaded in full. |
| 2 | LOW | Secrets | `frontend/extensions/qe-consultancy-chrome/background.js:916` | `ebisLoginHref` sets `userId` only (`:708`). If the page still sends `message.loginUrl` with `passwd=` already in it, that URL is opened as-is (not on the Import QR path). The current app does not send `passwd=`. | Strip `passwd` and `password` from any URL before `tabs.create`. Same edit in the Safari copy. |
| 3 | LOW | Secrets | `frontend/extensions/qe-consultancy-chrome/background.js:679` | `clearRememberedPortal` clears `lastPortal` after login and after 2 minutes (`:632`, `:148`). `fillSentAt` keys still contain the password string until the service worker restarts. It is not written to `chrome.storage`. | Drop `fillSentAt` entries inside `clearRememberedPortal`. Same edit in the Safari copy. |
| 4 | LOW | Responsive | `frontend/web/src/features/masters/clients/ClientsFooterBar.tsx:63` | Search and pager are 40px. Archive, Import, Export, and Delete stay `h-8` (32px). | Raise those footer actions to `min-h-10` when that bar is next touched. |

## Scope and hygiene
- Diff matches the approved prompt. No migration file. `git diff --name-status e5dd94a..6da1adb -- backend/database/migrations` is empty.
- `docs/prompts/` is untracked and is not in `6da1adb`.
- Chrome and Safari copies of the four edited JS files match. Manifests differ only by the name `QE Consultancy Safari`. Version is `2.2.33`. `macos-generated/` was not edited.
- Extra files named in the coding report: `ClientsFooterBar.tsx`, `ClientsHeaderBar.tsx`. `docs/agents` also brought in the earlier S6 test SQL. Those files count flags only. They do not contain password values.
- Schema dump is column metadata only (`public-columns.json`). Scripts print a count or `table.column` lines. The query error path prints `Schema query failed`, not the URL. No new npm dependency. No new RPC.
- No `passwd=` is built in the extension. `qeManakPortal` and `pendingFill` store user id and a payload with the password fields removed. OCR and `QE_CAPTCHA_AI` are gone. `solvePageCaptcha` still waits for typing. `bridge.js` checks `event.origin` and posts to `window.location.origin`. Railway hosts are gone from app-tab matches. The Manak PDF API URL in the README is the functions host, not an app-tab match.

## Standing design rules
- AI/MCP-ready: the directory calls the existing `search_clients` RPC under the user JWT. Catalog row notes the Clients page caller. No new RPC. `dbSchema.generated.ts` is not imported by a screen in this session.
- Responsive: footer says `Showing X–Y of N`. Search uses `limsToolbarScrollClass`. Pager targets are 40px. Cards below `lg` were already there. Column sort reorders the current page only, as the prompt required.
- Futuristic suggestions (max 3):
  1. Remember the last few Clients search strings on this browser.
  2. Export warning when payment term is not loaded, until finding 1 is fixed.
  3. After a Manak login, show a one-line "password cleared from the extension" state in the popup. No password value.

## Regressions checked
- S6 encryption, reveal RPC, and BIS RLS are not in this diff. `portal_password` columns and the compatibility trigger are still present (drop waits until about 2026-10-15).
- Anon grants, settings policies, and archive/delete RPCs were not rewritten.
- Show archived still means "include archived with active rows". Off still hides archived rows. That matches the old page filter.

## Tester must check
1. Do not paste any password into chat or the testing report. Do not change a real client. Do not import the Clients CSV from this page until finding 1 is fixed.
2. Confirm the deployed frontend commit is `6da1adb` before UI tests. Reload the extension in Chrome yourself. Safari source is updated; the Xcode wrapper was not rebuilt.
3. Masters → Clients: network call is `search_clients`, not a full-table loop. Footer total is about 17,902. Search hits. A nonsense string shows an empty page and total 0. Page 2 is a new request. Show archived off hides archived rows.
4. On the list, payment term will read `100 % Advance` for every row (finding 1). Open Edit on one client and confirm the form payment term and remark are the saved values, not the list default. Cancel without saving.
5. Widths 360, 390, 768, and 1280: search and pager usable, not clipped. Cards or a horizontal table. Note that Archive / Import / Export are still under 40px (finding 4).
6. Reloaded extension, Manak Assist on a `ZZ TEST` licence: the address has `userId` and no `passwd=`. The password field is filled. The captcha box waits for typing. It must not fill itself from the image.
7. `npm run db:drift` exits 0 and prints no database URL.
8. Logged-out home and login still show. S6 Reveal still masks after 20 seconds.
