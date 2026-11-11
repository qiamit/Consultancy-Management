-- Standards Library: the standards each Standard refers to ("tensile test as per IS 1608 (Part 1)", "steel
-- conforming to IS 2062", "ASTM E18"), and a page search inside chosen documents only.
-- Filled by deploy/standards-library/indexer.py (database owner): a Standard is scanned once, again only when its
-- file changes (its rows go with the document).

ALTER TABLE public.standard_docs ADD COLUMN IF NOT EXISTS refs_scanned boolean NOT NULL DEFAULT false;
-- The same standard's other numbers, from its first page ("IS 1608 (Part 1) : 2022 / ISO 6892-1 : 2019") or its name
-- (an IS/ISO adoption): {"ISO 6892", "ISO 6892 Part 1"}. A reference to ISO 6892-1 is answered by this file.
ALTER TABLE public.standard_docs ADD COLUMN IF NOT EXISTS aka text[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.standard_refs (
  doc_id bigint NOT NULL REFERENCES public.standard_docs(id) ON DELETE CASCADE,
  -- The referenced number as the index writes it: "IS 1608", "ISO 6892", "ASTM E18".
  ref_base text NOT NULL,
  -- Its Part ("1"), '' when none is named.
  ref_part text NOT NULL DEFAULT '',
  -- How often the Standard names it.
  cites integer NOT NULL DEFAULT 1,
  PRIMARY KEY (doc_id, ref_base, ref_part)
);
CREATE INDEX IF NOT EXISTS standard_refs_base_idx ON public.standard_refs (ref_base);

ALTER TABLE public.standard_refs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS standard_refs_staff_read ON public.standard_refs;
CREATE POLICY standard_refs_staff_read ON public.standard_refs FOR SELECT TO authenticated
  USING (NOT (SELECT public.app_is_customer()));
REVOKE ALL ON public.standard_refs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.standard_refs FROM authenticated;
GRANT SELECT ON public.standard_refs TO authenticated;

-- Every referenced standard (number + part) with the library's answer: is its file there (by number, or by the ISO
-- number a library file also carries)? Cited by how many Standards of the library (their own number left out).
-- A table, refilled by the indexer after each run (standard_refs_refresh), so the page reads it at once.
DROP VIEW IF EXISTS public.standard_refs_status;
CREATE TABLE IF NOT EXISTS public.standard_refs_status (
  ref_base text NOT NULL,
  ref_part text NOT NULL DEFAULT '',
  cited_by integer NOT NULL DEFAULT 0,
  cites integer NOT NULL DEFAULT 0,
  cited_in text[] NOT NULL DEFAULT '{}',
  has_number boolean NOT NULL DEFAULT false,
  has_part boolean NOT NULL DEFAULT false,
  PRIMARY KEY (ref_base, ref_part)
);
CREATE INDEX IF NOT EXISTS standard_refs_status_order_idx ON public.standard_refs_status (has_part, cited_by DESC, cites DESC);
ALTER TABLE public.standard_refs_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS standard_refs_status_staff_read ON public.standard_refs_status;
CREATE POLICY standard_refs_status_staff_read ON public.standard_refs_status FOR SELECT TO authenticated
  USING (NOT (SELECT public.app_is_customer()));
REVOKE ALL ON public.standard_refs_status FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.standard_refs_status FROM authenticated;
GRANT SELECT ON public.standard_refs_status TO authenticated;

CREATE OR REPLACE FUNCTION public.standard_refs_refresh()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  DELETE FROM public.standard_refs_status;
  WITH cited AS (
    SELECT r.ref_base, r.ref_part, count(DISTINCT d.base)::integer AS cited_by, sum(r.cites)::integer AS cites,
      (array_agg(DISTINCT d.base))[1:5] AS cited_in
    FROM public.standard_refs r
    JOIN public.standard_docs d ON d.id = r.doc_id
    WHERE d.source = 'library' AND d.base <> r.ref_base
    GROUP BY r.ref_base, r.ref_part
  )
  INSERT INTO public.standard_refs_status (ref_base, ref_part, cited_by, cites, cited_in, has_number, has_part)
  SELECT c.ref_base, c.ref_part, c.cited_by, c.cites, c.cited_in,
    EXISTS (SELECT 1 FROM public.standard_docs s
            WHERE s.source = 'library' AND s.kind <> 'Product Manual'
              AND (s.base = c.ref_base OR s.aka @> ARRAY[c.ref_base])),
    EXISTS (SELECT 1 FROM public.standard_docs s
            WHERE s.source = 'library' AND s.kind <> 'Product Manual'
              AND (s.base = c.ref_base
                   AND (c.ref_part = '' OR s.relpath ~* ('[^/]*\mPart\s*' || c.ref_part || '(?![0-9])[^/]*$')
                        -- a combined file: "IS 1708 Parts 1 to 18 1986.pdf", "IS 504 Part 1 to 12 2002 - 00.pdf"
                        OR EXISTS (SELECT 1 FROM regexp_matches(s.relpath, 'Parts? (\d+) to (\d+)', 'i') m
                                   WHERE c.ref_part::int BETWEEN m[1]::int AND m[2]::int))
                   OR s.aka @> ARRAY[CASE WHEN c.ref_part = '' THEN c.ref_base ELSE c.ref_base || ' Part ' || c.ref_part END]))
  FROM cited c;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.standard_refs_refresh() FROM PUBLIC, anon, authenticated;

-- Pages that best match the words, as before; with p_relpaths only pages of those documents (the IS Code's own part
-- and revision), so the best pages of another part never push them out.
DROP FUNCTION IF EXISTS public.search_standard_pages(text[], text, integer, text[]);
CREATE OR REPLACE FUNCTION public.search_standard_pages(
  p_folders text[],
  p_query text,
  p_limit integer DEFAULT 12,
  p_kinds text[] DEFAULT NULL,
  p_relpaths text[] DEFAULT NULL
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
      AND (p_relpaths IS NULL OR d.relpath = ANY (p_relpaths))
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
REVOKE ALL ON FUNCTION public.search_standard_pages(text[], text, integer, text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_standard_pages(text[], text, integer, text[], text[]) TO authenticated;
