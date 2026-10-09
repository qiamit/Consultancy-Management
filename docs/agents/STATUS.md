# STATUS

Decision #17 (2026-10-09): one chat plans and codes. Do not hand work to a Planner, Coder, Auditor, or Tester chat.

## Current
| Field | Value |
|---|---|
| Session | F10 |
| Stage | CODED |
| Owner | This chat |
| Repo HEAD | `0bd4e35` (S7–S10 live). F1–F7 and F10 migrations are not applied. F8 and F9 have no migration. |
| Plan | `docs/agents/plans/F10_plan.md` |
| Coder prompt | Retired. |
| Next action | Commit F1–F10, then migrate and push. F11 purchase bill starts in this chat after that. |
| Updated | 2026-10-09 12:15 IST |

### S6 known scope (from Amit, 2026-10-08; to be confirmed in the plan)
- Encrypt client Manak passwords (approved; reverses the MST-07 exclusion). Never return them to list views or the browser by default.
- Server-side client list (search/paging in the DB instead of loading 17.9k rows).
- Hide archived records from pickers (BIS / Quotation / quick-add). Deferred from S5.
- Audit history view (who changed what) on masters, from `public.audit_log`.
- BIS permissions hardening (module-level RLS for BIS tables, as done for masters in S4).
- Standing design rules (AI/MCP-ready, responsive with mobile checks, futuristic ideas).

### S6b (decision #7, starts only after S6 closes)
- Browser-extension hardening (Chrome and Safari copies together).
- Client Directory server-side search and paging.
- Live-schema dump, generated types, and drift check.
- Drop deprecated `portal_password` columns and the compatibility trigger after S6 has been live for a week.
- Optional: move the encryption key to functions variable `PORTAL_CREDENTIAL_KEY` (Amit sets the Railway variable).

## Log
| When (IST) | Session | Agent | Stage → | Note |
|---|---|---|---|---|
| 2026-10-09 12:10 | F10 | This chat | CODED | Finance books roadmap written from the GimBooks menu. No new code. F11 waits. No migrate, no commit. |
| 2026-10-09 12:00 | F10 | This chat | CODED | Tax invoice form lists the receipts and credit notes that name it. Migration file only. No migrate, no commit. |
| 2026-10-09 11:50 | F9 | This chat | CODED | Receipt list shows the named invoice and the net after TDS. No migration. No commit. |
| 2026-10-09 11:35 | F8 | This chat | CODED | Buttons, labels, and table headings use proper text. No migration. No commit. |
| 2026-10-09 11:20 | F7 | This chat | CODED | Over 90 payment reminder, only after confirm. Migration file only. No migrate, no commit. |
| 2026-10-09 09:50 | F6 | This chat | CODED | Tax invoice ageing buckets filter the list. Migration file only. No migrate, no commit. |
| 2026-10-09 09:40 | F5 | This chat | CODED | Open tax invoices grouped by age: 0–30, 31–60, 61–90, Over 90. Migration file only. No migrate, no commit. |
| 2026-10-09 09:30 | F4 | This chat | CODED | Tax invoice list shows outstanding and Paid, Part, or Unpaid. Migration file only. No migrate, no commit. |
| 2026-10-09 09:20 | F3 | This chat | CODED | Invoice outstanding from linked receipts and credit notes. Migration file only. No migrate, no commit. |
| 2026-10-09 09:10 | F2 | This chat | CODED | Place of supply on tax invoice and credit note. Migration file only. No migrate, no commit. |
| 2026-10-09 09:00 | F1 | This chat | CODED | Document series, invoice GST, receipt TDS. Migration file only. No migrate, no commit. |
| 2026-10-09 07:57 | S7 | This chat | CODED | Client Master v2 coded. Migration file only. Verify 122 / 352 / build pass. No migrate, no commit. Report: `docs/agents/reports/coding/S7_coding.md`. |
| 2026-10-09 06:08 | S7 | This chat | PAUSED | Decision #17. Four role files removed. S7 code not started. No commit. |
| 2026-10-09 05:55 | S7 | QE Planner | APPROVED | Start check 3 unblocked (decision #16). Four rule files stay uncommitted and must not be edited. Product scope unchanged. Owner is QE Coder. |
| 2026-10-09 05:47 | S7 | QE Coder | STOPPED | Start check 3 failed. Four dirty rule files (`.cursorrules`, `05-qe-standards.mdc`, `qe-coder.mdc`, `qe-planner.mdc`). No code, no migration, no commit. Report: `docs/agents/reports/coding/S7_coding.md`. |
| 2026-10-09 05:37 | S6b | QE Tester | REVIEW | Frontend `6da1adb` live. Verdict PASS WITH ISSUES. Report: `docs/agents/reports/testing/S6b_testing.md`. |
| 2026-10-09 05:15 | S6b | QE Coder | AUDIT | `6da1adb` pushed to `main` (`e5dd94a..6da1adb`). No migration. Verify 122 / 352 / build pass. Dump 939 columns, 71 tables. Drift exit 0. |
| 2026-10-09 05:24 | S6b | QE Auditor | TESTING | `6da1adb` PASS WITH ISSUES. No BLOCKER. Baselines 122 / 352 / build pass. Report: `docs/agents/reports/audit/S6b_audit.md`. |
| 2026-10-08 18:27 | S5 | Grok Bot | DONE (backend) | `ff2b9f7` live on Railway. Rollback suite 43/43, S4 checks 36/36. UI checks run by Grok Bot. |
| 2026-10-08 19:45 | S6 | Grok Bot | PLANNING | 4-agent workflow files added (`.cursor/rules/05-qe-standards.mdc`, `qe-*.mdc`, `docs/agents/`). |
| 2026-10-08 20:59 | S6 | QE Tester | TESTING | Frontend `e5dd94a` is live. Read-only and rollback DB checks passed. UI waiting for Amit to sign in on the Cursor browser. |
| 2026-10-08 21:20 | S6 | QE Tester | REVIEW | UI tested as Amit Kumar (Admin). Verdict PASS WITH ISSUES. Report: `docs/agents/reports/testing/S6_testing.md`. |
| 2026-10-08 21:35 | S6 | QE Planner | DONE | Merged coding, audit, and testing. No blocker. S6b stays the five items in decision #7. Viewer-plus-director and renewal search stay out of S6b. |
| 2026-10-08 21:40 | S6 | QE Planner | DONE | Amit asked to code S6b–S10 in one run, then one audit and one test. Refused until one plan names S7–S10. Language is Hinglish again (decision #9, supersedes #8). |
| 2026-10-08 21:45 | S6b | QE Planner | APPROVED | Amit approved S6b. Plan and coder prompt written. Column drop and key move excluded. Owner is QE Coder. |
| 2026-10-08 21:48 | S6b | QE Coder | STOPPED | No code written. Eight dirty rule files blocked the start check. |
| 2026-10-09 05:03 | S6b | QE Planner | APPROVED | Rule files added to the S6b git add list. Coder may start again. Product scope unchanged. |
| 2026-10-08 21:48 | S6b | QE Coder | STOPPED | Start check 3 failed. Eight uncommitted rule files (`.cursorrules`, `.cursor/rules/*`). No code, no dump, no commit. Report: `docs/agents/reports/coding/S6b_coding.md`. |
| 2026-10-08 20:08 | S6 | Grok Bot | PLAN_READY | Plan + coder prompt written. Migration rollback-tested 81/82 (1 test-query bug) on LIVE 19:54–19:58 IST — caused app lock timeouts; rule added to 05-qe-standards/qe-tester: no migration tests on live. No Railway variable needed. S6b split noted. |
| 2026-10-08 20:15 | S6 | QE Planner | APPROVED | Amit approved S6 as written (S6/S6b split included). Owner is QE Coder. |
| 2026-10-08 20:37 | S6 | QE Coder | AUDIT | `e5dd94a` pushed to `main`. Migration applied OK. Verify 122 / 352 / build pass. Hash lines updated after push (next commit). |
| 2026-10-08 20:21 | S6 | QE Planner | CODING | Amit asked for the S6b list in Hindi. Scope recorded as decisions.md #7. S6 stage and owner unchanged (QE Coder). |
| 2026-10-08 20:32 | S6 | QE Planner | CODING | Amit asked to update the rules. Language rule #8: English, then Hindi; no Hinglish. S6b scope is in `05-qe-standards.mdc`. S6 stage and owner unchanged. |
| 2026-10-08 20:46 | S6 | QE Auditor | TESTING | `e5dd94a` PASS WITH ISSUES. No BLOCKER. Baselines 122 / 352 / build pass. Report: `docs/agents/reports/audit/S6_audit.md`. |
| 2026-10-09 05:30 | S7 | QE Planner | PLAN_READY | Decision #12: Planner+Coder until Amit says commit; then one audit and one test per module. S7 Client Master v2 plan is ready. S6b testing paused. |
| 2026-10-09 05:40 | S7 | QE Planner | PLAN_READY | Amit added client-level GST, MSME, and other certificates (decision #14). BIS Legal module stays until a later plan. |
| 2026-10-09 05:39 | S7 | QE Planner | APPROVED | Amit approved S7 including client certificates. Coder must not migrate or commit. S6b testing PASS WITH ISSUES is parked for the Masters final plan. |
| 2026-10-09 05:42 | S7 | QE Planner | APPROVED | S6b testing issues are now inside S7 (decision #15). Prompt revised. Owner stays QE Coder. No commit. |
