-- Ensure clients.company_name has a unique index for upserts / duplicate guards.
-- Some environments lost idx_clients_company_name (causes PostgREST 42P10 on ON CONFLICT).

DO $$
BEGIN
  -- Deduplicate by keeping the oldest row per company_name (case-insensitive trim).
  WITH ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY lower(trim(company_name))
        ORDER BY created_at ASC NULLS LAST, id ASC
      ) AS rn
    FROM public.clients
    WHERE company_name IS NOT NULL AND trim(company_name) <> ''
  )
  DELETE FROM public.clients c
  USING ranked r
  WHERE c.id = r.id AND r.rn > 1;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_company_name
  ON public.clients USING btree (company_name);
