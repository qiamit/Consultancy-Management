-- RAG step 2 (docs/standards-rag-update-rules.md): clause and table chunks of every library document.
--   kind 'table'  — a table read in column layout (pdftotext -layout), so each row keeps its grade / values
--   kind 'clause' — a clause (or Foreword / Annex) of a page's text, with its number and title as heading
--   kind 'page'   — a page with no clause heading (title pages, scanned pages read by OCR)
-- Built by the indexer for new and changed files, and once for every file when the chunking rules change
-- (standard_docs.chunks_version). Embeddings (pgvector) follow in RAG step 3; this step gives word search on chunks.

ALTER TABLE public.standard_docs ADD COLUMN IF NOT EXISTS chunks_version integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.standard_chunks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  doc_id bigint NOT NULL REFERENCES public.standard_docs(id) ON DELETE CASCADE,
  page integer NOT NULL,
  seq integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('table', 'clause', 'page')),
  heading text NOT NULL DEFAULT '',
  text text NOT NULL,
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', left(heading || ' ' || text, 200000))) STORED
);
CREATE INDEX IF NOT EXISTS standard_chunks_doc_idx ON public.standard_chunks (doc_id, page, seq);
CREATE INDEX IF NOT EXISTS standard_chunks_tsv_idx ON public.standard_chunks USING gin (tsv);

ALTER TABLE public.standard_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS standard_chunks_staff_read ON public.standard_chunks;
CREATE POLICY standard_chunks_staff_read ON public.standard_chunks FOR SELECT TO authenticated
  USING (NOT (SELECT public.app_is_customer()));
REVOKE ALL ON public.standard_chunks FROM anon;
GRANT SELECT ON public.standard_chunks TO authenticated;

-- Best chunks of these documents for the words (any of them), tables a little ahead: a numbers question is answered
-- by its table row, not by the clause that only names the table.
CREATE OR REPLACE FUNCTION public.search_standard_chunks(p_relpaths text[], p_query text, p_limit integer DEFAULT 12)
RETURNS TABLE(relpath text, kind text, page integer, seq integer, heading text, text text, rank real)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH q AS (
    SELECT websearch_to_tsquery('english', regexp_replace(trim(coalesce(p_query, '')), '\s+', ' or ', 'g')) AS tsq
  )
  SELECT d.relpath, c.kind, c.page, c.seq, c.heading, c.text,
         (ts_rank_cd(c.tsv, q.tsq) * CASE c.kind WHEN 'table' THEN 1.25 ELSE 1.0 END)::real AS rank
  FROM public.standard_chunks c
  JOIN public.standard_docs d ON d.id = c.doc_id
  CROSS JOIN q
  WHERE d.relpath = ANY (p_relpaths) AND c.tsv @@ q.tsq
  ORDER BY rank DESC
  LIMIT greatest(1, least(coalesce(p_limit, 12), 60));
$$;
REVOKE ALL ON FUNCTION public.search_standard_chunks(text[], text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_standard_chunks(text[], text, integer) TO authenticated;
