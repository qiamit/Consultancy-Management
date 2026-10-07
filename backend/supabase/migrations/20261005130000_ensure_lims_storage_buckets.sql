-- Ensure LIMS storage buckets exist (Railway storage-api returns "Bucket not found"
-- when storage.buckets row is missing even if S3 backend is configured).

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('is-code-files', 'is-code-files', false, 52428800),
  ('calibration-files', 'calibration-files', false, NULL),
  ('equipment-files', 'equipment-files', false, NULL),
  ('laboratory-files', 'laboratory-files', false, NULL),
  ('sample-client-references', 'sample-client-references', false, NULL),
  ('test-method-notes', 'test-method-notes', false, NULL),
  ('quotation-signatures', 'quotation-signatures', false, 5242880)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = COALESCE(storage.buckets.file_size_limit, EXCLUDED.file_size_limit);

-- Keep legacy alias bucket if present; also ensure hyphen bucket has policies.
DO $$
BEGIN
  -- no-op placeholder for older DBs that only had is_code_documents
  IF EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'is_code_documents'
  ) AND NOT EXISTS (
    SELECT 1 FROM storage.objects WHERE bucket_id = 'is-code-files' LIMIT 1
  ) THEN
    NULL;
  END IF;
END $$;

DROP POLICY IF EXISTS lims_is_code_files_select ON storage.objects;
CREATE POLICY lims_is_code_files_select
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'is-code-files');

DROP POLICY IF EXISTS lims_is_code_files_insert ON storage.objects;
CREATE POLICY lims_is_code_files_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'is-code-files');

DROP POLICY IF EXISTS lims_is_code_files_update ON storage.objects;
CREATE POLICY lims_is_code_files_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'is-code-files')
  WITH CHECK (bucket_id = 'is-code-files');

DROP POLICY IF EXISTS lims_is_code_files_delete ON storage.objects;
CREATE POLICY lims_is_code_files_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'is-code-files');

DROP POLICY IF EXISTS lims_calibration_files_select ON storage.objects;
CREATE POLICY lims_calibration_files_select
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'calibration-files');
DROP POLICY IF EXISTS lims_calibration_files_insert ON storage.objects;
CREATE POLICY lims_calibration_files_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'calibration-files');
DROP POLICY IF EXISTS lims_calibration_files_update ON storage.objects;
CREATE POLICY lims_calibration_files_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'calibration-files')
  WITH CHECK (bucket_id = 'calibration-files');
DROP POLICY IF EXISTS lims_calibration_files_delete ON storage.objects;
CREATE POLICY lims_calibration_files_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'calibration-files');

DROP POLICY IF EXISTS lims_equipment_files_select ON storage.objects;
CREATE POLICY lims_equipment_files_select
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'equipment-files');
DROP POLICY IF EXISTS lims_equipment_files_insert ON storage.objects;
CREATE POLICY lims_equipment_files_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'equipment-files');
DROP POLICY IF EXISTS lims_equipment_files_update ON storage.objects;
CREATE POLICY lims_equipment_files_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'equipment-files')
  WITH CHECK (bucket_id = 'equipment-files');
DROP POLICY IF EXISTS lims_equipment_files_delete ON storage.objects;
CREATE POLICY lims_equipment_files_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'equipment-files');

DROP POLICY IF EXISTS lims_laboratory_files_select ON storage.objects;
CREATE POLICY lims_laboratory_files_select
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'laboratory-files');
DROP POLICY IF EXISTS lims_laboratory_files_insert ON storage.objects;
CREATE POLICY lims_laboratory_files_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'laboratory-files');
DROP POLICY IF EXISTS lims_laboratory_files_update ON storage.objects;
CREATE POLICY lims_laboratory_files_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'laboratory-files')
  WITH CHECK (bucket_id = 'laboratory-files');
DROP POLICY IF EXISTS lims_laboratory_files_delete ON storage.objects;
CREATE POLICY lims_laboratory_files_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'laboratory-files');

DROP POLICY IF EXISTS lims_sample_client_references_select ON storage.objects;
CREATE POLICY lims_sample_client_references_select
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'sample-client-references');
DROP POLICY IF EXISTS lims_sample_client_references_insert ON storage.objects;
CREATE POLICY lims_sample_client_references_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sample-client-references');
DROP POLICY IF EXISTS lims_sample_client_references_update ON storage.objects;
CREATE POLICY lims_sample_client_references_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'sample-client-references')
  WITH CHECK (bucket_id = 'sample-client-references');
DROP POLICY IF EXISTS lims_sample_client_references_delete ON storage.objects;
CREATE POLICY lims_sample_client_references_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'sample-client-references');

DROP POLICY IF EXISTS lims_test_method_notes_select ON storage.objects;
CREATE POLICY lims_test_method_notes_select
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'test-method-notes');
DROP POLICY IF EXISTS lims_test_method_notes_insert ON storage.objects;
CREATE POLICY lims_test_method_notes_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'test-method-notes');
DROP POLICY IF EXISTS lims_test_method_notes_update ON storage.objects;
CREATE POLICY lims_test_method_notes_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'test-method-notes')
  WITH CHECK (bucket_id = 'test-method-notes');
DROP POLICY IF EXISTS lims_test_method_notes_delete ON storage.objects;
CREATE POLICY lims_test_method_notes_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'test-method-notes');
