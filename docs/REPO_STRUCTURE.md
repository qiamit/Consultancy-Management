# Repository structure

Paths moved on 2026-10-08. `knowledge_engine` stays separate: it is a standalone package, called over HTTP only, never imported from the frontend or backend.

## Tree

```
Consultancy-Management/
├── frontend/web/                  # React + Vite app
├── frontend/extensions/           # QE Consultancy Chrome and Safari copies
├── backend/database/              # Railway Postgres SQL migrations (not Supabase.com)
├── backend/scripts/               # apply-migrations.mjs, refuse-hosted-cloud.cjs
├── backend/services/functions/    # Node functions (live QI Assistant, email, users)
├── backend/services/gateway/      # Caddy API gateway
├── backend/services/pdf-service/  # Playwright PDF renderer
├── backend/services/storage-minio/# Legacy MinIO Dockerfile
└── knowledge_engine/              # Local BIS search API (standalone)
```

## Folder purpose

| Folder | Purpose |
|---|---|
| `frontend/web` | Consultancy Pro UI. Railway frontend service should build this folder. |
| `frontend/extensions` | Unpacked Chrome extension and the Safari source. Not a Railway service. |
| `backend/database` | SQL migrations for the self-hosted Railway Postgres (GoTrue, PostgREST, storage-api). No Railway service builds from this folder. |
| `backend/scripts` | Migration apply script and the hosted-cloud refusal guard. |
| `backend/services/functions` | Production Node functions service. |
| `backend/services/gateway` | Production Caddy gateway (`api` service). |
| `backend/services/pdf-service` | PDF renderer sources. Production pdf-service on Railway currently builds from `qiamit/Qirlpl_Lims_Railway`, not this folder. |
| `backend/services/storage-minio` | Legacy MinIO Dockerfile. Not deployed. `storage-api` uses the `supabase/storage-api` image. |
| `knowledge_engine` | Local read-only BIS search. Stays at the repo root. |

## Old path → new path

| Old | New |
|---|---|
| `frontend/` (the Vite app) | `frontend/web/` |
| `frontend/src` | `frontend/web/src` |
| `extensions/` | `frontend/extensions/` |
| `railway-stack/functions/` | `backend/services/functions/` |
| `railway-stack/gateway/` | `backend/services/gateway/` |
| `pdf-service/` | `backend/services/pdf-service/` |
| `storage-service/` | `backend/services/storage-minio/` |
| `scripts/apply-migrations.mjs` | `backend/scripts/apply-migrations.mjs` |
| `scripts/dump-schema.mjs` | `backend/scripts/dump-schema.mjs` |
| `scripts/gen-db-types.mjs` | `backend/scripts/gen-db-types.mjs` |
| `backend/supabase/migrations` | `backend/database/migrations` |
| `backend/supabase/schema` | `backend/database/schema` |
| `backend/supabase/` (other than `functions`, which was deleted) | `backend/database/` |

If a prompt still uses an old path, map it with this table. `backend/supabase/` maps to `backend/database/`, except the deleted Deno tree below.

## Removed on 2026-10-08

| Removed | Why | Recover |
|---|---|---|
| `backend/supabase/functions/**` | Deno sources. Never deployed. Live handlers are `backend/services/functions`. | `git show 4e28cc0:backend/supabase/functions/<path>` |
| `backend/supabase/.gitignore` | Only covered the Deno tree. | `git show 4e28cc0:backend/supabase/.gitignore` |
| `.vscode/settings.json` | Deno settings for the deleted functions. | `git show 4e28cc0:.vscode/settings.json` |

Example for the old QI Assistant Deno file:

```
git show 4e28cc0:backend/supabase/functions/qi-assistant/index.ts
```

That file had NOTEBOOK MODE and LIMS CRUD tools that are not in `backend/services/functions/qiAssistant.mjs`.

## Railway service → folder

None of these services builds from `backend/database`. After `chore/folder-restructure` is merged, Railway root directories must be updated (the old deployment keeps serving until then):

| Service | Folder in this repo |
|---|---|
| `frontend` | `frontend/web` |
| `functions` | `backend/services/functions` |
| `api` | `backend/services/gateway` |
| `pdf-service` | Not this repo's folder today (builds from `qiamit/Qirlpl_Lims_Railway`). Sources here are `backend/services/pdf-service`. |
| `storage-api` | Image `supabase/storage-api`, not `backend/services/storage-minio`. |
| `auth`, `rest`, `Postgres-MC1Y`, `Resend`, `Consultancy` | No app folder in this repo. |

## knowledge_engine

`knowledge_engine` stays at the repo root. Do not move it into `frontend/` or `backend/`. Other apps call `http://127.0.0.1:3851`. The contract is `knowledge_engine/API.md`.
