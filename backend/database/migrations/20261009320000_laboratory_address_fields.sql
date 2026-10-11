-- Laboratory address matches Client Master: PIN, district, country, and country code.
-- Recognised from / up to stay in the table. The form no longer edits them.
-- Apply when the app is idle.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.laboratories
  ADD COLUMN IF NOT EXISTS pin_code text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS longitude text,
  ADD COLUMN IF NOT EXISTS latitude text;

UPDATE public.laboratories
SET country = 'India'
WHERE country IS NULL OR btrim(country) = '';

UPDATE public.laboratories
SET country_code = '+91'
WHERE country_code IS NULL OR btrim(country_code) = '';

NOTIFY pgrst, 'reload schema';
