-- S9: IS Code identity. Extra columns and amendment rows.
-- Does not rewrite marking-fee amounts. Apply when the app is idle.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.is_codes ADD COLUMN IF NOT EXISTS standard_prefix text;
ALTER TABLE public.is_codes ADD COLUMN IF NOT EXISTS part_no text;
ALTER TABLE public.is_codes ADD COLUMN IF NOT EXISTS section_no text;
ALTER TABLE public.is_codes ADD COLUMN IF NOT EXISTS technical_department text;
ALTER TABLE public.is_codes ADD COLUMN IF NOT EXISTS technical_committee text;
ALTER TABLE public.is_codes ADD COLUMN IF NOT EXISTS ics_code text;
ALTER TABLE public.is_codes ADD COLUMN IF NOT EXISTS certification_category text;
ALTER TABLE public.is_codes ADD COLUMN IF NOT EXISTS standard_status text;

ALTER TABLE public.is_codes DROP CONSTRAINT IF EXISTS is_codes_certification_category_chk;
ALTER TABLE public.is_codes ADD CONSTRAINT is_codes_certification_category_chk
  CHECK (
    certification_category IS NULL
    OR certification_category IN ('Voluntary', 'Compulsory', 'Not certifiable')
  ) NOT VALID;

ALTER TABLE public.is_codes DROP CONSTRAINT IF EXISTS is_codes_standard_status_chk;
ALTER TABLE public.is_codes ADD CONSTRAINT is_codes_standard_status_chk
  CHECK (
    standard_status IS NULL
    OR standard_status IN ('Current', 'Withdrawn', 'Superseded', 'Draft')
  ) NOT VALID;

CREATE TABLE IF NOT EXISTS public.is_code_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_code_id uuid NOT NULL REFERENCES public.is_codes(id) ON DELETE CASCADE,
  amendment_no text NOT NULL,
  issued_on date,
  summary text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT is_code_amendments_no_uidx UNIQUE (is_code_id, amendment_no)
);

CREATE INDEX IF NOT EXISTS is_code_amendments_is_code_id_idx ON public.is_code_amendments (is_code_id);

DROP TRIGGER IF EXISTS trg_is_code_amendments_updated_at ON public.is_code_amendments;
CREATE TRIGGER trg_is_code_amendments_updated_at
  BEFORE UPDATE ON public.is_code_amendments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.is_code_amendments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS is_code_amendments_select ON public.is_code_amendments;
CREATE POLICY is_code_amendments_select ON public.is_code_amendments
  FOR SELECT TO authenticated USING ((SELECT public.app_can_view('/masters/is-codes')));
DROP POLICY IF EXISTS is_code_amendments_insert ON public.is_code_amendments;
CREATE POLICY is_code_amendments_insert ON public.is_code_amendments
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.app_can_edit('/masters/is-codes')));
DROP POLICY IF EXISTS is_code_amendments_update ON public.is_code_amendments;
CREATE POLICY is_code_amendments_update ON public.is_code_amendments
  FOR UPDATE TO authenticated
  USING ((SELECT public.app_can_edit('/masters/is-codes')))
  WITH CHECK ((SELECT public.app_can_edit('/masters/is-codes')));
DROP POLICY IF EXISTS is_code_amendments_delete ON public.is_code_amendments;
CREATE POLICY is_code_amendments_delete ON public.is_code_amendments
  FOR DELETE TO authenticated USING ((SELECT public.app_can_edit('/masters/is-codes')));

REVOKE ALL ON public.is_code_amendments FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.is_code_amendments TO authenticated;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
  FROM (
    SELECT lower(btrim(is_number)), revision_year::text
    FROM public.is_codes
    GROUP BY 1, 2
    HAVING count(*) > 1
  ) clashes;
  IF n <> 0 THEN
    RAISE NOTICE 'S9: skipped is_codes_number_year_lower_uidx, clash groups %', n;
  ELSIF to_regclass('public.is_codes_number_year_lower_uidx') IS NULL THEN
    CREATE UNIQUE INDEX is_codes_number_year_lower_uidx
      ON public.is_codes (lower(btrim(is_number)), revision_year);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
