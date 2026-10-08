<ID>: <title>
==========================================================

Repo: /Users/amitkumar/Documents/Softwares/Consultancy Management   (branch main, HEAD must be <short-hash>)
Approved by Amit on <date>. Plan: docs/agents/plans/<ID>_plan.md

WHY (facts, with file:line or live evidence)
- ...

WHAT <ID> DOES
- Part A: migration backend/database/migrations/<YYYYMMDDHHMMSS>_<name>.sql (content below, VERBATIM)
- Part B: ...

HOUSE RULES
- Do NOT edit any applied migration. Copy the SQL below byte-for-byte.
- Do NOT open/print .env, .railway-secrets.env or any secret. No Railway changes.
- NEVER `git add` docs/prompts/, .env*, .railway-secrets.env, any *backup*.json. No `git add -A` / `git add .`.
- Minimal, focused changes; no new dependencies (a frontend dep would go in frontend/web/package.json); no refactors outside this list.
- Standing design rules: AI/MCP-ready (logic in RPC/endpoint + api-catalog row), responsive (360/390/768/1280), futuristic items only if listed here.

=====================================================================
PART A: create this file EXACTLY: backend/database/migrations/<...>.sql
=====================================================================
<SQL>

=====================================================================
PART B..: code changes (file → exact change)
=====================================================================

=====================================================================
ORDER + STOP RULES (follow exactly)
=====================================================================
1. VERIFY (after all parts are written, before anything touches the DB):
     npm run typecheck   → must not exceed baseline <N> errors (no NEW errors in touched files)
     npm run lint        → must not exceed baseline <N> problems (no NEW problems in touched files)
     npm run build       → must succeed
     npm run functions:check   (only if backend/services/functions changed)
   If anything gets worse, fix it. If you cannot, STOP: do not migrate, do not commit, REPORT.
2. npm run db:migrate
   - ONLY <migration file> may be applied. If any other file is attempted, or this file fails:
     STOP. Do not commit. REPORT the full error output.
3. Write docs/agents/reports/coding/<ID>_coding.md; update BASELINES.md / api-catalog.md if needed.
4. git add ONLY these paths (whichever you actually changed):
     <path 1>
     <path 2>
     docs/agents
   Run `git status --short`, `git diff --cached --stat` and the secret scan from qe-coder.mdc.
   docs/prompts/ must stay untracked.
5. git commit -m "<ID>: <message>"
6. git push origin main
7. REPORT (below), set STATUS.md to AUDIT, and print the NEXT line.

=====================================================================
REPORT (paste back)
=====================================================================
- typecheck / lint / build numbers vs baseline
- db:migrate output (files applied; NOTICE lines)
- commit hash, push result
- changed files, 1 line each
- deviations / anything skipped and why

=====================================================================
POST-DEPLOY CHECKS (for QE Tester)
=====================================================================
1. ...
