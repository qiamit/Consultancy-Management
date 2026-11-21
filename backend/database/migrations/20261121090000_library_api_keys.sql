-- Library API for the owner's own apps (qirlpl.com; owner, 21 Nov 2026): API keys made in Settings -> API Keys, and the
-- library search open to the functions service once it has checked a key. The API returns passages (IS, clause /
-- table, page, text) and PDF links only; the calling app writes its own answer.
--
-- A key is shown once when made; only its SHA-256 hash is kept. Admins make, see and revoke keys.

CREATE TABLE IF NOT EXISTS public.library_api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  key_prefix   text NOT NULL,
  key_hash     text NOT NULL UNIQUE,
  active       boolean NOT NULL DEFAULT true,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz,
  last_used_at timestamptz,
  use_count    bigint NOT NULL DEFAULT 0
);
ALTER TABLE public.library_api_keys ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.library_api_keys TO service_role;
DROP POLICY IF EXISTS library_api_keys_select_admin ON public.library_api_keys;
CREATE POLICY library_api_keys_select_admin ON public.library_api_keys
  FOR SELECT TO authenticated USING (public.app_is_admin());
-- Only these columns are readable by admins (never the hash).
REVOKE ALL ON public.library_api_keys FROM authenticated, anon;
GRANT SELECT (id, name, key_prefix, active, created_by, created_at, revoked_at, last_used_at, use_count)
  ON public.library_api_keys TO authenticated;

-- Make a key (admins): returns the key once.
CREATE OR REPLACE FUNCTION public.create_library_api_key(p_name text)
RETURNS TABLE(id uuid, api_key text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
#variable_conflict use_column
DECLARE
  v_key text;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only an admin can make API keys.' USING ERRCODE = '42501';
  END IF;
  IF coalesce(length(trim(p_name)), 0) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Give the key a name (up to 80 characters).' USING ERRCODE = '22023';
  END IF;
  v_key := 'qelib_' || encode(extensions.gen_random_bytes(24), 'hex');
  INSERT INTO public.library_api_keys (name, key_prefix, key_hash, created_by)
  VALUES (trim(p_name), left(v_key, 14), encode(extensions.digest(v_key, 'sha256'), 'hex'), auth.uid())
  RETURNING library_api_keys.id INTO v_id;
  RETURN QUERY SELECT v_id, v_key;
END;
$$;
REVOKE ALL ON FUNCTION public.create_library_api_key(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_library_api_key(text) TO authenticated;

-- Revoke a key (admins): it stops working at once and cannot be turned back on.
CREATE OR REPLACE FUNCTION public.revoke_library_api_key(p_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only an admin can revoke API keys.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.library_api_keys SET active = false, revoked_at = coalesce(revoked_at, now()) WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_library_api_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_library_api_key(uuid) TO authenticated;

-- The two library searches as before (staff only), and now also for the functions service (service role).
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
  WHERE (auth.role() = 'service_role' OR (NOT public.app_is_customer() AND auth.uid() IS NOT NULL))
    AND n <= greatest(1, least(coalesce(p_per_doc, 3), 10))
  ORDER BY rank DESC
  LIMIT greatest(1, least(coalesce(p_limit, 24), 80));
$$;
REVOKE ALL ON FUNCTION public.search_library_chunks(text, integer, integer, boolean, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_library_chunks(text, integer, integer, boolean, text[]) TO authenticated;

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
  -- Staff, or the functions service for the Library API (service role, after its API key check).
  IF NOT (auth.role() = 'service_role' OR (auth.uid() IS NOT NULL AND NOT public.app_is_customer())) THEN
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
GRANT EXECUTE ON FUNCTION public.search_library_chunks(text, integer, integer, boolean, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_library_hybrid(text, text, text, integer, integer, boolean, text[]) TO service_role;
