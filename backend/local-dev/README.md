# backend/local-dev

A full Consultancy Pro backend on your machine, wired the same way as Railway:

```
browser ─► Vite :5173 ─► gateway (Caddy) :54321 ─┬─► auth      (GoTrue)
                │                                ├─► rest      (PostgREST)
                │                                ├─► storage   (storage-api, files on a volume)
                │                                └─► functions (backend/services/functions)
                └─► /api/pdf ─► pdf-service :3847          all ─► db (Postgres) :54322
```

Nothing here talks to Railway. Data lives in Docker volumes and is thrown away by `npm run local:reset`.

## Requirements

- Docker with Compose v2
- Node 20+
- `npm install` at the repo root, in `frontend/web` and in `backend` (the cloud SessionStart hook does this)

## Start

```bash
npm run local:up     # generate secrets, start containers, migrate, create admin
npm run dev          # web app on http://localhost:5173
PDF_AUTH_DISABLED=1 npm run pdf:dev   # optional: PDF export (needs `npm run pdf:install` once; local only)
```

Sign in as **admin@consultancy.local** / **Admin@12345**. Override them with `LOCAL_ADMIN_EMAIL` and `LOCAL_ADMIN_PASSWORD` before the first `local:up`.

Other commands: `npm run local:down` (stop, keep data), `npm run local:reset` (wipe and rebuild), `npm run local:logs`.

## Files

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | db, auth, rest, storage, functions and gateway containers. The gateway reuses `backend/services/gateway/Caddyfile`. |
| `gen-env.mjs` | Writes `.env` here (passwords, JWT secret, anon/service keys) and `frontend/web/.env.development.local`, so `npm run dev` targets this stack. Delete that second file to point `npm run dev` back at Railway. |
| `bootstrap.mjs` | Applies `db/legacy_schema.sql` and `db/legacy_functions.sql`, runs `backend/scripts/apply-migrations.mjs`, then creates the admin login. Safe to re-run. |
| `db/legacy_schema.sql` | Tables that Railway Postgres already had from the earlier app and that no applied migration creates. Rebuilt from `backend/database/schema/public-columns.json`; keys, defaults and foreign keys are inferred. |
| `db/legacy_functions.sql` | Helpers and the `bis-sample-failure-files` bucket that Railway already had. |
| `db/roles.sql` | Gives the Supabase service roles the local Postgres password. |

`db/` is local-only. Never apply it to Railway. Real schema changes still go in `backend/database/migrations/`.

## Notes

- Email (`send-email`) needs `RESEND_API_KEY` in `.env`; it is empty by default.
- The QI Assistant needs an AI model and key configured in Settings → AI.
- BIS knowledge search is a separate service (`knowledge_engine/`) and is not part of this stack.
