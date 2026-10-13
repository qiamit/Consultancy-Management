# Live recheck follow-up — 2026-10-13

Source evidence: `docs/agents/reports/testing/LIVE_RECHECK_2026-10-13.md`. This document records code review and local verification; it is not a claim that authenticated live acceptance has passed.

## Recheck findings

| Item | Code review result | Update / remaining evidence |
|---|---|---|
| AUD-08 Form 1 seal | Deployed; record-level acceptance pending | Added a client-specific checkbox and private image upload. Form 1 includes the client image only when enabled; otherwise it keeps the box blank for a physical stamp. F23 applied to production; frontend deployed in `83a76fd6-8507-4fba-bd19-62581de4a053`. Live domain responds HTTP 200. A signed-in print of a client with an uploaded image still needs acceptance. |
| AUD-13 Help | Deployed | Replaced LIMS/testing-laboratory help topics with consultancy, BIS, finance, documents, QE Assistant and settings topics. |
| AUD-14 Default AI model | Deployed | Resolve configured model id, then DB default, then active model; include the selected configured model even if inactive. Signed-in dropdown acceptance pending. |
| AUD-19 document subtitle | Deployed | Remove a trailing em dash when CM/L is empty. |
| Client list ~27s | Existing code already uses `search_clients` with page limit/offset | This report did not establish a production cause or measure RPC/query time. Do not replace pagination again; capture authenticated request timing and DB plan first. |
| Responsive | Updated/reviewed locally | Save footer is sticky; licence action column moves to the wider breakpoint; Company Settings tabs already use horizontal scrolling. Viewport interaction still needs browser acceptance. |
| Currency option blank | Updated locally | Preserve the currently selected currency as an option even if it is absent from loaded choices. |
| Client cleanup | Not authorized/executed | The stated 618 count and 17,902 count do not resolve to a verified source-of-truth set. No backup was established and no client rows were deleted. |

## Finance requests (scope confirmed by Amit)

| ID | Code state | Notes |
|---|---|---|
| FIN-01 | Deployed; authenticated acceptance pending | Existing ledger RPC selected `company_name`; the new RPC explicitly aliases party names in both debtor and creditor CTEs. |
| FIN-02 | Deployed; authenticated acceptance pending | F22 applied to production. Adds multiple bank-account records, independent Cash and per-bank ledger tabs, entry drill-down, links to receipt/payment edit forms, transaction change audit, and a separate TDS receivable ledger. |
| FIN-03 | Deployed; authenticated acceptance pending | Receipt edit action and part-amount form already existed. Added bank-account assignment, custom TDS rate/section/taxable base, and net/TDS calculation. TDS amount is separated from net cash/bank movement while invoice balance reduces by gross settlement. |
| FIN-04 | Open | Current finance schema cannot yet substantiate complete GSTR-1 upload payload or full GSTR-3B/9/9C reconciliation schedules. GSTN directs users to the latest Returns Offline Tool/API schema; the recheck implementation does not contain that schema or complete source data. No guessed payload is labelled upload-ready. A complete export needs the current official schemas and tax/accounting source fields. |
| FIN-05 | Draft export deployed; authenticated acceptance pending | Adds date-filtered PAN, party, section, taxable base and TDS amount view with CSV and XLSX exports. This remains a review report, not a filed return. |

## Verification

- Frontend `npm run build`: passed locally and in Railway; existing CSS/minifier, mixed-import and large-chunk warnings remain.
- Frontend `npm run typecheck`: repository still has unrelated baseline errors; the new ledger PromiseLike error was corrected. Settings type mismatches in the touched currency settings file were also corrected; re-run before commit.
- Full `npm run lint` has pre-existing repository violations. Targeted lint reports pre-existing effects/unused import issues in the touched BIS and quotation components; re-run after fixes before commit.
- F22 (finance) and F23 (client Form 1 seal) migrations were applied successfully to production on 2026-10-13. Commit `3a022af33d8db1e70e5f1f6ddd3aa5739280d34b` is deployed as frontend deployment `83a76fd6-8507-4fba-bd19-62581de4a053` (SUCCESS). `https://www.qengineering.in/bis/projects` returned HTTP 200. Railway reports all 9 services online, with zero current warnings or recent failures. Authenticated finance behavior, RLS, generated ledgers, exports, seal printing, and audit rows still need signed-in acceptance.
- A separate PDF-service Railway patch remains staged with `AUTH_URL` and `AUTH_ANON_KEY`; this remediation did not accept or deploy that unrelated environment patch. PDF service is currently online and has no Railway warning or recent failure.
- No client/company records were deleted or edited.
