-- Per-license firm / legal attachments for BIS projects (View Documents → Module Edit).

CREATE TABLE IF NOT EXISTS public.bis_project_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bis_project_id uuid NOT NULL REFERENCES public.bis_projects(id) ON DELETE CASCADE,
  doc_kind text NOT NULL DEFAULT 'legal',
  file_name text NOT NULL,
  storage_path text NOT NULL,
  file_size bigint,
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bis_project_files_project_id
  ON public.bis_project_files USING btree (bis_project_id);

CREATE INDEX IF NOT EXISTS idx_bis_project_files_project_kind
  ON public.bis_project_files USING btree (bis_project_id, doc_kind);

ALTER TABLE public.bis_project_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bis_project_files_authenticated_all ON public.bis_project_files;
CREATE POLICY bis_project_files_authenticated_all
  ON public.bis_project_files
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

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
