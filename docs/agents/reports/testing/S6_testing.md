# S6 testing report

- Date/time (IST): 2026-10-08 21:20 IST
- Deployed commit verified: `e5dd94a` (frontend SUCCESS at 2026-10-08 20:38 IST). `functions` is still `ff2b9f7` and `api` is still `4f3a10d`; both were SUCCESS and were not part of this commit.
- Logins used (names only, never passwords): Amit Kumar (Admin)
- Verdict: PASS WITH ISSUES

## Acceptance criteria
| # | Criterion | Role | Result | Evidence (URL / steps / query + row count) |
|---|---|---|---|---|
| 1 | Reveal / Copy, then hide after 20s; access log `reveal` | Admin | PARTIAL | `/bis/projects` edit of a `ZZ TEST` license. Field showed `Saved (encrypted)`, badge `encrypted`. Change, Clear, Reveal and Copy were visible. Reveal was not clicked: reading the value was blocked. Clear then Update left placeholder `Not set` and no Reveal button. Access log before delete: `set` 1, `clear` 1. Plaintext null, flag false. |
| 2 | Editor has no Reveal; Manak URL has no `passwd=` | Admin (editor UI not signed in) | PARTIAL | SQL rollback: staff reveal refused (`42501`); staff extension login matched and was rolled back. Browser: Manak Assist opened `https://www.manakonline.in/MANAK/eBISLogin?userId=zztest-s6` with no `passwd=`. Toast: extension is not loaded in this browser, so auto-login was not completed. |
| 3 | BIS list has no password values; flag only | Admin | PASS | List columns are client, IS code, CM/L, validity, billing, action. Two `bis_projects` request URLs, zero `passwd=` URLs. DB: plaintext not null = 0, flag true = 257, vault rows = 257, mismatch = 0. |
| 4 | Change / clear a `ZZ TEST` password; reopen shows Saved or Not set | Admin | PASS | Set on create, reopen showed Saved. Clear + Update, reopen placeholder `Not set`. |
| 5 | BIS View, then None; Viewer is view-only; self-demote refused | SQL, not a second login | PARTIAL | Rollback as a non-director staff user: viewer is not admin and BIS level is `view`; set refused (`42501`). Setting every BIS module key to `none` as `authenticated` returned 0 BIS rows and login RPC `42501`. Self-demote refused (`42501`). No live user was changed. A Viewer who is still a Laboratory Director stays admin (finding 1). Nobody live is in that state (staff with a director title = 0). |
| 6 | Users role Viewer / Staff; self-demote | Admin | PARTIAL | `/settings/users` Role column shows Admin and Staff. Live roles: admin 2, staff 3, viewer 0. Viewer and self-demote were not clicked on a real user. SQL self-demote refused. |
| 7 | History only for admin, and only for one selected row | Admin | PASS | Clients: History disabled with no selection; one `ZZ TEST` row opened “Change history” with ADDED, Amit Kumar, 08-Oct-2026 21:08 IST, no password text. IS Codes, Products & Services, and Test Parameters each show History disabled until a row is selected. Staff history RPC refused in SQL (`42501`). |
| 8 | Archived `ZZ TEST` client is not offered; an existing document still shows the name | Admin | PASS | Before archive, BIS and Quotation pickers offered `ZZ TEST CLIENT S6`. After archive, both pickers offered only Add New Client. The existing BIS license still showed that client name and was still found by search. |
| 9 | Renewals search by an archived client name | Admin | NOT RUN | `/bis/license-renewals` says “No renewal applications yet.” There was no renewal to search. Audit finding 3 stays open for the planner. |
| 10 | Widths 360, 390, 768, 1280 | Admin | PASS | BIS license dialog fit all four widths (no page overflow, no clipped dialog buttons). Password row buttons are 40px. Users table at 360px scrolls inside its wrapper; the page does not overflow; ROLE stays available by scrolling. |
| 11 | Read-only SQL counts | DB | PASS | See DB checks. `bis_new_applications` has 0 rows and 0 plaintext, so finding 2 removed nothing. |

## Responsive (Cursor browser = Chromium)
| Screen | 360×640 | 390×844 | 768×1024 | 1280×800 | Notes |
|---|---|---|---|---|---|
| BIS license dialog | fits, width 336 | fits, width 366 | fits, width 744 | fits, width 819 | Password actions 40px. Other form controls (type, billing) are 32px. |
| Users | table scrolls, page does not overflow | not rechecked | not rechecked | Role column visible | |
| Login (logged out, earlier) | no page overflow | not rechecked | not rechecked | sign-in card fits | Sign In button height 32px. Eye control is smaller. |
| History dialog | not rechecked at 360 | | | width 672 at 1116px | Opened for the ZZ TEST client. |

Checklist for Amit (Safari / iPhone / Android / Firefox):
- [ ] BIS license password row at 360px: Change, Clear, Reveal, Copy stay on screen and are easy to tap.
- [ ] History dialog on a phone: cards instead of a clipped table.
- [ ] Users Role column can be reached by sideways scroll.
- [ ] Quotation client search on a phone does not clip the dropdown.

## Regressions
| Check | Result |
|---|---|
| Logged-out /home + login show logo | Home shows the Q Engineering wordmark plus BIS and NABL logos. A separate company logo image was not in the header. Login page is the sign-in card; it has no company logo image. |
| anon REST denied | `GET /rest/v1/clients` with no key returned 401. Anon cannot use schema `private`. Anon execute of the new get RPC returned `42501`. The only application RPCs anon can execute are `get_public_company_brand` and `get_public_website_content` (citext/regexp operators in `public` also show as executable). |
| Archive/restore + permanent delete (S5) | `ZZ TEST CLIENT S6` archived (left the active list, appeared under Show archived with Restore), restored (left the archived list), then deleted permanently. The ZZ TEST license Delete removed that row. |
| QE Assistant opens | Opened on Quotation. Panel text offered the Quotation screen. No message was sent. |

## DB checks (`docs/agents/tests/S6_*.sql`)
| Script | Mode (read-only / rollback) | Result |
|---|---|---|
| `S6_checks.sql` | read-only | clients 17902, is_codes 1427, test_parameters 164, bis_projects 29777, users 5, lab_settings 1. Migration applied 2026-10-08 20:36 IST. Plaintext 0. Flag true 257. Vault rows 257. Mismatch 0. Access log `migrate` 257. Audit secret-like keys 0. No BIS write policy is `USING/CHECK true`. |
| `S6_rls.sql` | rollback | 21 of 23 checks true. The two false rows used parent key `/bis`, which loses to the longer `/bis/projects` = edit rule. |
| `S6_rls_none.sql` | rollback | Session user `authenticated`. Level `none`. Visible BIS rows 0. |
| `S6_after.sql` | read-only | Roles unchanged (admin 2, staff 3, viewer 0). No ZZ TEST rows at that time. |
| `S6_zz.sql` | read-only | Test license: `set` 1, `clear` 1, plaintext null, flag false. |
| `S6_cleanup.sql` | read-only | After UI cleanup: ZZ TEST projects 0, quotations 0. Clients returned to 17902 after the client delete (confirmed by the final UI list; leftover client count was 1 archived immediately before delete). |

## Railway logs since deploy
Frontend since 2026-10-08 15:08:49Z: no `@level:error` lines and no HTTP status >= 500.

## Test data cleanup
- Created: client `ZZ TEST CLIENT S6`; BIS license for that client (portal user `zztest-s6`). Quotation dialog was opened and closed without a saved quotation.
- Deleted: BIS license via Delete. Client archived, restored, then Delete permanently.
- `ILIKE 'ZZ TEST%'` after project delete and before client delete: projects 0, quotations 0, archived clients 1. After permanent delete the client row was gone from the active list.
- Leftovers: none expected. Final client count was not re-queried after the last click; the active search no longer showed the ZZ TEST row.

## Issues for QE Planner
| # | Severity | Problem | Steps to reproduce |
|---|---|---|---|
| 1 | MEDIUM | A Viewer whose designation is still Laboratory Director is still an admin (`app_is_admin` true). No live user is in that state. | Rollback only: set a non-director staff user to role viewer and designation Laboratory Director, then call `app_is_admin()`. |
| 2 | LOW | The 20-second Reveal countdown and Copy were not exercised in the browser. The buttons are present and the saved value stays masked until Reveal. | Admin, open a license with a saved password, click Reveal, wait 20 seconds. Do not paste the value. |
| 3 | MEDIUM | Renewals search by an archived client name was not tested. There are 0 renewal applications. Audit finding 3 remains. | Create a renewal for a client, archive that client, search renewals by the name. |
| 4 | LOW | Manak auto-login could not finish. This browser has no QE Consultancy extension. The opened URL had `userId` and no `passwd=`. | Repeat Manak Assist in Chrome or Edge with the extension loaded. |
| 5 | LOW | Staff and Viewer screens were not clicked. Permission results above are from rolled-back SQL. | Sign in as a non-director staff user and confirm Reveal and History are absent. |
