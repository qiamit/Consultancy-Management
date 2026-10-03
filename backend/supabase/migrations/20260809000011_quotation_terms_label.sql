-- Short display label for terms & conditions (separate from full print text)
ALTER TABLE public.quotation_terms_conditions
  ADD COLUMN IF NOT EXISTS label text;

UPDATE public.quotation_terms_conditions
SET label = LEFT(TRIM(content), 80)
WHERE label IS NULL OR TRIM(label) = '';

ALTER TABLE public.quotation_terms_conditions
  ALTER COLUMN label SET NOT NULL;

COMMENT ON COLUMN public.quotation_terms_conditions.label IS
  'Short name shown in lists / dropdown; content is the full text printed on quotation.';
