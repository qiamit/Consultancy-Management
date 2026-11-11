-- Standards Library v2: a fresh index of the owner's "Oracle Database" folder, written on the server (and on Local
-- Host) by deploy/standards-library/indexer.py. Same tables as the old Mac index (standard_docs / standard_pages), so
-- the Conformity Check and Required Tests read it without a change.
--   source 'library': the new index. Folder = the IS number ("IS 2062"), category = the category folder name
--                     ("Product Specification", "Test Method", "Dimension & Tolerances", …).
--   source 'mac':     the old index (sync_app.py). Hidden (active = false) for every IS number the library has, so a
--                     number is never read twice; it still answers for numbers the library does not have yet.
-- The indexer recomputes `active` after each run (standard_library_refresh_active). Removing the old index for good:
--   DELETE FROM public.standard_docs WHERE source = 'mac';

ALTER TABLE public.standard_docs ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'mac';
ALTER TABLE public.standard_docs ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
-- The IS number a document belongs to ("IS 2062", "ISO 9001"): the library's folder; for the old index, the number
-- part of its folder ("IS 10000 Part 11" -> "IS 10000").
ALTER TABLE public.standard_docs ADD COLUMN IF NOT EXISTS base text;
ALTER TABLE public.standard_docs ADD COLUMN IF NOT EXISTS sha256 text;
ALTER TABLE public.standard_docs ADD COLUMN IF NOT EXISTS bytes bigint;
ALTER TABLE public.standard_docs ADD COLUMN IF NOT EXISTS edition_year integer;
-- "- 02" in "IS 1786 2008 - 02.pdf": amendments already merged into the file.
ALTER TABLE public.standard_docs ADD COLUMN IF NOT EXISTS amendments_merged integer;
ALTER TABLE public.standard_docs ADD COLUMN IF NOT EXISTS ocr_pages integer NOT NULL DEFAULT 0;
-- Why the file is on the review list ("Name not understood", "Almost no text", …); null when fine.
ALTER TABLE public.standard_docs ADD COLUMN IF NOT EXISTS review text;

ALTER TABLE public.standard_docs DROP CONSTRAINT IF EXISTS standard_docs_source_ck;
ALTER TABLE public.standard_docs ADD CONSTRAINT standard_docs_source_ck CHECK (source IN ('mac', 'library'));
-- Category = the library's category folder name (a new folder is accepted as is).
ALTER TABLE public.standard_docs DROP CONSTRAINT IF EXISTS standard_docs_category_ck;

UPDATE public.standard_docs
SET base = coalesce(substring(folder FROM '^(IS\s*[A-Z]{0,3}\s*\d+)'), folder)
WHERE base IS NULL;

-- Rows the old sync_app.py still adds get their number too.
CREATE OR REPLACE FUNCTION public.standard_docs_fill_base()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.base IS NULL THEN
    NEW.base := coalesce(substring(NEW.folder FROM '^(IS\s*[A-Z]{0,3}\s*\d+)'), NEW.folder);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS standard_docs_fill_base ON public.standard_docs;
CREATE TRIGGER standard_docs_fill_base BEFORE INSERT OR UPDATE OF folder ON public.standard_docs
  FOR EACH ROW EXECUTE FUNCTION public.standard_docs_fill_base();

CREATE INDEX IF NOT EXISTS standard_docs_base_idx ON public.standard_docs (base);
CREATE INDEX IF NOT EXISTS standard_docs_source_idx ON public.standard_docs (source);

-- Staff read only the active documents (customers never). search_standard_pages and standard_folders_for_is_code run
-- as the caller, so they see the same rows.
DROP POLICY IF EXISTS standard_docs_staff_read ON public.standard_docs;
CREATE POLICY standard_docs_staff_read ON public.standard_docs FOR SELECT TO authenticated
  USING (active AND NOT (SELECT public.app_is_customer()));

-- Old-index documents of an IS number that the library has: hidden. Called by the indexer after each run.
-- Two groups, each replaced on its own: Product Manuals, and everything else (Standard, Amendment, Old version,
-- Extra). An old Product Manual stays until the library has a Product Manual of that number.
CREATE OR REPLACE FUNCTION public.standard_library_refresh_active()
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH lib AS (
    SELECT DISTINCT base, (kind = 'Product Manual') AS pm FROM public.standard_docs WHERE source = 'library'
  ),
  want AS (
    SELECT d.id, NOT EXISTS (
      SELECT 1 FROM lib WHERE lib.base = d.base AND lib.pm = (d.kind = 'Product Manual')
    ) AS active
    FROM public.standard_docs d
    WHERE d.source = 'mac'
  ),
  upd AS (
    UPDATE public.standard_docs d SET active = w.active
    FROM want w
    WHERE d.id = w.id AND d.active IS DISTINCT FROM w.active
    RETURNING 1
  )
  SELECT count(*)::integer FROM upd;
$$;
REVOKE ALL ON FUNCTION public.standard_library_refresh_active() FROM PUBLIC, anon, authenticated;

-- One row per indexer run: what it found and did. Shown on the Standards Library page.
CREATE TABLE IF NOT EXISTS public.standard_index_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  -- 'Local Host' / 'Server'; 'manual' / 'weekly'.
  host text NOT NULL DEFAULT '',
  trigger text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed', 'stopped')),
  files integer NOT NULL DEFAULT 0,
  added integer NOT NULL DEFAULT 0,
  changed integer NOT NULL DEFAULT 0,
  moved integer NOT NULL DEFAULT 0,
  removed integer NOT NULL DEFAULT 0,
  unchanged integer NOT NULL DEFAULT 0,
  pages integer NOT NULL DEFAULT 0,
  ocr_pages integer NOT NULL DEFAULT 0,
  -- Per category: files and pages after the run; files that failed (path + error).
  categories jsonb NOT NULL DEFAULT '{}'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  message text
);
CREATE INDEX IF NOT EXISTS standard_index_runs_started_idx ON public.standard_index_runs (started_at DESC);

ALTER TABLE public.standard_index_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS standard_index_runs_staff_read ON public.standard_index_runs;
CREATE POLICY standard_index_runs_staff_read ON public.standard_index_runs FOR SELECT TO authenticated
  USING (NOT (SELECT public.app_is_customer()));
REVOKE ALL ON public.standard_index_runs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.standard_index_runs FROM authenticated;
GRANT SELECT ON public.standard_index_runs TO authenticated;

-- The owner's "Standards List.xlsx" (root of the library folder): the IS numbers that should have a file. Replaced by
-- the indexer on every run; the Standards Library page shows the numbers that have no file yet.
CREATE TABLE IF NOT EXISTS public.standard_list (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  row_no integer,
  is_number text NOT NULL,
  -- The number as the index writes it ("IS 18947" for "IS 18947:2024", "IS ISO 7240" for "IS/ISO 7240 (Part 5):2018").
  base text NOT NULL,
  title text,
  standard_type text,
  committee text,
  department text,
  pm_ref text
);
CREATE INDEX IF NOT EXISTS standard_list_base_idx ON public.standard_list (base);
ALTER TABLE public.standard_list ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS standard_list_staff_read ON public.standard_list;
CREATE POLICY standard_list_staff_read ON public.standard_list FOR SELECT TO authenticated
  USING (NOT (SELECT public.app_is_customer()));
REVOKE ALL ON public.standard_list FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.standard_list FROM authenticated;
GRANT SELECT ON public.standard_list TO authenticated;

-- Listed numbers without any library file. Runs as the caller (same RLS).
CREATE OR REPLACE VIEW public.standard_list_missing WITH (security_invoker = true) AS
  SELECT l.*
  FROM public.standard_list l
  WHERE NOT EXISTS (SELECT 1 FROM public.standard_docs d WHERE d.source = 'library' AND d.base = l.base);
REVOKE ALL ON public.standard_list_missing FROM anon;
GRANT SELECT ON public.standard_list_missing TO authenticated;
