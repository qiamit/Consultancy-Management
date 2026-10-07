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
├── frontend/                 # React + TypeScript + Vite
├── backend/supabase/         # SQL migrations + function source
├── railway-stack/gateway/    # Caddy API gateway
├── railway-stack/functions/  # Node functions (users, email/Resend)
├── pdf-service/              # PDF renderer
├── storage-service/          # MinIO image helper
└── knowledge_engine/         # BIS PDF knowledge indexing (local RAG scaffold)
```

## Local Setup

1. `npm install --prefix frontend`
2. Copy `frontend/.env.example` to `frontend/.env`
3. Set Railway API values:

   - `VITE_SUPABASE_URL` = Railway API gateway URL
   - `VITE_SUPABASE_ANON_KEY` = Railway anon JWT
   - `VITE_PDF_SERVICE_URL` = Railway PDF service `/pdf`

4. `npm run dev`

## Notes

- Never commit `.env` files.
- Do not connect hosted Supabase Cloud or Vercel.
- Schema changes: add SQL under `backend/supabase/migrations/` and apply on Railway Postgres.
- Domain modules (BIS applications, renewals, etc.) are scaffolded; masters + finance quotation reuse the LIMS UI chrome.
- BIS knowledge indexing (`knowledge_engine/`): configure paths in `knowledge_engine/.env` (from `.env.example`). Keep PDF sources and the vector index outside the repo; do not install or run bulk indexing until configured.
