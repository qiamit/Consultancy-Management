-- Laboratory type is only BIS, OSL, or Other.
-- Backfill: BIS lab -> BIS, BIS-recognised OSL -> OSL, every other old type -> Other.
-- Apply when the app is idle. This rewrites laboratories.lab_type.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.laboratories DROP CONSTRAINT IF EXISTS laboratories_type_chk;

UPDATE public.laboratories
SET lab_type = CASE
  WHEN lower(btrim(lab_type)) IN ('bis', 'bis lab') THEN 'BIS'
  WHEN lower(btrim(lab_type)) IN ('osl', 'bis-recognised osl', 'bis recognised osl') THEN 'OSL'
  ELSE 'Other'
END
WHERE lower(btrim(lab_type)) NOT IN ('bis', 'osl', 'other');

ALTER TABLE public.laboratories ALTER COLUMN lab_type SET DEFAULT 'OSL';

ALTER TABLE public.laboratories DROP CONSTRAINT IF EXISTS laboratories_type_chk;
ALTER TABLE public.laboratories
  ADD CONSTRAINT laboratories_type_chk CHECK (lab_type IN ('BIS', 'OSL', 'Other'));
