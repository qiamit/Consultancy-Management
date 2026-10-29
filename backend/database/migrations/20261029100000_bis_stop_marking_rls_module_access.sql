-- License Stop Marking / Non-Conformity: replace the open USING (true) policies with module-level access,
-- the same pattern as S6 (20261008200000_s6_portal_secrets_bis_rls.sql) for the BIS tables and the
-- bis-project-files bucket.
--   bis_stop_marking_cases  SELECT: anyone who can view a BIS screen (the BIS lists show open-notice badges).
--                           INSERT / UPDATE / DELETE: editors of /bis/stop-marking.
--   bis-stop-marking-files  read: BIS viewers; write: editors of /bis/stop-marking.
-- No data rewrite. Idempotent. Apply with npm run db:migrate when Amit asks.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
  bv  text := '(SELECT public.app_can_view(VARIADIC public.app_bis_paths()))';
  sm  text := '(SELECT public.app_can_edit(''/bis/stop-marking''))';
  spec jsonb;
  t text;
  p record;
BEGIN
  -- table => [select, insert, update, delete]
  spec := jsonb_build_object(
    'bis_stop_marking_cases', jsonb_build_array(bv, sm, sm, sm)
  );
  FOR t IN SELECT jsonb_object_keys(spec) LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'stop-marking RLS: table public.% missing, skipped', t;
      CONTINUE;
    END IF;
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)', t || '_select', t, spec->t->>0);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', t || '_insert', t, spec->t->>1);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', t || '_update', t, spec->t->>2, spec->t->>2);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)', t || '_delete', t, spec->t->>3);
  END LOOP;
END $$;

-- Storage bucket bis-stop-marking-files: read = BIS viewers, write = Stop Marking editors.
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'stop-marking RLS: storage.objects missing, skipped';
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS bis_stop_marking_files_storage_select ON storage.objects';
  EXECUTE 'CREATE POLICY bis_stop_marking_files_storage_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id = ''bis-stop-marking-files'' AND (SELECT public.app_can_view(VARIADIC public.app_bis_paths())))';
  EXECUTE 'DROP POLICY IF EXISTS bis_stop_marking_files_storage_insert ON storage.objects';
  EXECUTE 'CREATE POLICY bis_stop_marking_files_storage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = ''bis-stop-marking-files'' AND (SELECT public.app_can_edit(''/bis/stop-marking'')))';
  EXECUTE 'DROP POLICY IF EXISTS bis_stop_marking_files_storage_update ON storage.objects';
  EXECUTE 'CREATE POLICY bis_stop_marking_files_storage_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = ''bis-stop-marking-files'' AND (SELECT public.app_can_edit(''/bis/stop-marking''))) WITH CHECK (bucket_id = ''bis-stop-marking-files'' AND (SELECT public.app_can_edit(''/bis/stop-marking'')))';
  EXECUTE 'DROP POLICY IF EXISTS bis_stop_marking_files_storage_delete ON storage.objects';
  EXECUTE 'CREATE POLICY bis_stop_marking_files_storage_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = ''bis-stop-marking-files'' AND (SELECT public.app_can_edit(''/bis/stop-marking'')))';
END $$;
