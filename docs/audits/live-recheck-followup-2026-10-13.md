# Live recheck follow-up — 2026-10-13

Source evidence: `docs/agents/reports/testing/LIVE_RECHECK_2026-10-13.md`. This document records code review and local verification; it is not a claim that authenticated live acceptance has passed.

## Recheck findings

| Item | Code review result | Update / remaining evidence |
|---|---|---|
| AUD-08 Form 1 seal | Implemented locally | Added a client-specific checkbox and private image upload. Form 1 includes the client image only when enabled; otherwise it keeps the box blank for a physical stamp. New F23 schema migration required. Validate on live client records after migration and deploy. |
| AUD-13 Help | Updated locally | Replaced LIMS/testing-laboratory help topics with consultancy, BIS, finance, documents, QE Assistant and settings topics. |
| AUD-14 Default AI model | Updated locally | Resolve configured model id, then DB default, then active model; include the selected configured model even if inactive. |
| AUD-19 document subtitle | Updated locally | Remove a trailing em dash when CM/L is empty. |
| Client list ~27s | Existing code already uses `search_clients` with page limit/offset | This report did not establish a production cause or measure RPC/query time. Do not replace pagination again; capture authenticated request timing and DB plan first. |
| Responsive | Updated/reviewed locally | Save footer is sticky; licence action column moves to the wider breakpoint; Company Settings tabs already use horizontal scrolling. Viewport interaction still needs browser acceptance. |
| Currency option blank | Updated locally | Preserve the currently selected currency as an option even if it is absent from loaded choices. |
| Client cleanup | Not authorized/executed | The stated 618 count and 17,902 count do not resolve to a verified source-of-truth set. No backup was established and no client rows were deleted. |

## Finance requests (scope confirmed by Amit)

| ID | Code state | Notes |
|---|---|---|
| FIN-01 | SQL response hardened locally | Existing ledger RPC selected `company_name`; the new RPC explicitly aliases party names in both debtor and creditor CTEs. An authenticated reproduction is still needed to confirm the live symptom is resolved. |
| FIN-02 | Migration/UI implementation prepared locally | Adds multiple bank-account records, independent Cash and per-bank ledger tabs, entry drill-down, links to receipt/payment edit forms, transaction change audit, and a separate TDS receivable ledger. Requires the new F22 migration before the UI can persist bank metadata. |
| FIN-03 | Partly existed; extended locally | Receipt edit action and part-amount form already exist. Added bank-account assignment, custom TDS rate/section/taxable base, and net/TDS calculation. TDS amount is separated from net cash/bank movement while invoice balance reduces by gross settlement. |
| FIN-04 | Open | Current finance schema cannot yet substantiate complete GSTR-1 upload payload or full GSTR-3B/9/9C reconciliation schedules. GSTN directs users to the latest Returns Offline Tool/API schema; the recheck implementation does not contain that schema or complete source data. No guessed payload is labelled upload-ready. A complete export needs the current official schemas and tax/accounting source fields. |
| FIN-05 | Draft export implemented locally | Adds date-filtered PAN, party, section, taxable base and TDS amount view with CSV and XLSX exports. This remains a review report, not a filed return. |

## Verification

- Frontend `npm run build`: passed; existing CSS/minifier, mixed-import and large-chunk warnings remain.
- Frontend `npm run typecheck`: repository still has unrelated baseline errors; the new ledger PromiseLike error was corrected. Settings type mismatches in the touched currency settings file were also corrected; re-run before commit.
- Full `npm run lint` has pre-existing repository violations. Targeted lint reports pre-existing effects/unused import issues in the touched BIS and quotation components; re-run after fixes before commit.
- F22 (finance) and F23 (client Form 1 seal) migrations are additive and are prepared for the production rollout requested by Amit. They have not yet been applied. Authenticated live behavior, RLS, generated ledgers, exports, seal printing, and audit rows remain unverified until migration and deployment complete.
- No client/company records were deleted or edited.
