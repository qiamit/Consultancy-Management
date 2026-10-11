-- A client's own ON DELETE CASCADE rows (sites, contacts, certificate files,
-- portal secret) were counted as "still used", so permanent delete refused
-- the firm even after its licences were gone.
-- Apply when the app is idle.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

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

NOTIFY pgrst, 'reload schema';
