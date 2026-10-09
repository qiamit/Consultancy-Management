# S6b testing report

- Date/time (IST): 2026-10-09 05:37 · Deployed commit verified: `6da1adb` (frontend SUCCESS at 2026-10-08T23:45:24Z / 05:15 IST). functions `ff2b9f7` and api `4f3a10d` were not in this commit and stayed on their earlier SUCCESS deploys.
- Logins used (names only, never passwords): Amit Kumar (Admin). The Cursor browser was already signed in.
- Verdict: PASS WITH ISSUES

No migration in this commit. Column drop and the encryption-key move are out of scope until about 2026-10-15. `portal_password` still exists, every value is null, and 257 rows still have the saved flag.

## Acceptance criteria
| # | Criterion | Role | Result | Evidence (URL / steps / query + row count) |
|---|---|---|---|---|
| 1 | Clients opens through `search_clients`, footer about 17,902 | Admin | PASS | `https://www.qengineering.in/masters/clients`. Resource log: 2 `search_clients` calls, 0 `/rest/v1/clients` calls. Footer `Showing 1–10 of 17,902`. |
| 2 | Known search hits; nonsense is an empty page | Admin | PASS | Search `3M India` → `Showing 1–1 of 1`. Search `zz-s6b-no-such-client-qqq` → `Showing 0–0 of 0`, no edit buttons. |
| 3 | Page 2 is a new request. Archived ZZ TEST shows only with Show archived | Admin | PASS | Next page: footer `Showing 11–20 of 17,902`, `search_clients` count 5 → 6, still 0 full-table client calls. Created `ZZ TEST CLIENT S6B`, archived it: search with Show archived off was `0–0 of 0`; with it on, `1–1 of 1`. |
| 4 | Edit loads payment term and remark by id. List must not invent them | Admin | PASS WITH ISSUES | Saved term `30 Days` and remark `ZZ TEST remark s6b` (read back in SQL). List row showed `100 % Advance` and no remark. Edit form showed `30 Days` and the remark. Closed without saving. This is audit finding 1. CSV was not imported. |
| 5 | Widths 360, 390, 768, 1280 | Admin | PASS WITH ISSUES | No page overflow. Search and pager are 40px and stay on screen. Table is hidden below the desktop width (cards). At 1280 the table is 988px wide. Archive, Import, Export, and Delete stay 32px (audit finding 4). |
| 6 | Reloaded extension, Manak Assist, no `passwd=`, captcha waits | Admin | NOT RUN | This Cursor browser has no extension id. Password fill and captcha wait were not clicked. Chrome and Safari copies of `background.js`, `content.js`, `bridge.js`, and `captcha-assist.js` are identical. Both manifests are `2.2.33`. Neither copy contains `passwd=`. The web app source also has no `passwd=`. Safari Xcode wrapper was not rebuilt. |
| 7 | `npm run db:drift` exits 0 and prints no URL | — | PASS | Exit 0. Output was empty. No database URL. |

## Responsive (Cursor browser = Chromium)
| Screen | 360×800 | 390×800 | 768×900 | 1280×900 | Notes |
|---|---|---|---|---|---|
| Clients | PASS | PASS | PASS | PASS | Search height 40. Widths 128 / 157 / 350 / 529. Pager height 40 at 360, 768, and 1280, not clipped. Cards below desktop; table at 1280. |

Checklist for Amit (Safari / iPhone / Android / Firefox):
- [ ] Reload QE Consultancy 2.2.33 in Chrome. On a ZZ TEST licence, Manak Assist address has `userId` and no `passwd=`. The password field is filled by the extension. The captcha box waits; it must not fill itself.
- [ ] Safari source matches Chrome. The Xcode wrapper was not rebuilt in this commit, so a Safari install still needs that rebuild before a device check.
- [ ] Clients search and pager on a phone: not clipped, targets at least 40px.

## Regressions
| Check | Result |
|---|---|
| Logged-out /home + login show logo | PASS. `/home` HTTP 200, company logo plus BIS and two NABL logos. `/auth` HTTP 200 and the Sign In form shows. Anonymous `/rest/v1/clients` is 401. |
| anon REST denied | PASS. 401 with no key. |
| Archive + permanent delete (S5) | PASS for the ZZ TEST row. Archive hid it until Show archived. Permanent delete removed it. Neither click showed a confirmation dialog. |
| QE Assistant opens | PASS. Panel opened on Client Directory. No message was sent. |
| S6 password mask | PASS. An existing licence edit shows a bullet mask, the word encrypted, and Reveal / Copy / Change / Clear. Reveal was not clicked. Plaintext column count is 0. Saved-flag count is 257. |
| Baselines | PASS. clients 17902, is_codes 1427, test_parameters 164, bis_projects 29777. |

## DB checks (`docs/agents/tests/S6b_*.sql`)
| Script | Mode (read-only / rollback) | Result |
|---|---|---|
| `S6b_checks.sql` | read-only | Before and after UI: counts match the baselines. `zz_clients` 0 after cleanup. `plaintext_not_null` 0. `flag_true_n` 257. Access log table exists. |
| `S6b_zz.sql` | read-only | One row: payment term `30 Days`, remark `ZZ TEST remark s6b`, not archived. Run before the UI archive. |

## Railway logs since deploy
`railway logs --service frontend --since 2026-10-08T23:45:24Z` with `@level:error` and with HTTP status `>=500`: both empty.

## Test data cleanup
- Created: client `ZZ TEST CLIENT S6B` (payment term 30 Days, remark set, then archived).
- Deleted: permanent delete from the Clients page. `ILIKE 'ZZ TEST%'` count after cleanup: 0. clients count back to 17902.
- Leftovers: none.

## Issues for QE Planner
| # | Severity | Problem | Steps to reproduce |
|---|---|---|---|
| 1 | HIGH | List and the page CSV show `100 % Advance` and an empty remark for every directory row. The saved values are on the edit form. Audit finding 1, confirmed on screen. | Save a client with payment term 30 Days. The directory row says 100 % Advance. Edit shows 30 Days. Do not import that CSV. |
| 2 | LOW | Archive, Import, Export, and Delete are 32px. Search and the pager are 40px. Audit finding 4. | Open Clients and measure the footer buttons. |
| 3 | LOW | Live extension login was not run. Cursor's browser has no QE Consultancy extension, so password fill and the captcha wait were not seen. | Reload 2.2.33 in Chrome and repeat Manak Assist on a ZZ TEST licence. |
