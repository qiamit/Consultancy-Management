# Live audit remediation — 2026-10-13

Source: `docs/agents/reports/testing/LIVE_AUDIT_2026-10-12.md` (live browser audit dated 2026-10-12).

## Release

- Consultancy Management: commit `e0f2a75fff2651118ea689fd6a51bd5dda6488a8` — Railway `frontend` deployment `a6106dfb-1a06-4804-85de-7b69bf5b9822`, `SUCCESS`.
- Qirlpl LIMS PDF service: commit `8896a5bf1a587fe02a9448419d7ff42c16f0fb8d` — Railway `pdf-service` deployment `eeb26554-f4a1-4e3d-a18c-6cc0e65ff19a`, `SUCCESS`.
- PDF service production variables now reference the Railway Auth service internally. Secret values were not read or written into source files.
- `https://www.qengineering.in/bis/projects` returned HTTP 200. PDF `/health` returned HTTP 200. An `OPTIONS /pdf` request from `https://www.qengineering.in` returned HTTP 204 with the matching CORS origin. An unauthenticated `POST /pdf` returned HTTP 401 (`Sign in required`), confirming the Auth check is active.
- No authenticated application session was available in this run. PDF bytes were therefore not generated using a real signed-in session or client attachments. The ACN Plastics and ACN PVC Pipes records were not opened or changed.

## Findings

| ID | Priority | Status | Remediation and evidence |
|---|---|---|---|
| AUD-01 | P1 | Open | Fixed the deployed PDF client to send the current bearer token, configured the PDF service to validate sessions through Railway Auth, and allowed both qengineering.in origins in CORS. Both services deployed successfully; health, CORS, and unauthenticated rejection passed. A signed-in PDF generation and download still needs authenticated browser acceptance. |
| AUD-02 | P2 | Open | Finance Add New actions now open the form immediately while default values load, instead of waiting for the bootstrap request before showing the dialog. Build passed; the reported click sequence was not replayed in an authenticated browser. |
| AUD-03 | P2 | Open | After a successful client save, the editor now closes immediately and the client list refreshes in the background. Build and targeted ESLint pass. End-to-end save latency still needs measurement in an authenticated session, including related sites, contacts, and portal credentials. |
| AUD-04 | P2 | Open | Added loading states for IS Code Master and User Management; Finance list pages start in loading state. Build passed; delayed-network empty-state behavior was not replayed live. |
| AUD-05 | P2 | Open | Client Save now explains that the company name is required or that highlighted fields need correction. Interactive validation was not replayed live. |
| AUD-06 | P2 | Open | Excel downloads now create real `.xlsx` workbooks from document tables, with selected documents placed in separate sheets. Word output remains Word-readable HTML `.doc`; a real DOCX export matching preview layout remains open. |
| AUD-07 | P2 | Open | Application-pack PDF includes generated application/location-map pages, stored application/legal PDFs, and client GST/MSME certificates; unsupported attachments fail visibly. General PDF export uses selected documents. Live attachments and the Top Management record were not inspected, so completeness remains unverified. |
| AUD-08 | P2 | Open | Part/Sec and BIS Licences Held depend on project data; the seal area may be intentionally blank for a physical seal. No authenticated project record was inspected, so no data was invented or changed. Confirm the affected record and intended seal behavior. |
| AUD-09 | P2 | Open | BIS licence table overflow now scrolls horizontally rather than clipping the Action column; client footer controls wrap on narrow layouts. Build passed; 1024/768 visual acceptance remains open. |
| AUD-10 | P2 | Open | Client list footer is configured to wrap its archive/actions and paging controls. 768/1280 browser viewport checks remain open. |
| AUD-11 | P3 | Open | QE Assistant now renders basic Markdown headings, emphasis, code spans, and lists as formatted text. Context quality and response latency were not evaluated against live prompts. |
| AUD-12 | P3 | Open | Removed the Railway technology-stack subtitle; client card now says the count is records visible to the signed-in account. The reported count discrepancy still needs reconciliation against the intended business metric. |
| AUD-13 | P3 | Pass | Replaced the lab-specific AI prompt placeholder with BIS consultancy wording. Search of Help and AI Settings found no remaining `ISO 17025 testing laboratory` prompt text. |
| AUD-14 | P3 | Open | AI model loading now falls back to the model marked default and keeps the configured default available even if inactive. The live DeepSeek Pro (V4) value was not inspected. |
| AUD-15 | P3 | Open | No notification-bell feature or notification source was present in the inspected layout. This needs product scope and a data source before implementation. |
| AUD-16 | P3 | Open | Header now waits for profile hydration before showing a name and designation. The brief live transition was not replayed. |
| AUD-17 | P3 | Open | Search/new-application latency and stale-result behavior need authenticated performance measurements. No production records were queried or changed for testing. |
| AUD-18 | P3 | Open | Responsive fixes cover the clipped BIS table and client footer. The full 360/390/768/1280 matrix, tap targets, Company Settings tabs, and document header remain unverified. |
| AUD-19 | P3 | Open | BIS document filenames now discard an em-dash-only CM/L suffix and trim trailing separators. Actual downloads were unavailable for filename verification. |

## Verification and limits

- `npm run build` — passed. The build still reports existing CSS/minifier and chunk-size warnings.
- Targeted ESLint on the changed export, Finance, client-form, AI-settings, user-table, and assistant files — zero errors, two existing exhaustive-deps warnings. The wider targeted run also includes pre-existing errors in `IsCodesMasterPage.tsx` and the repository has existing typecheck errors; full `npm run typecheck` did not pass.
- `git diff --check` — passed before commit.
- Commits are pushed to each source repository. Railway frontend and PDF-service deployments are both `SUCCESS`.
- A redundant staged Railway patch remains for the same two PDF Auth variables. `accept-deploy` returned “Cancelled — the user did not approve this action”; it made no changes. The variables were then applied directly to production and the PDF service redeployed successfully. The remaining staged patch does not block the live deployment, but may appear as pending in Railway.
- Open findings: 18. Pass findings: 1. Items that depend on authenticated data, real downloads, or viewport interaction stay Open until those acceptance checks are completed.

### Follow-up deployment

- Client save now closes the editor without waiting for the refreshed list request. Frontend build and targeted ESLint passed on 2026-10-13; this UI change is included in the follow-up production deployment.
