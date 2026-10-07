-- Ensure authenticated users can delete BIS project file rows and storage objects.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bis_project_files TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

ALTER TABLE public.bis_project_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bis_project_files_authenticated_all ON public.bis_project_files;
CREATE POLICY bis_project_files_authenticated_all
  ON public.bis_project_files
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Explicit per-command policies (some PostgREST/GoTrue stacks are picky about FOR ALL).
DROP POLICY IF EXISTS bis_project_files_select ON public.bis_project_files;
CREATE POLICY bis_project_files_select
  ON public.bis_project_files FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS bis_project_files_insert ON public.bis_project_files;
CREATE POLICY bis_project_files_insert
  ON public.bis_project_files FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS bis_project_files_update ON public.bis_project_files;
CREATE POLICY bis_project_files_update
  ON public.bis_project_files FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS bis_project_files_delete ON public.bis_project_files;
CREATE POLICY bis_project_files_delete
  ON public.bis_project_files FOR DELETE TO authenticated
  USING (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('bis-project-files', 'bis-project-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS bis_project_files_storage_select ON storage.objects;
CREATE POLICY bis_project_files_storage_select
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'bis-project-files');

DROP POLICY IF EXISTS bis_project_files_storage_insert ON storage.objects;
CREATE POLICY bis_project_files_storage_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bis-project-files');

DROP POLICY IF EXISTS bis_project_files_storage_update ON storage.objects;
CREATE POLICY bis_project_files_storage_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'bis-project-files')
  WITH CHECK (bucket_id = 'bis-project-files');

DROP POLICY IF EXISTS bis_project_files_storage_delete ON storage.objects;
CREATE POLICY bis_project_files_storage_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'bis-project-files');

NOTIFY pgrst, 'reload schema';
