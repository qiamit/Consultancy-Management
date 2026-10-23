# Responsive matrix checklist — 2026-10-23 (APP-R03)

Static code + layout review at widths **360 / 390 / 768 / 1280**. Live signed-in visual Pass is deferred to go-live (no ZZ TEST browser run in this pass).

| Module | 360 | 390 | 768 | 1280 | Notes |
|--------|-----|-----|-----|------|-------|
| Masters — Clients | Code OK | Code OK | Code OK | Code OK | Cards `<lg`, dialog CSS vars (APP-R02) |
| Masters — IS Codes | Code OK | Code OK | Code OK | Code OK | Cards pattern present |
| Masters — Products/Services | Code OK | Code OK | Code OK | Code OK | Table scroll + toolbar |
| Finance — Quotation list | Code OK | Code OK | Code OK | Code OK | Cards `<lg` |
| BIS — Projects list | Code OK | Code OK | Code OK | Code OK | Horizontal scroll viewport |
| BIS — Renewals | Code OK | Code OK | Code OK | Code OK | Cards `<lg` added APP-R04 |
| BIS — Surveillance | Code OK | Code OK | Code OK | Code OK | Cards `<lg` added APP-R04 |
| Settings — User Management | Code OK | Code OK | Code OK | Code OK | Cards `<lg` (reference) |
| Settings — Lab Settings tabs | Code OK | Code OK | Code OK | Code OK | Toolbar scroll helper |
| Knowledge Search | Code OK | Code OK | Code OK | Code OK | Stacked form; unavailable banner on prod |

**Sign-off (code):** 2026-10-23 — APP-R03 closed for code readiness.  
**Live visual:** Blocked until after deploy; any regression → new AUD/APP-R item.
