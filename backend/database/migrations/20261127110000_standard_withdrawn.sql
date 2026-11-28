-- Withdrawn standards left out of "Referenced Standards Not in the Library" (owner, 27 Nov 2026).
--
-- The library's standards name about 2,300 IS numbers that it has no file for. Many of them BIS has withdrawn (IS 105,
-- IS 226, IS 8112, IS 12269 …): there is nothing to buy or add, and the owner asked for them to be removed from the
-- list. The BIS standards search (standards.bis.gov.in, Know Your Standards) gives each number's status; the indexer
-- reads that list from "Withdrawn Standards.txt" at the root of the library into standard_withdrawn, and
-- standard_refs_refresh() marks those references withdrawn. A number Standards List marks Withdrawn counts too.
-- The references stay in standard_refs_status (with withdrawn = true); the Standards Library page leaves them out of
-- the missing list and shows how many were left out.

CREATE TABLE IF NOT EXISTS public.standard_withdrawn (
  base text PRIMARY KEY,                -- 'IS 226'
  replaced_by text,                     -- 'IS 2062', when BIS names the standard that took over
  withdrawn_on date,
  note text
);
ALTER TABLE public.standard_withdrawn ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS standard_withdrawn_staff_read ON public.standard_withdrawn;
CREATE POLICY standard_withdrawn_staff_read ON public.standard_withdrawn FOR SELECT TO authenticated
  USING (NOT (SELECT public.app_is_customer()));
REVOKE ALL ON public.standard_withdrawn FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.standard_withdrawn FROM authenticated;
GRANT SELECT ON public.standard_withdrawn TO authenticated;

ALTER TABLE public.standard_refs_status ADD COLUMN IF NOT EXISTS withdrawn boolean NOT NULL DEFAULT false;

-- As in 20261112110000, plus the withdrawn flag.
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
  INSERT INTO public.standard_refs_status (ref_base, ref_part, cited_by, cites, cited_in, has_number, has_part, withdrawn)
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
                   OR s.aka @> ARRAY[CASE WHEN c.ref_part = '' THEN c.ref_base ELSE c.ref_base || ' Part ' || c.ref_part END])),
    EXISTS (SELECT 1 FROM public.standard_withdrawn w WHERE w.base = c.ref_base)
      OR EXISTS (SELECT 1 FROM public.standard_list l
                 WHERE l.base = c.ref_base AND coalesce(l.part, '') IN ('', c.ref_part) AND l.status ILIKE 'withdrawn%')
  FROM cited c;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.standard_refs_refresh() FROM PUBLIC, anon, authenticated;
