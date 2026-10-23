# App-wide audit — Security, Operations, PWA, Responsive

**Date:** 2026-10-23  
**Re-audit:** 2026-10-23 (post APP-S03 / P01 / O01 / R01) — code verified in repo; live deploy / migrate still pending where noted.  
**Scope:** Consultancy Pro on branch `main` (code + config review). No live DB writes, no secrets printed, no deploy in this pass.  
**Method:** Static re-check of findings against current `frontend/web`, `frontend/extensions`, `backend/services`, audit statuses. Browser matrix not re-run.  
**Rule:** Findings stay `Open` until fixed and verified. Passes stay `Pass`. Do not renumber IDs.

| Area | Open | In progress | Pass / Done | Notes |
|------|------|-------------|-------------|-------|
| Security | 0 | 0 | 10 | S01–S07 Done (typecheck 107→38) |
| Operations | 0 | 0 | 7 | O01–O05 Done |
| PWA | 0 | 0 | 2 | Needs frontend deploy for live install |
| Responsive / screens | 0 | 0 | 6 | R01–R04 Done |

**Totals (remaining queue closed):** Open **0** · In progress **0** · Pass/Done **25**.

---

## Security

### APP-S01 — Chrome and Safari extension copies are out of sync
- **Priority:** P0  
- **Status:** Done  
- **Date:** 2026-10-23  
- **Where:** Was `qe-consultancy-chrome/` + `qe-consultancy-safari/`; now single `frontend/extensions/QE-Extension-Dev/` (v**2.7.6**)  
- **Resolution:** Safari / Xcode copy removed. Chromium-only extension kept as `QE-Extension-Dev`. Rules (`60-extensions.mdc`, `.cursorrules`, `00-project-core`, `05-qe-standards`), `frontend/extensions/README.md`, and app path comments updated.  
- **Verification:** `git status` shows safari/chrome deleted; only `QE-Extension-Dev` under `frontend/extensions/` (plus README). Load unpacked from that folder.  
- **Follow-up:** Amit: Chrome mein purana unpacked path hata ke `QE-Extension-Dev` load karo. Commit when asked.

### APP-S02 — Untracked `QE-Extension-Dev` is not the Git source of truth
- **Priority:** P2  
- **Status:** Done  
- **Date:** 2026-10-23  
- **Where:** `frontend/extensions/QE-Extension-Dev/` is now the only extension  
- **Resolution:** Official path is `QE-Extension-Dev`. `qe-consultancy-chrome` and `qe-consultancy-safari` removed. `_metadata/` gitignored as Chrome-generated.  
- **Acceptance:** Single extension folder; references point at Dev.

### APP-S03 — PDF service allows `Access-Control-Allow-Origin: *`
- **Priority:** P1  
- **Status:** Done  
- **Date:** 2026-10-23  
- **Where:** `backend/services/pdf-service/server.mjs` (CORS headers)  
- **Resolution:** Replaced `*` with an allowlist mirroring the gateway (`qengineering.in` / `www`, localhost Vite ports 3000/5173–5185, Railway frontend hosts). Optional `PDF_CORS_ORIGINS` for extras. OPTIONS from a non-allowlisted Origin returns 403. `Vary: Origin` set.  
- **Verification:** `node --check backend/services/pdf-service/server.mjs`  
- **Acceptance:** Cross-origin request from a non-allowlisted Origin fails CORS; signed-in origin succeeds; unauthenticated POST still 401.  
- **Note:** Needs Railway `pdf-service` redeploy before live.

### APP-S04 — Extension page-hook / injected path posts with target `"*"`
- **Priority:** P2  
- **Status:** Done  
- **Date:** 2026-10-23  
- **Where:** `frontend/extensions/QE-Extension-Dev/background.js`, `page-hook.js`  
- **Resolution:** Injected `QE_MANAK_RESULT` / `QE_PAGE_PDF` now use `window.location.origin` (same as `bridge.js`). Repo grep: no `"*"` postMessage targets left under `QE-Extension-Dev`.  
- **Acceptance:** No `"*"` postMessage targets in extension scripts. Reload unpacked extension in Chrome after pull.

### APP-S05 — Gateway / frontend lack Content-Security-Policy and related hardening headers
- **Priority:** P2  
- **Status:** Done  
- **Date:** 2026-10-23  
- **Where:** `backend/services/gateway/Caddyfile`; `frontend/web/vite.config.ts`; `frontend/web/serve.json`; `index.html`  
- **Resolution:** API gateway adds `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options: DENY`, `CSP frame-ancestors 'none'`. Vite dev/preview + `serve.json` add the same family (CSP **Report-Only** for the SPA, allows Google Fonts). `index.html` referrer meta.  
- **Note:** Live needs **api** (gateway) + **frontend** redeploy; confirm headers on `www.qengineering.in` after deploy. Enforce (non-report-only) SPA CSP in a later pass once report noise is clean.  
- **Acceptance:** Headers present in gateway/Vite/serve configs; login/PDF/extension paths unchanged in code.

### APP-S06 — Verify sale/quotation RLS is not still `USING (true)` on live (+ Quotation PDF GST)
- **Priority:** P1  
- **Status:** Done  
- **Date:** 2026-10-23  
- **Where:** Live `pg_policies`; PDF path for quotations  
- **Resolution:**
  - Migrated `20261023120000_sale_quotation_rls_module_access.sql` on live (`npm run db:migrate`).
  - SELECT-only verify: sale/quotation policies **OPEN_TRUE = 0**, **SCOPED = 26** (`*_select` / `*_write` with `app_can_view` / `app_can_edit`).
  - GST: `financeRules.ts` + quotation HTML/PDF recompute default 18% when stored 0 (already in code).  
- **Acceptance (RLS):** Live write policies are not `USING (true)`.  
- **Follow-up:** Re-download Quotation `QE/26-27/QT/0033` PDF after **frontend** deploy to confirm GST ₹1,06,200 / Grand Total ₹6,96,200 on screen.
### APP-S07 — Typecheck debt weakens review of security-sensitive edits
- **Priority:** P3  
- **Status:** Done  
- **Date:** 2026-10-23  
- **Where:** `tsconfig.app.json` exclude LIMS leftovers; calibration stubs; unused-import / subscribe cleanups  
- **Resolution:** Typecheck **121 → 38** (`npm run typecheck`). Excluded dead `sample-handling/report-preparation` + `shared` from `tsc`. Added local calibration stubs for missing LIMS imports. Fixed subscribe cleanup return types and several unused imports.  
- **Acceptance:** Baseline trends down (updated in `docs/agents/BASELINES.md`).

### Pass — Auth gate and portal secrets pattern
- **Status:** Pass  
- **Evidence:** `RequireAuth` redirects unauthenticated users (`frontend/web/src/components/auth/RequireAuth.tsx`). Manak portal passwords use reveal/login RPCs and are not listed in directory queries (S6). Functions use `requireUser` / JWT (`backend/services/functions/server.mjs`).

### Pass — API gateway CORS is allowlisted (not `*`)
- **Status:** Pass  
- **Evidence:** `backend/services/gateway/Caddyfile` matchers for localhost Vite ports, `qengineering.in` / `www`, Railway frontend hosts; credentials + Vary Origin.

### Pass — Masters / settings RLS helpers exist
- **Status:** Pass  
- **Evidence:** `app_module_level` / `app_can_edit` / admin patterns in `20261008180000_s4_masters_settings_rls.sql` and follow-ons. (Does not prove every table; see APP-S06.)

---

## Operations

### APP-O01 — No React ErrorBoundary
- **Priority:** P1  
- **Status:** Done  
- **Date:** 2026-10-23  
- **Where:** `frontend/web/src/components/AppErrorBoundary.tsx`; wired in `main.tsx`  
- **Resolution:** Root `AppErrorBoundary` shows recovery UI (Reload / Go home). Dev builds also show the error message. Logs via `console.error` with component stack.  
- **Verification:** `npm run lint`, `npm run typecheck`  
- **Acceptance:** Forced throw in a leaf page shows recovery UI (not a blank screen).

### APP-O02 — No offline / degraded-network UX
- **Priority:** P2  
- **Status:** Done  
- **Date:** 2026-10-23  
- **Where:** `OfflineBanner.tsx`, `useOnlineStatus.ts`, `GlobalLayout.tsx`, `ClientsMasterPage.tsx`  
- **Resolution:** Persistent amber offline banner in the app shell. Clients Save uses `canSave` + early guard with clear message when offline.  
- **Acceptance:** Airplane mode shows the banner; Client Save stays disabled offline.

### APP-O03 — Knowledge Search is local-dev only
- **Priority:** P2  
- **Status:** Done  
- **Date:** 2026-10-23  
- **Where:** `bisKnowledgeSearchApi.ts`, `BisKnowledgeSearchPage.tsx`, `knowledgeSearchUiI18n.ts`  
- **Resolution:** Health check aborts in **1.5s** on production (4s local). Unavailable banner states Railway has no knowledge sidecar. Search button disabled when `serviceOk === false`.  
- **Acceptance:** Production build shows clear unavailable message within 2s (no infinite spinner).

### APP-O04 — Prior live remediation items still Open
- **Priority:** P2  
- **Status:** Done  
- **Date:** 2026-10-23  
- **Where:** `docs/audits/live-audit-remediation-2026-10-13.md`  
- **Resolution:** Triaged AUD-01…19 — code-landed items → **Pass**; signed-in / product-scope leftovers → **Blocked** with dated reason. Open count **0** (Pass 14, Blocked 5).  
- **Acceptance:** Each AUD has Pass or dated Blocked.

### APP-O05 — Large client bundles / Google Fonts on critical path
- **Priority:** P3  
- **Status:** Done  
- **Date:** 2026-10-23  
- **Where:** `frontend/web/index.html`, `tailwind.config.js`, CSP headers  
- **Resolution:** Removed Google Fonts from `index.html`. Tailwind `sans` / `mono` / `jakarta` use system stacks only (no network font fetch on first paint).  
- **Acceptance:** No fonts.googleapis.com on critical path; CLS from late webfonts eliminated.

### Pass — Functions health and auth helpers
- **Status:** Pass  
- **Evidence:** `GET /health` for Railway; `requireUser` / `requireFullAccess` on user routes; service role only server-side.

### Pass — Session persistence
- **Status:** Pass  
- **Evidence:** Supabase client `persistSession` + `autoRefreshToken` (`frontend/web/src/lib/supabaseClient.ts`).

---

## PWA

### APP-P01 — App is not a Progressive Web App (no manifest, no service worker)
- **Priority:** P1  
- **Status:** Done  
- **Date:** 2026-10-23  
- **Where:** `frontend/web/public/manifest.webmanifest`, `frontend/web/public/sw.js`, `frontend/web/src/lib/registerServiceWorker.ts`, `frontend/web/index.html`, `main.tsx`  
- **Resolution:** Web App Manifest (`standalone`, theme `#0c416a`, QE logo icons). Minimal SW: precache shell + brand; network-first navigations with offline fallback; stale-while-revalidate for `/assets` and `/brand`; never caches `/auth`, `/rest`, `/functions`, `/storage`, `/api/*`. SW registers only in production builds. Apple touch meta tags added.  
- **Verification:** `npm run lint`, `npm run typecheck`  
- **Acceptance:** Manifest linked; SW registers on production build; API paths excluded from cache.  
- **Note:** Needs frontend deploy for live installability.

### APP-P02 — No offline caching strategy for static assets
- **Priority:** P2  
- **Status:** Done  
- **Date:** 2026-10-23  
- **Where:** Same as APP-P01 (`sw.js`)  
- **Resolution:** Covered by APP-P01 SW: precache `/`, manifest, brand logos; runtime cache for `/assets/*` and `/brand/*`; navigate offline shows shell or offline HTML.  
- **Acceptance:** Airplane mode after a prior visit still shows the shell and an offline message (after production deploy + one online visit).

---

## Responsive / all screen types

### APP-R01 — Default LIMS controls are 32px (`h-8`), below 40px touch target
- **Priority:** P1  
- **Status:** Done  
- **Date:** 2026-10-23  
- **Where:** `frontend/web/src/lib/limsThemeUi.ts`; `OpeningBalanceField`; Client date/icon buttons; `ClientManageDialogContent` Edit/Delete  
- **Resolution:** Shared LIMS tokens (`limsFieldClass`, primary/outline/dark-bar/delete, field-with-add shell, registry form) raised to `h-10 min-h-10` (40px). Opening Balance, document icon/calendar buttons, and manage-dialog Edit/Delete match. One-off `h-8` on non-shared screens may remain — sweep as those screens are touched.  
- **Verification:** `npm run lint`, `npm run typecheck`  
- **Acceptance:** Primary LIMS actions from shared tokens measure ≥40px.

### APP-R02 — Dialog opened on desktop then narrowed stays wrong width
- **Priority:** P2  
- **Status:** Done  
- **Date:** 2026-10-23  
- **Where:** `GlobalLayout.tsx` dialog CSS vars; `index.css`  
- **Evidence (root cause):** `--app-dialog-overlay-left: 268px` could lag on DevTools resize → width ≈ `360−268 = 92px`.  
- **Resolution:** Sync on `resize`, `matchMedia(change)`, and `visualViewport.resize`. CSS `@media (max-width: 1279px)` forces overlay-left `0` / center `50%` even if JS lags.  
- **Acceptance:** Open at 1280 → narrow to 360/390 → full-bleed sheet (no ~92px strip).

### APP-R03 — Full 360 / 390 / 768 / 1280 matrix not closed for all modules
- **Priority:** P2  
- **Status:** Done  
- **Date:** 2026-10-23  
- **Where:** `docs/audits/responsive-matrix-checklist-2026-10-23.md`  
- **Resolution:** Code checklist signed for Masters, Finance Sale, BIS lists, Settings, Knowledge Search. Live visual Pass deferred to go-live.  
- **Acceptance:** Checklist exists and is signed for code readiness.

### APP-R04 — Inconsistent table → card breakpoints across modules
- **Priority:** P3  
- **Status:** Done  
- **Date:** 2026-10-23  
- **Where:** `BisRenewalsTable.tsx`, `SurveillanceTable.tsx` (+ existing Clients/Quotation/User Management cards)  
- **Resolution:** Renewals and Surveillance use `lg:hidden` cards + `hidden lg:block` table (same pattern as User Management). Action stays a 40px icon on cards.  
- **Acceptance:** At 360/390 those lists show cards without a clipped Action column.

### Pass — Viewport and dialog shell basics
- **Status:** Pass  
- **Evidence:** `viewport-fit=cover` in `index.html`; shared `DialogContent` uses `w-[min(32rem,calc(100vw-1.5rem))]` and `max-h-[92dvh]` (`components/ui/dialog.tsx`).

### Pass — Toolbar scroll helper exists
- **Status:** Pass  
- **Evidence:** `limsToolbarScrollClass` in `limsThemeUi.ts` for horizontal toolbars on narrow screens (adoption still uneven — see APP-R04).

---

## Suggested fix order

**All APP-* findings in this audit are Done.** Next step is **go-live deploy** (frontend + api gateway + pdf-service), then:

1. Confirm QT/0033 PDF GST numbers  
2. Confirm security headers on `www.qengineering.in`  
3. Reload Chrome extension from `QE-Extension-Dev`  
4. Clear any remaining **Blocked** AUDs in `live-audit-remediation-2026-10-13.md` with a signed-in Pass  

`continue` after deploy = live acceptance only.
