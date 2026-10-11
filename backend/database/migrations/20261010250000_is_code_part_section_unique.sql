-- Two standards can share an IS number and year when Part or Section differs.
-- The old unique key was only (is_number, revision_year), so those rows could not be stored.
-- Apply when the app is idle. Blank Part-0 / Sec-0 are stored as null and match as ''.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.is_codes DROP CONSTRAINT IF EXISTS is_codes_number_revision_unique;
ALTER TABLE public.is_codes DROP CONSTRAINT IF EXISTS is_codes_number_year_lower_uidx;
DROP INDEX IF EXISTS public.is_codes_number_revision_unique;
DROP INDEX IF EXISTS public.is_codes_number_year_lower_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS is_codes_number_year_part_section_uidx
  ON public.is_codes (
    lower(btrim(is_number)),
    revision_year,
    lower(btrim(COALESCE(part_no, ''))),
    lower(btrim(COALESCE(section_no, '')))
  );

NOTIFY pgrst, 'reload schema';
