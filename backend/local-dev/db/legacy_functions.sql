-- Local-only: helper functions and storage buckets that Railway Postgres already had from the
-- earlier app and that migrations call without creating. Never apply to Railway.

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Bucket used by BIS > Sample failure reply; created on Railway by hand.
INSERT INTO storage.buckets (id, name, public)
VALUES ('bis-sample-failure-files', 'bis-sample-failure-files', false)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  op text;
BEGIN
  FOREACH op IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS local_bis_sample_failure_files_%s ON storage.objects', lower(op));
    IF op = 'INSERT' THEN
      EXECUTE format(
        'CREATE POLICY local_bis_sample_failure_files_%s ON storage.objects FOR %s TO authenticated WITH CHECK (bucket_id = %L)',
        lower(op), op, 'bis-sample-failure-files');
    ELSE
      EXECUTE format(
        'CREATE POLICY local_bis_sample_failure_files_%s ON storage.objects FOR %s TO authenticated USING (bucket_id = %L)',
        lower(op), op, 'bis-sample-failure-files');
    END IF;
  END LOOP;
END $$;
