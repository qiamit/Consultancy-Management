-- Private storage bucket for the BIS stop-marking letters, with the same access rules as bis-project-files.
INSERT INTO storage.buckets (id, name, public)
VALUES ('bis-stop-marking-files', 'bis-stop-marking-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS bis_stop_marking_files_storage_select ON storage.objects;
CREATE POLICY bis_stop_marking_files_storage_select
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'bis-stop-marking-files');

DROP POLICY IF EXISTS bis_stop_marking_files_storage_insert ON storage.objects;
CREATE POLICY bis_stop_marking_files_storage_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bis-stop-marking-files');

DROP POLICY IF EXISTS bis_stop_marking_files_storage_update ON storage.objects;
CREATE POLICY bis_stop_marking_files_storage_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'bis-stop-marking-files')
  WITH CHECK (bucket_id = 'bis-stop-marking-files');

DROP POLICY IF EXISTS bis_stop_marking_files_storage_delete ON storage.objects;
CREATE POLICY bis_stop_marking_files_storage_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'bis-stop-marking-files');
