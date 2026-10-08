-- Quotation signature: typed name + optional image in storage

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS signature_text text,
  ADD COLUMN IF NOT EXISTS signature_image_path text;

COMMENT ON COLUMN public.quotations.signature_text IS
  'Typed signature name shown on quotation print.';
COMMENT ON COLUMN public.quotations.signature_image_path IS
  'Storage path in quotation-signatures bucket for uploaded signature image.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'quotation-signatures',
  'quotation-signatures',
  false,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS lims_quotation_signatures_select ON storage.objects;
CREATE POLICY lims_quotation_signatures_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'quotation-signatures');

DROP POLICY IF EXISTS lims_quotation_signatures_insert ON storage.objects;
CREATE POLICY lims_quotation_signatures_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'quotation-signatures');

DROP POLICY IF EXISTS lims_quotation_signatures_update ON storage.objects;
CREATE POLICY lims_quotation_signatures_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'quotation-signatures')
  WITH CHECK (bucket_id = 'quotation-signatures');

DROP POLICY IF EXISTS lims_quotation_signatures_delete ON storage.objects;
CREATE POLICY lims_quotation_signatures_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'quotation-signatures');
