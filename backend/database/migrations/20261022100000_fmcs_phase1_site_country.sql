-- FMCS phase 1: a foreign factory can be in a different country from the client's office.
-- Empty country = same country as the client. FMCS projects use certification_scheme_id = the 'fmcs' scheme (seeded in s8).

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.client_sites ADD COLUMN IF NOT EXISTS country text;

INSERT INTO public.certification_schemes (code, name, licence_prefix, sort_order) VALUES
  ('scheme-i', 'Scheme-I (ISI)', 'CM/L-', 10),
  ('fmcs', 'FMCS', NULL, 50)
ON CONFLICT (code) DO NOTHING;

CREATE INDEX IF NOT EXISTS bis_projects_certification_scheme_id_idx ON public.bis_projects (certification_scheme_id);

NOTIFY pgrst, 'reload schema';
