-- The same PDF under several names takes one place in a library search (24 Nov 2026).
--
-- Live has 40 PDFs filed under 115 names: QCO gazettes that cover several products are filed once under each IS
-- ("IS 10931 - Lauric-Acid-…", "IS 12029 - Acid-Oil-…" are the same 8-page order), and some guidelines are in two
-- folders (BIS_CA_12032019.pdf and its "#page=243" / "#page=358" copies). In the Ask AI test of 50 questions the same
-- text took two or three of the places in a search's results. Now each chunk of such a PDF comes once (same sha256,
-- page and chunk number): word search keeps the copy whose file name holds most of the question's words, and hybrid
-- search fuses the two rankings on the PDF and names the copy whose embedding (with its own title in front) is
-- closest. Every copy stays in the library, so a search for any of the ISs it is filed under still finds it. Results
-- with an equal score now come in a fixed order (file name, page, chunk). Nothing else changes in the two functions
-- (copied from 20261124100000).

CREATE OR REPLACE FUNCTION public.search_library_chunks(
  p_query text,
  p_limit integer DEFAULT 24,
  p_per_doc integer DEFAULT 3,
  p_current_only boolean DEFAULT true,
  p_folders text[] DEFAULT NULL
)
RETURNS TABLE(relpath text, folder text, doc_kind text, version_status text, kind text, page integer, seq integer,
              heading text, text text, rank real)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- A chunk must hold at least two of the question's words ("tensile & yield" | "tensile & bars" | …): one common
  -- word alone matches tens of thousands of chunks across the library and ranking them all takes a minute.
  WITH w AS (
    SELECT array_agg(lexeme ORDER BY pos) AS words
    FROM (
      SELECT lexeme, min(p) AS pos
      FROM unnest(to_tsvector('english', coalesce(p_query, ''))) AS t(lexeme, positions, weights),
           LATERAL unnest(positions) AS p
      WHERE lexeme ~ '^[a-z0-9]+$'
        -- Words in nearly every standard say nothing about where the answer is, and make the match huge.
        AND lexeme <> ALL (ARRAY['standard', 'indian', 'shall', 'specif', 'requir', 'given', 'give', 'use', 'accord',
                                 'per', 'made', 'which', 'what', 'valu', 'state', 'also', 'one', 'two', 'may', 'follow',
                                 'claus', 'see', 'general'])
      GROUP BY lexeme
      ORDER BY min(p)
      LIMIT 6
    ) x
  ),
  q AS (
    SELECT CASE
      WHEN coalesce(array_length(w.words, 1), 0) = 0 THEN NULL
      WHEN array_length(w.words, 1) = 1 THEN to_tsquery('simple', w.words[1])
      -- Five words or more: a chunk must hold three of them (two of six common ones still matched ~25,000 chunks).
      WHEN array_length(w.words, 1) >= 5 THEN (
        SELECT to_tsquery('simple', string_agg('(' || a || ' & ' || b || ' & ' || c || ')', ' | '))
        FROM unnest(w.words) WITH ORDINALITY s1(a, i), unnest(w.words) WITH ORDINALITY s2(b, j),
             unnest(w.words) WITH ORDINALITY s3(c, k)
        WHERE i < j AND j < k
      )
      ELSE (
        SELECT to_tsquery('simple', string_agg('(' || a || ' & ' || b || ')', ' | '))
        FROM unnest(w.words) WITH ORDINALITY s1(a, i), unnest(w.words) WITH ORDINALITY s2(b, j)
        WHERE i < j
      )
    END AS tsq
    FROM w
  ),
  -- Ranked on the chunk table alone first (the best 600), then joined to their documents: joining every match to
  -- standard_docs before ranking is what made a library-wide question slow.
  top AS (
    SELECT c.id, c.doc_id,
           -- More of the question's words in one chunk counts most ("steel" and "tube" and "sampling" beats
           -- "sampling" and "lot" and "size" of another product).
           (ts_rank_cd(c.tsv, q.tsq) * CASE c.kind WHEN 'table' THEN 1.25 ELSE 1.0 END)::real AS r
    FROM public.standard_chunks c CROSS JOIN q
    WHERE q.tsq IS NOT NULL AND c.tsv @@ q.tsq
      AND (p_folders IS NULL OR c.doc_id IN (SELECT id FROM public.standard_docs WHERE folder = ANY (p_folders)))
    ORDER BY r DESC
    LIMIT 600
  ),
  hits AS (
    SELECT d.relpath, d.folder, d.kind AS doc_kind, d.version_status, c.kind, c.page, c.seq, c.heading, c.text,
           coalesce(CASE WHEN position('::' in d.relpath) = 0 THEN d.sha256 END, d.relpath) AS k,
           -- How many of the question's words the file name holds: picks the copy of a PDF filed under several names.
           (SELECT count(*) FROM unnest(w.words) wd WHERE to_tsvector('english', d.relpath) @@ to_tsquery('simple', wd)) AS name_hits,
           -- Words matched counted on the best 600 only (on every match it ran past the 8 s limit).
           (top.r * power((SELECT count(*) FROM unnest(w.words) wd WHERE c.tsv @@ to_tsquery('simple', wd))::real, 2)
                  * CASE d.kind WHEN 'Standard' THEN 1.0 WHEN 'Amendment' THEN 0.95 WHEN 'Guideline' THEN CASE WHEN g.reg THEN 1.0 ELSE 0.4 END
                                WHEN 'Product Manual' THEN 0.75 ELSE 0.5 END)::real AS rank
    FROM top
    CROSS JOIN w
    CROSS JOIN (SELECT public.library_query_regulatory(p_query) AS reg) g
    JOIN public.standard_chunks c ON c.id = top.id
    JOIN public.standard_docs d ON d.id = top.doc_id
    WHERE d.source = 'library'
      AND (NOT p_current_only OR coalesce(d.version_status, 'Current') IN ('Current', 'Included'))
  ),
  uniq AS (
    -- The same PDF under several names (a QCO gazette filed under each IS it covers, a guideline in two folders): one
    -- place per chunk, under the name that holds most of the question's words, else the shortest.
    SELECT DISTINCT ON (hits.k, hits.page, hits.seq) hits.*
    FROM hits
    ORDER BY hits.k, hits.page, hits.seq, hits.rank DESC, hits.name_hits DESC, length(hits.relpath), hits.relpath
  ),
  ranked AS (
    SELECT uniq.*, row_number() OVER (PARTITION BY uniq.relpath ORDER BY uniq.rank DESC) AS n FROM uniq
  )
  SELECT relpath, folder, doc_kind, version_status, kind, page, seq, heading, text, rank
  FROM ranked
  WHERE (auth.role() = 'service_role' OR (NOT public.app_is_customer() AND auth.uid() IS NOT NULL))
    AND n <= greatest(1, least(coalesce(p_per_doc, 3), 10))
  ORDER BY rank DESC, relpath, page, seq  -- equal ranks in the same order every time
  LIMIT greatest(1, least(coalesce(p_limit, 24), 80));
$$;
REVOKE ALL ON FUNCTION public.search_library_chunks(text, integer, integer, boolean, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_library_chunks(text, integer, integer, boolean, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_library_chunks(text, integer, integer, boolean, text[]) TO service_role;

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
  reg boolean := public.library_query_regulatory(p_query);
BEGIN
  -- Staff, or the functions service for the Library API (service role, after its API key check).
  IF NOT (auth.role() = 'service_role' OR (auth.uid() IS NOT NULL AND NOT public.app_is_customer())) THEN
    RETURN;
  END IF;
  v := CASE WHEN coalesce(p_embedding, '') = '' THEN NULL ELSE p_embedding::extensions.vector(384) END;
  -- The HNSW index returns at most ef_search rows: enough for the 300 looked at below.
  PERFORM set_config('hnsw.ef_search', '300', true);
  RETURN QUERY
  WITH words AS (
    SELECT w.relpath, coalesce(CASE WHEN position('::' in d.relpath) = 0 THEN d.sha256 END, d.relpath) AS k, w.page, w.seq, row_number() OVER (ORDER BY w.rank DESC) AS r
    FROM public.search_library_chunks(p_query, 150, 10, p_current_only, p_folders) w
    JOIN public.standard_docs d ON d.relpath = w.relpath AND d.source = 'library'
  ),
  near AS (
    SELECT x.id, row_number() OVER (ORDER BY x.dist) AS r
    FROM (
      (
        -- Whole library: the index.
        SELECT c.id, (c.embedding <=> v) AS dist
        FROM public.standard_chunks c
        WHERE v IS NOT NULL AND p_folders IS NULL AND c.embedding IS NOT NULL AND c.embed_model = p_model
        ORDER BY c.embedding <=> v
        LIMIT 300
      )
      UNION ALL
      (
        -- Named standards: every chunk of their folders compared ("+ 0" keeps the index out of it).
        SELECT c.id, (c.embedding <=> v) + 0 AS dist
        FROM public.standard_chunks c
        WHERE v IS NOT NULL AND p_folders IS NOT NULL AND c.embedding IS NOT NULL AND c.embed_model = p_model
          AND c.doc_id IN (SELECT d.id FROM public.standard_docs d WHERE d.folder = ANY (p_folders))
        ORDER BY 2
        LIMIT 300
      )
    ) x
  ),
  near_docs AS (
    -- The same PDF under several names: one place per chunk, under the name closest to the question (the name's
    -- title is in front of each chunk's embedding).
    SELECT DISTINCT ON (coalesce(CASE WHEN position('::' in d.relpath) = 0 THEN d.sha256 END, d.relpath), c.page, c.seq) d.relpath, coalesce(CASE WHEN position('::' in d.relpath) = 0 THEN d.sha256 END, d.relpath) AS k, c.page, c.seq, near.r
    FROM near
    JOIN public.standard_chunks c ON c.id = near.id
    JOIN public.standard_docs d ON d.id = c.doc_id
    WHERE d.source = 'library'
      AND (NOT p_current_only OR coalesce(d.version_status, 'Current') IN ('Current', 'Included'))
    ORDER BY coalesce(CASE WHEN position('::' in d.relpath) = 0 THEN d.sha256 END, d.relpath), c.page, c.seq, near.r
  ),
  fused AS (
    SELECT coalesce(n.relpath, w.relpath) AS relpath, u.page, u.seq,
           (coalesce(1.0 / (60 + w.r), 0) + coalesce(1.0 / (60 + n.r), 0))::real AS score
    FROM (SELECT k, page, seq FROM words UNION SELECT k, page, seq FROM near_docs) u
    LEFT JOIN words w USING (k, page, seq)
    LEFT JOIN near_docs n USING (k, page, seq)
  ),
  ranked AS (
    SELECT f.*, row_number() OVER (PARTITION BY f.relpath ORDER BY f.score DESC) AS n FROM fused f
  )
  SELECT d.relpath, d.folder, d.kind, d.version_status, c.kind, c.page, c.seq, c.heading, c.text,
         (ranked.score * CASE WHEN d.kind IS DISTINCT FROM 'Guideline' THEN 1.0 WHEN reg THEN 1.25 ELSE 0.5 END)::real AS score
  FROM ranked
  JOIN public.standard_docs d ON d.relpath = ranked.relpath
  JOIN public.standard_chunks c ON c.doc_id = d.id AND c.page = ranked.page AND c.seq = ranked.seq
  WHERE ranked.n <= greatest(1, least(coalesce(p_per_doc, 3), 10))
  ORDER BY 10 DESC, 1, 6, 7  -- equal scores in the same order every time (file name, page, chunk)
  LIMIT greatest(1, least(coalesce(p_limit, 24), 80));
END;
$$;
REVOKE ALL ON FUNCTION public.search_library_hybrid(text, text, text, integer, integer, boolean, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_library_hybrid(text, text, text, integer, integer, boolean, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_library_hybrid(text, text, text, integer, integer, boolean, text[]) TO service_role;
