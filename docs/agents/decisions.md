# Decisions log (Amit)

This is the source of truth for business rules. QE Planner appends new decisions (newest at the bottom of each section) and never deletes old ones. A superseded decision gets marked `SUPERSEDED by #n`.
Format: `#n | date | decision | source`

## Process and workflow
- #1 | 2026-10-08 | Work order: Masters S6–S10 → Finance F1+ → BIS Operations (B0+) → Dashboard last. | Amit, chat (t41u)
- #2 | 2026-10-08 | The vector DB overnight job is deferred (start "kal ya parso"). Main app work comes first. | Amit, chat (t41u)
- #3 | 2026-10-08 | Standing design rules for every session from S6: (1) AI/MCP-ready, so any AI or bot can run each module via API/MCP under the user's own login and permissions (an app MCP server is planned); (2) fully responsive and cross-platform (Apple/Windows/Android, all browsers) with mobile checks; (3) proactively add futuristic improvements. | Amit, chat (t40u)
- #4 | 2026-10-08 | 4-agent Cursor workflow: QE Planner, QE Coder, QE Auditor, QE Tester. Handoff through `docs/agents/` and `NEXT:` lines; the Planner explains in Hindi. Language wording SUPERSEDED by #8. | Amit, chat (t47u)
- #5 | 2026-10-08 | The Coder runs verify → `npm run db:migrate` → explicit `git add` → commit → push to `main`. If a migration fails: no commit, report the error. | Amit, standing
- #6 | 2026-10-08 | Test data is prefixed `ZZ TEST` and deleted after tests. Real users and clients are never modified. Passwords are never shared in chat. | Amit, standing
- #7 | 2026-10-08 | After S6 closes, the next session is **S6b** (not S7). S6b contains only these five items. (1) Browser-extension hardening, Chrome and Safari copies together: limit `externally_connectable` / matches to `https://www.qengineering.in` and localhost; stop building `passwd=` URLs in `background.js` and `content.js` and fill the login form instead; stop `rememberPortal()` from storing passwords; remove the OCR captcha helper; stop re-broadcasting results on `*.railway.app` pages; `bridge.js` checks `event.origin`. (2) Client Directory server-side search and paging through `clientsApi.searchClients`, so the page no longer loads all ~17,900 clients at once. (3) Schema tooling: dump-schema, gen-types, and drift-check (`npm run db:drift`) comparing the live database with the repo. (4) Drop deprecated `bis_projects.portal_password` and `bis_new_applications.portal_password`, plus the compatibility trigger, only after S6 has been live for a week and the old frontend is gone. (5) Optional: move the encryption key out of the database into a functions-service variable `PORTAL_CREDENTIAL_KEY`; Amit sets that Railway variable himself. Email-account passwords and OAuth tokens are a separate later item. The 19 finance/quotation tables with open write policies are F1. | Amit, chat (QE Planner)
- #8 | 2026-10-08 | Agent replies to Amit are complete English, then complete Hindi. Do not write Hinglish (Hindi grammar and English verbs in one clause). Code, UI, commits and SQL stay in English. The in-app assistant may still follow an end user's own wording. Supersedes the language wording in #4. SUPERSEDED by #9. | Amit, chat (QE Planner)
- #9 | 2026-10-08 | Planning observations and replies to Amit are Hinglish, in one note. Do not require a separate English copy and a separate Hindi copy. Code, UI, commits and SQL stay in English. Supersedes #8. | Amit, chat (QE Planner)
- #10 | 2026-10-08 | Amit asked whether S6b, S7, S8, S9 and S10 can be coded in one run, then audited once and tested once, with the next plan written from those observations. Allowed only after one plan names every item and Amit approves it. S7–S10 have no scope yet, so they are not approved to code. S6b column drop still waits until S6 has been live for a week. | Amit, chat (QE Planner)
- #11 | 2026-10-08 | Amit approved S6b. This run is extension hardening, Client Directory paging, and schema drift tools. Column drop and the encryption-key move are not in this run. S7–S10 are not in this run. | Amit, chat (QE Planner)

## Masters and settings
- #10 | 2026-10-08 | MST-84 (client scale default) is excluded permanently. | Amit
- #11 | 2026-10-08 | MST-07 (Manak portal passwords) was excluded earlier; **encrypting client Manak passwords is now approved for S6** (supersedes the MST-07 exclusion for encryption). | Amit, chat (t43 answer)
- #12 | 2026-10-08 | The in-app AI assistant is named **"QE Assistant"** (renamed from QI Assistant in S5). Its data-editing ability comes later (the toggle is disabled for now). | Amit, chat
- #13 | 2026-10-08 | Archived masters stay visible in pickers until S6. S6 hides them from pickers. | S5 plan

## Finance (F1+)
- #20 | 2026-10-08 | Keep GimBooks for now. Build a direct GimBooks import (parties, opening balances, invoices) for when we switch. | Amit, chat (t37u)
- #21 | 2026-10-08 | Default invoice number prefix `QE/26-27/SL/0001`, editable per document type in Company Settings; warn when longer than 16 characters (GST invoice number limit). | Amit, chat (t37u)
- #22 | 2026-10-08 | Vendors stay in the Client list, flagged **Buyer / Vendor / Both**. No separate vendor master. | Amit, chat (t37u)
- #23 | 2026-10-08 | GST only when the invoice is issued. No GST on advances. | Amit, chat (t37u)
- #24 | 2026-10-08 | TDS rate is chosen per receipt (clients deduct 10% or 2%). | Amit, chat (t37u)
- #25 | 2026-10-08 | SAC 998393 at 18% (998311 is also 18%). Amit is to confirm the code with his CA. | Amit, chat (t37u)
- #26 | 2026-10-08 | Turnover has never crossed ₹5 Cr, so e-Invoice is a later phase. | Amit, chat (t37u)

## BIS Operations (after Finance)
- #30 | 2026-10-08 | Goal: near-zero manual work on Manak Online. Amit only types the captcha; the extension does the rest (new licence, inclusion, renewal, sample-failure reply, stop-marking reply, suspension reply, ROM visit preparation, test request, QR) from a button in the app, and sends the payment screenshot to the client. | Amit, chat (t42u)
- #31 | 2026-10-08 | "All BIS Licences" module: add licences from all of India over time, filter the ones QE manages, and drive all QE work (renewal, inclusion, sample failure, standard revision) from them. Each licence links to the client master and the IS code master. | Amit, chat (t42u)
- #32 | 2026-10-08 | A dummy Manak Online account and firm are to be provided by Amit for exploration (no fake-person registration). | Grok Bot, pending Amit
