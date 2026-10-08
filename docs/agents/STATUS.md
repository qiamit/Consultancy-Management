# STATUS: handoff board

Every agent updates **Current** and adds one **Log** row when its turn ends. Times are IST (`date '+%Y-%m-%d %H:%M %Z'`).
Stages: `PLANNING` → `PLAN_READY` (Amit approves) → `APPROVED` → `CODING` → `AUDIT` → `TESTING` → `REVIEW` → `DONE` (or `STOPPED` / `BLOCKED`).

## Current
| Field | Value |
|---|---|
| Session | S6 |
| Stage | AUDIT |
| Owner | QE Auditor |
| Repo HEAD | S6 commit on `main` (short hash written after push) |
| Plan | `docs/agents/plans/S6_plan.md` |
| Coder prompt | `docs/agents/plans/S6_coder_prompt.md` (also `docs/prompts/S6_prompt.txt`, untracked) |
| Next action | QE Auditor reads `docs/agents/reports/coding/S6_coding.md` and audits the S6 commit on `main`. |
| Updated | 2026-10-08 20:37 IST |

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
| 2026-10-08 18:27 | S5 | Grok Bot | DONE (backend) | `ff2b9f7` live on Railway. Rollback suite 43/43, S4 checks 36/36. UI checks run by Grok Bot. |
| 2026-10-08 19:45 | S6 | Grok Bot | PLANNING | 4-agent workflow files added (`.cursor/rules/05-qe-standards.mdc`, `qe-*.mdc`, `docs/agents/`). |
| 2026-10-08 20:08 | S6 | Grok Bot | PLAN_READY | Plan + coder prompt written. Migration rollback-tested 81/82 (1 test-query bug) on LIVE 19:54–19:58 IST — caused app lock timeouts; rule added to 05-qe-standards/qe-tester: no migration tests on live. No Railway variable needed. S6b split noted. |
| 2026-10-08 20:15 | S6 | QE Planner | APPROVED | Amit approved S6 as written (S6/S6b split included). Owner is QE Coder. |
| 2026-10-08 20:37 | S6 | QE Coder | AUDIT | Migration `20261008200000_s6_portal_secrets_bis_rls.sql` applied (OK). Verify 122 / 352 / build pass. Commit hash filled after push. |
| 2026-10-08 20:21 | S6 | QE Planner | CODING | Amit asked for the S6b list in Hindi. Scope recorded as decisions.md #7. S6 stage and owner unchanged (QE Coder). |
| 2026-10-08 20:32 | S6 | QE Planner | CODING | Amit asked to update the rules. Language rule #8: English, then Hindi; no Hinglish. S6b scope is in `05-qe-standards.mdc`. S6 stage and owner unchanged. |
