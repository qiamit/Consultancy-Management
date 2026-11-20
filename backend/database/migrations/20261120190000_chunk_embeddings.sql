-- RAG step 3: meaning search on the Standards Library chunks (owner's choice, 20 Nov 2026: local model, nothing
-- leaves the server). The indexer embeds each chunk with BAAI/bge-small-en-v1.5 (384 numbers); a question is embedded
-- by the standards-embed service. embed_model is kept per chunk: changing the model re-embeds everything, and search
-- only compares vectors of the same model.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

ALTER TABLE public.standard_chunks
  ADD COLUMN IF NOT EXISTS embedding extensions.vector(384),
  ADD COLUMN IF NOT EXISTS embed_model text;

CREATE INDEX IF NOT EXISTS standard_chunks_embedding_idx
  ON public.standard_chunks USING hnsw (embedding extensions.vector_cosine_ops);

-- Hybrid search over the whole library: the word search (search_library_chunks) and the meaning search each give
-- their best chunks, merged by reciprocal rank (a chunk both find comes first), a few per document. Same rules as the
-- word search: current editions unless asked, p_folders for named standards, staff only.
CREATE OR REPLACE FUNCTION public.search_library_hybrid(
  p_query text,
  p_embedding text,
  p_model text,
  p_limit integer DEFAULT 24,
  p_per_doc integer DEFAULT 3,
  p_current_only boolean DEFAULT true,
  p_folders text[] DEFAULT NULL
)
RETURNS TABLE(relpath text, folder text, doc_kind text, version_status text, kind text, page integer, seq integer,
              heading text, text text, rank real)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
#variable_conflict use_column
DECLARE
  v extensions.vector(384);
BEGIN
  IF auth.uid() IS NULL OR public.app_is_customer() THEN
    RETURN;
  END IF;
  v := CASE WHEN coalesce(p_embedding, '') = '' THEN NULL ELSE p_embedding::extensions.vector(384) END;
  -- The HNSW index returns at most ef_search rows: enough for the 300 looked at below.
  PERFORM set_config('hnsw.ef_search', '300', true);
  RETURN QUERY
  WITH words AS (
    SELECT w.relpath, w.page, w.seq, row_number() OVER (ORDER BY w.rank DESC) AS r
    FROM public.search_library_chunks(p_query, 150, 10, p_current_only, p_folders) w
  ),
  near AS (
    SELECT c.id, row_number() OVER (ORDER BY c.embedding <=> v) AS r
    FROM (
      SELECT c.id, c.embedding
      FROM public.standard_chunks c
      WHERE v IS NOT NULL AND c.embedding IS NOT NULL AND c.embed_model = p_model
        AND (p_folders IS NULL OR c.doc_id IN (SELECT d.id FROM public.standard_docs d WHERE d.folder = ANY (p_folders)))
      ORDER BY c.embedding <=> v
      LIMIT 300
    ) c
  ),
  near_docs AS (
    SELECT d.relpath, c.page, c.seq, near.r
    FROM near
    JOIN public.standard_chunks c ON c.id = near.id
    JOIN public.standard_docs d ON d.id = c.doc_id
    WHERE d.source = 'library'
      AND (NOT p_current_only OR coalesce(d.version_status, 'Current') IN ('Current', 'Included'))
  ),
  fused AS (
    SELECT k.relpath, k.page, k.seq,
           (coalesce(1.0 / (60 + w.r), 0) + coalesce(1.0 / (60 + n.r), 0))::real AS score
    FROM (SELECT relpath, page, seq FROM words UNION SELECT relpath, page, seq FROM near_docs) k
    LEFT JOIN words w USING (relpath, page, seq)
    LEFT JOIN near_docs n USING (relpath, page, seq)
  ),
  ranked AS (
    SELECT f.*, row_number() OVER (PARTITION BY f.relpath ORDER BY f.score DESC) AS n FROM fused f
  )
  SELECT d.relpath, d.folder, d.kind, d.version_status, c.kind, c.page, c.seq, c.heading, c.text, ranked.score
  FROM ranked
  JOIN public.standard_docs d ON d.relpath = ranked.relpath
  JOIN public.standard_chunks c ON c.doc_id = d.id AND c.page = ranked.page AND c.seq = ranked.seq
  WHERE ranked.n <= greatest(1, least(coalesce(p_per_doc, 3), 10))
  ORDER BY ranked.score DESC
  LIMIT greatest(1, least(coalesce(p_limit, 24), 80));
END;
$$;
REVOKE ALL ON FUNCTION public.search_library_hybrid(text, text, text, integer, integer, boolean, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_library_hybrid(text, text, text, integer, integer, boolean, text[]) TO authenticated;
