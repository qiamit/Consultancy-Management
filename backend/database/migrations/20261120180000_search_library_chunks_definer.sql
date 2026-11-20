-- search_library_chunks as SECURITY DEFINER (staff check inside): under the caller's row-level security the word
-- index could not be used before the policy check, and a library-wide question took 21 s as a signed-in user
-- (1.2 s without RLS), past the 8 s limit. Customers and anonymous callers still get nothing.

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
           -- Words matched counted on the best 600 only (on every match it ran past the 8 s limit).
           (top.r * power((SELECT count(*) FROM unnest(w.words) wd WHERE c.tsv @@ to_tsquery('simple', wd))::real, 2)
                  * CASE d.kind WHEN 'Standard' THEN 1.0 WHEN 'Amendment' THEN 0.95 WHEN 'Product Manual' THEN 0.75
                                ELSE 0.5 END)::real AS rank
    FROM top
    CROSS JOIN w
    JOIN public.standard_chunks c ON c.id = top.id
    JOIN public.standard_docs d ON d.id = top.doc_id
    WHERE d.source = 'library'
      AND (NOT p_current_only OR coalesce(d.version_status, 'Current') IN ('Current', 'Included'))
  ),
  ranked AS (
    SELECT hits.*, row_number() OVER (PARTITION BY hits.relpath ORDER BY hits.rank DESC) AS n FROM hits
  )
  SELECT relpath, folder, doc_kind, version_status, kind, page, seq, heading, text, rank
  FROM ranked
  WHERE NOT public.app_is_customer() AND auth.uid() IS NOT NULL
    AND n <= greatest(1, least(coalesce(p_per_doc, 3), 10))
  ORDER BY rank DESC
  LIMIT greatest(1, least(coalesce(p_limit, 24), 80));
$$;
REVOKE ALL ON FUNCTION public.search_library_chunks(text, integer, integer, boolean, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_library_chunks(text, integer, integer, boolean, text[]) TO authenticated;
