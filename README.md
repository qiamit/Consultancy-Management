# Consultancy Pro (Railway)

Monorepo for **Consultancy Pro** by Q Engineering. Same technology stack as [Qirlpl_Lims_Railway](https://github.com/qiamit/Qirlpl_Lims_Railway):

- React + TypeScript + Vite frontend (stone/amber LIMS theme)
- Railway API gateway (Caddy) → GoTrue Auth / PostgREST / Storage / Functions
- Railway Postgres + object storage + Playwright PDF
- Resend for outbound email (`@qengineering.in`)

**Repository:** [https://github.com/qiamit/Consultancy-Management](https://github.com/qiamit/Consultancy-Management)

## Project Structure

```
Consultancy-Management/
├── frontend/web/             # React + TypeScript + Vite
├── frontend/extensions/      # QE Consultancy Chrome and Safari extension
├── backend/database/         # Railway Postgres SQL migrations
├── backend/services/gateway/ # Caddy API gateway
├── backend/services/functions/ # Node functions (users, email/Resend, QI Assistant)
├── backend/services/pdf-service/ # PDF renderer
├── backend/services/storage-minio/ # Legacy MinIO image helper
└── knowledge_engine/         # BIS PDF knowledge search (local, standalone)
```

## Local Setup

1. `npm install --prefix frontend/web`
2. Copy `frontend/web/.env.example` to `frontend/web/.env`
3. Set Railway API values:

   - `VITE_SUPABASE_URL` = Railway API gateway URL
   - `VITE_SUPABASE_ANON_KEY` = Railway anon JWT
   - `VITE_PDF_SERVICE_URL` = Railway PDF service `/pdf`

4. `npm run dev`
5. Local knowledge search (optional): `npm run knowledge:api`

## Notes

- Never commit `.env` files.
- Do not connect hosted Supabase Cloud or Vercel.
- Schema changes: add SQL under `backend/database/migrations/` and apply with `npm run db:migrate` on Railway Postgres.
- Domain modules (BIS applications, renewals, etc.) are scaffolded; masters + finance quotation reuse the LIMS UI chrome.
- BIS knowledge indexing (`knowledge_engine/`): configure paths in `knowledge_engine/.env` (from `.env.example`). Keep PDF sources and the vector index outside the repo; do not install or run bulk indexing until configured. Call the search API over HTTP. Contract: `knowledge_engine/API.md`.
