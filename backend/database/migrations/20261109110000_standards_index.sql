-- Standards index: the text of every IS Standard, Amendment and Product Manual PDF (page by page, OCR for scanned
-- pages), copied from the index kept on the owner's Mac (deploy/standards-index). It lets an AI document check send
-- only the pages that matter (requirement tables and clauses) instead of the first 100k characters of a Standard.
-- Filled and updated only by deploy/standards-index/sync_app.py (database owner); app users can only read it,
-- and only staff (customers never).

CREATE TABLE IF NOT EXISTS public.standard_docs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- The IS folder: "IS 1786", "IS 4031 Part 4", "IS 101 Part 1 Sec 1".
  folder text NOT NULL,
  -- Path inside the IS Standards folder; "file.pdf::attachment.pdf" for a PDF portfolio's attachment.
  relpath text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('Standard', 'Amendment', 'Product Manual', 'Old version', 'Extra (other)')),
  pages integer NOT NULL DEFAULT 0,
  -- File date on the Mac (seconds): a different date on the next sync means the file is loaded again.
  mtime double precision NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS standard_docs_folder_idx ON public.standard_docs (folder);

CREATE TABLE IF NOT EXISTS public.standard_pages (
  doc_id bigint NOT NULL REFERENCES public.standard_docs(id) ON DELETE CASCADE,
  page integer NOT NULL,
  text text NOT NULL DEFAULT '',
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', left(text, 200000))) STORED,
  PRIMARY KEY (doc_id, page)
);
CREATE INDEX IF NOT EXISTS standard_pages_tsv_idx ON public.standard_pages USING gin (tsv);

ALTER TABLE public.standard_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standard_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS standard_docs_staff_read ON public.standard_docs;
CREATE POLICY standard_docs_staff_read ON public.standard_docs FOR SELECT TO authenticated
  USING (NOT (SELECT public.app_is_customer()));
DROP POLICY IF EXISTS standard_pages_staff_read ON public.standard_pages;
CREATE POLICY standard_pages_staff_read ON public.standard_pages FOR SELECT TO authenticated
  USING (NOT (SELECT public.app_is_customer()));
REVOKE ALL ON public.standard_docs, public.standard_pages FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.standard_docs, public.standard_pages FROM authenticated;
GRANT SELECT ON public.standard_docs, public.standard_pages TO authenticated;

-- The index folders of an IS Code (IS Code Master): most specific first, e.g. "IS 302 Part 2 Sec 14",
-- "IS 302 Part 2", "IS 302". Only folders that exist in the index are returned.
CREATE OR REPLACE FUNCTION public.standard_folders_for_is_code(p_is_code_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH c AS (
    SELECT
      substring(coalesce(is_number, '') FROM '(\d+)') AS num,
      substring(coalesce(part_no, '') FROM '(\d+)') AS part,
      substring(coalesce(section_no, '') FROM '(\d+)') AS sec
    FROM public.is_codes
    WHERE id = p_is_code_id
  ),
  cand AS (
    SELECT 1 AS ord, 'IS ' || num || ' Part ' || part || ' Sec ' || sec AS folder FROM c WHERE part IS NOT NULL AND sec IS NOT NULL
    UNION ALL
    SELECT 2, 'IS ' || num || ' Part ' || part FROM c WHERE part IS NOT NULL
    UNION ALL
    SELECT 3, 'IS ' || num FROM c WHERE num IS NOT NULL
  )
  SELECT coalesce(array_agg(cand.folder ORDER BY cand.ord), '{}')
  FROM cand
  WHERE EXISTS (SELECT 1 FROM public.standard_docs d WHERE d.folder = cand.folder);
$$;

-- Pages of the given IS folders that best match the words (any of them), Standard text first, duplicates (the same
-- page in two files) once. Old versions are left out unless asked for in p_kinds.
CREATE OR REPLACE FUNCTION public.search_standard_pages(
  p_folders text[],
  p_query text,
  p_limit integer DEFAULT 12,
  p_kinds text[] DEFAULT NULL
)
RETURNS TABLE (folder text, relpath text, kind text, page integer, text text, rank real)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH q AS (
    SELECT websearch_to_tsquery('english', regexp_replace(trim(coalesce(p_query, '')), '\s+', ' or ', 'g')) AS tsq
  ),
  hits AS (
    SELECT d.folder, d.relpath, d.kind, p.page, p.text,
      (ts_rank_cd(p.tsv, q.tsq) * CASE d.kind
        WHEN 'Standard' THEN 1.0 WHEN 'Amendment' THEN 0.95 WHEN 'Extra (other)' THEN 0.85
        WHEN 'Product Manual' THEN 0.7 ELSE 0.4 END)::real AS rank
    FROM public.standard_pages p
    JOIN public.standard_docs d ON d.id = p.doc_id
    CROSS JOIN q
    WHERE d.folder = ANY (p_folders)
      AND (p_kinds IS NULL AND d.kind <> 'Old version' OR d.kind = ANY (p_kinds))
      AND p.tsv @@ q.tsq
  ),
  one_copy AS (
    SELECT DISTINCT ON (md5(hits.text)) hits.*
    FROM hits
    ORDER BY md5(hits.text), hits.rank DESC
  )
  SELECT * FROM one_copy ORDER BY rank DESC LIMIT greatest(1, least(coalesce(p_limit, 12), 60));
$$;

REVOKE ALL ON FUNCTION public.standard_folders_for_is_code(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_standard_pages(text[], text, integer, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.standard_folders_for_is_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_standard_pages(text[], text, integer, text[]) TO authenticated;
