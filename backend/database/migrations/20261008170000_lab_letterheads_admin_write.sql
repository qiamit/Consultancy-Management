DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='lab_letterheads' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.lab_letterheads', p.policyname);
  END LOOP;
END $$;
ALTER TABLE public.lab_letterheads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lab_letterheads FROM anon;
CREATE POLICY lab_letterheads_select ON public.lab_letterheads FOR SELECT TO authenticated USING (true);
CREATE POLICY lab_letterheads_insert ON public.lab_letterheads FOR INSERT TO authenticated WITH CHECK (public.app_is_admin());
CREATE POLICY lab_letterheads_update ON public.lab_letterheads FOR UPDATE TO authenticated USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY lab_letterheads_delete ON public.lab_letterheads FOR DELETE TO authenticated USING (public.app_is_admin());
