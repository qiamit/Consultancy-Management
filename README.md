# Consultancy Pro

Monorepo for **Consultancy Pro** by Q Engineering. Same technology stack as [Qirlpl_Lims_Railway](https://github.com/qiamit/Qirlpl_Lims_Railway):

- React + TypeScript + Vite frontend (stone/amber LIMS theme)
- API gateway (Caddy) → GoTrue Auth / PostgREST / Storage / Functions, on one Oracle Cloud server (`deploy/oracle`)
- Postgres 17 + files on the server's disk + Playwright PDF
- Resend for outbound email (`@qengineering.in`)

**Repository:** [https://github.com/qiamit/Consultancy-Management](https://github.com/qiamit/Consultancy-Management)

## Project Structure

```
Consultancy-Management/
├── frontend/web/             # React + TypeScript + Vite
├── frontend/extensions/      # QE Consultancy Chrome and Safari extension
├── backend/database/         # Postgres SQL migrations
├── backend/services/gateway/ # Caddy API gateway (Railway era; the server uses deploy/oracle/Caddyfile)
├── backend/services/functions/ # Node functions (users, email/Resend, QI Assistant)
├── backend/services/pdf-service/ # PDF renderer
├── backend/services/storage-minio/ # Legacy MinIO image helper
├── deploy/oracle/            # The live server: compose, Caddy, deploy / preview / backup scripts
└── knowledge_engine/         # BIS PDF knowledge search (local, standalone)
```

## How we work

All work happens in Claude cloud sessions and on GitHub; there is one database, the live one on the Oracle
server. `main` is the live app (https://qengineering.in), `testing` is the preview (https://preview.qengineering.in,
same database). Rules and steps: [docs/workflow.md](docs/workflow.md). Server: [deploy/oracle/README.md](deploy/oracle/README.md).

`backend/local-dev/` (a throwaway local backend in Docker) still exists for code experiments, but it is not part
of the release process.

## Notes

- Never commit `.env` files.
- Do not connect hosted Supabase Cloud or Vercel.
- Schema changes: add SQL under `backend/database/migrations/`. It is applied by the release of `main` (docs/workflow.md, rule 1), never by hand.
- Domain modules (BIS applications, renewals, etc.) are scaffolded; masters + finance quotation reuse the LIMS UI chrome.
- BIS knowledge indexing (`knowledge_engine/`): configure paths in `knowledge_engine/.env` (from `.env.example`). Keep PDF sources and the vector index outside the repo; do not install or run bulk indexing until configured. Call the search API over HTTP. Contract: `knowledge_engine/API.md`.
