-- Client name is unique. The same GSTIN may belong to another unit in the same state.
-- Permanent delete of a client ignores its own ON DELETE CASCADE children.
-- Storage deletes stay in 20261010270000_storage_allow_api_object_delete.sql.
-- Apply when the app is idle.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.find_similar_clients(p_name text, p_gstin text)
RETURNS TABLE (id uuid, company_name text, gst_number text, similarity real)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT c.id,
         c.company_name,
         c.gst_number,
         extensions.similarity(lower(c.company_name), lower(btrim(p_name)))::real AS similarity
    FROM public.clients c
   WHERE btrim(COALESCE(p_name, '')) <> ''
     AND c.archived_at IS NULL
     AND extensions.similarity(lower(c.company_name), lower(btrim(p_name))) > 0.35
     AND lower(btrim(c.company_name)) <> lower(btrim(p_name))
   ORDER BY 4 DESC, c.company_name
   LIMIT 5;
$$;

REVOKE ALL ON FUNCTION public.find_similar_clients(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_similar_clients(text, text) TO authenticated;

COMMENT ON FUNCTION public.find_similar_clients(text, text) IS
  'Name similarity only. An exact firm name is rejected by clients_company_name_lower_uidx. The same GSTIN is allowed.';

CREATE OR REPLACE FUNCTION public.master_reference_counts(p_table text, p_ids uuid[])
RETURNS TABLE (row_id uuid, ref_table text, ref_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE c record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_table IS NULL OR p_table NOT IN ('clients', 'is_codes', 'test_parameters', 'products_services_master') THEN
    RAISE EXCEPTION 'Not a master table: %', p_table USING ERRCODE = '22023';
  END IF;
  FOR c IN
    SELECT con.conrelid::regclass::text AS child, a.attname AS col
      FROM pg_constraint con
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
     WHERE con.contype = 'f'
       AND con.confrelid = ('public.' || p_table)::regclass
       AND array_length(con.conkey, 1) = 1
       AND NOT (p_table = 'is_codes' AND con.conrelid = 'public.is_code_files'::regclass)
       AND NOT (p_table = 'clients' AND con.confdeltype = 'c')
  LOOP
    RETURN QUERY EXECUTE format(
      'SELECT %I::uuid, %L::text, count(*)::bigint FROM %s WHERE %I = ANY ($1) GROUP BY 1',
      c.col, c.child, c.child, c.col) USING p_ids;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.master_reference_counts(text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.master_reference_counts(text, uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_master_rows(p_table text, p_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_blocked jsonb;
  v_ok      uuid[];
  v_paths   text[];
  v_deleted uuid[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only Laboratory Director/Admin can permanently delete records.' USING ERRCODE = '42501';
  END IF;
  IF p_table IS NULL OR p_table NOT IN ('clients', 'is_codes', 'test_parameters', 'products_services_master') THEN
    RAISE EXCEPTION 'Not a master table: %', p_table USING ERRCODE = '22023';
  END IF;
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN jsonb_build_object('deleted', '[]'::jsonb, 'blocked', '[]'::jsonb, 'storage_paths', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', b.row_id, 'refs', b.refs)), '[]'::jsonb)
    INTO v_blocked
    FROM (SELECT r.row_id, jsonb_object_agg(r.ref_table, r.ref_count) AS refs
            FROM public.master_reference_counts(p_table, p_ids) r
           WHERE r.ref_count > 0
           GROUP BY r.row_id) b;

  SELECT array_agg(x) INTO v_ok
    FROM unnest(p_ids) AS x
   WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_blocked) e WHERE (e ->> 'id')::uuid = x);

  IF v_ok IS NOT NULL THEN
    IF p_table = 'is_codes' THEN
      SELECT array_agg(f.storage_path) INTO v_paths
        FROM public.is_code_files f
       WHERE f.is_code_id = ANY (v_ok) AND COALESCE(f.storage_path, '') <> '';
    ELSIF p_table = 'clients' THEN
      SELECT array_agg(f.storage_path) INTO v_paths
        FROM public.client_certificate_files f
       WHERE f.client_id = ANY (v_ok) AND COALESCE(f.storage_path, '') <> '';
    END IF;
    EXECUTE format('WITH d AS (DELETE FROM public.%I WHERE id = ANY ($1) RETURNING id) SELECT array_agg(id) FROM d', p_table)
      INTO v_deleted USING v_ok;
  END IF;

  RETURN jsonb_build_object(
    'deleted',       COALESCE(to_jsonb(v_deleted), '[]'::jsonb),
    'blocked',       v_blocked,
    'storage_paths', COALESCE(to_jsonb(v_paths), '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.delete_master_rows(text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_master_rows(text, uuid[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
