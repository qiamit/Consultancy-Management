# QE Excel sync — IS Code, Client, All BIS Licenses — 2026-10-10

Local lists checked at `http://localhost:5173`. The Excel files were the source. Add and update ran first. Extra rows were removed after that. No commit, no full migrate, no deploy.

ZZ TEST rows (`ZZ TEST SYNC`, `IS 99001` / 2099, licence title `ZZ TEST SYNC`) were inserted and deleted in the same signed-in session. None remain.

## AUD-01 — IS Code Master matches the Excel list

- **Priority:** —
- **Status:** Pass
- **Where:** IS Code Master, `public.is_codes`.
- **Evidence:** Excel had 1433 rows. All 1433 matched an existing code and were updated. None were inserted. The directory shows Page 1/144, which is 1437 codes at 10 per page. A signed-in insert of `IS 99001` / 2099 / `ZZ TEST SYNC` succeeded and the same session deleted it. Count left for that number is 0.

## AUD-02 — Four IS codes stay because other modules still use them

- **Priority:** P2
- **Status:** Open
- **Where:** `is_codes` rows whose `updated_at` was not touched by this sync.
- **Evidence:** 4 codes are not in the Excel file. They are still referenced by 5 BIS projects, 29 test-parameter rows, and 13 file rows. Delete was refused by those foreign keys. A direct delete of `storage.objects` returned `42501` (storage tables must be changed through the Storage API). The 65 PDF file rows are still present.
- **Fix plan:** Only if Amit says these four codes should go: move the 29 test parameters and 5 projects onto an Excel code, then delete the codes and their files through the Storage API.
- **Acceptance:** `is_codes` count equals the Excel row count, and Test Parameter plus the five projects still open.

## AUD-03 — Client Master matches the Excel list, with 20 firms kept

- **Priority:** P2
- **Status:** Open
- **Where:** Client Master, `public.clients`.
- **Evidence:** Excel had 598 company names. 119 already existed and were updated; 479 were inserted. A later pass updated all 598. Passwords were stored encrypted for 590 firms; the values were not written to this report. Extra contacts and factory addresses were replaced from the sheet. 1262 clients that were not in the sheet were deleted. 618 remain. The directory shows Page 1/62 (618 at 10 per page). The 20 that could not be deleted are still referenced: 10 by a kept BIS project (`ON DELETE RESTRICT`), 9 by a laboratory row, 1 by `quotations`, and 1 by `finance_quotations`. A signed-in insert of `ZZ TEST SYNC` succeeded and was deleted. No `ZZ TEST` client remains.
- **Fix plan:** Leave the 20. They are the firms behind a kept application, a laboratory, or a finance document. Deleting them would drop that link.
- **Acceptance:** After those links are moved or closed, Client Master count equals 598.

## AUD-04 — QE licences replaced the old licence list

- **Priority:** —
- **Status:** Pass
- **Where:** All BIS Licenses, `public.bis_projects` kind `Licence`.
- **Evidence:** Excel had 1027 licences, every CM/L 10 digits. All 1027 were written onto existing rows first. 4306 old licence rows were deleted only after that write. The list now has 1027 licences. All BIS Licenses shows Page 1/60, which is 1199 projects at 20 per page (1027 licences plus the applications below). A signed-in insert of a `ZZ TEST SYNC` licence succeeded and was deleted.

## AUD-05 — Applications already in progress were not overwritten

- **Priority:** —
- **Status:** Pass
- **Where:** `bis_projects` kinds `Application` and `application`.
- **Evidence:** Excel had 142 applications. They were inserted with the sheet’s status mapped onto the allowed stages (`Under Preparation`, `Test Request Done`, `Report Uploaded`, `Application Submitted`, `Inspection Done`). The original sheet label was stored in notes. A second pass saw those notes and did not update the rows. Older applications that already had a stage, notes, a branch, an officer, or module files were kept and not edited. Four applications with stage `Under Preparation` and no notes, number, branch, or officer were removed with the old licence delete. Final project count is 1199: 1027 licences, 144 `Application`, 28 `application`.

## AUD-06 — Three inclusion rows became licences

- **Priority:** P3
- **Status:** Open
- **Where:** `audit_log` updates on `bis_projects` during the licence write.
- **Evidence:** Three rows whose kind was `Inclusion` were updated to `Licence` because their CM/L was on the QE licence sheet. The same row id was kept, so files on that id stayed. The inclusion list is now empty. This was not a delete.
- **Fix plan:** Only if those three should still be inclusions as well as licences: add the inclusion again from the row that is now a licence. Do not delete the licence.
- **Acceptance:** Amit confirms the three CM/L rows should stay licences, or the inclusion is created again beside the licence.

## AUD-07 — Signed-in create and delete still work

- **Priority:** —
- **Status:** Pass
- **Where:** Client Master, IS Code Master, All BIS Licenses, signed-in session.
- **Evidence:** `clients` insert and delete of `ZZ TEST SYNC` returned success. `is_codes` insert required `unit_of_is`; with `Tonne` it inserted and deleted. `bis_projects` insert and delete of `ZZ TEST SYNC` returned success. Follow-up counts for those three markers were 0.
