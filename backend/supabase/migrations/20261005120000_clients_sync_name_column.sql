-- Legacy LIMS/consultancy DBs have clients.name (NOT NULL) in addition to company_name.
-- Keep both in sync so inserts that only set company_name no longer fail with 23502.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS name text;

UPDATE public.clients
SET name = COALESCE(NULLIF(trim(name), ''), NULLIF(trim(company_name), ''), 'Unknown')
WHERE name IS NULL OR trim(name) = '';

ALTER TABLE public.clients
  ALTER COLUMN name SET DEFAULT '';

DO $$
BEGIN
  ALTER TABLE public.clients ALTER COLUMN name SET NOT NULL;
EXCEPTION
  WHEN others THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.clients_sync_name_from_company_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.company_name IS NOT NULL AND trim(NEW.company_name) <> '' THEN
    IF NEW.name IS NULL OR trim(NEW.name) = '' OR NEW.name IS DISTINCT FROM NEW.company_name THEN
      -- Prefer company_name as source of truth when name was omitted or stale.
      IF TG_OP = 'INSERT' AND (NEW.name IS NULL OR trim(COALESCE(NEW.name, '')) = '') THEN
        NEW.name := NEW.company_name;
      ELSIF TG_OP = 'UPDATE' AND NEW.company_name IS DISTINCT FROM OLD.company_name THEN
        NEW.name := NEW.company_name;
      ELSIF NEW.name IS NULL OR trim(NEW.name) = '' THEN
        NEW.name := NEW.company_name;
      END IF;
    END IF;
  ELSIF (NEW.name IS NULL OR trim(NEW.name) = '') AND NEW.company_name IS NOT NULL THEN
    NEW.name := NEW.company_name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_sync_name ON public.clients;
CREATE TRIGGER trg_clients_sync_name
  BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE PROCEDURE public.clients_sync_name_from_company_name();
