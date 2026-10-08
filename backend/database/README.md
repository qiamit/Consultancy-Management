# backend/database

This folder is the schema for the self-hosted Railway Postgres used by GoTrue, PostgREST and storage-api. It is not Supabase.com.

Add a new migration only as `migrations/YYYYMMDDHHMMSS_name.sql`. Do not edit a file that has already been applied.

Apply pending files with `npm run db:migrate` from the repo root. `SKIP_FILES` lives in `backend/scripts/apply-migrations.mjs`. That script skips LIMS-only migrations that must not run on this database.
