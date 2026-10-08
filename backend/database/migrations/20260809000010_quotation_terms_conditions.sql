-- Master list of quotation Terms & Conditions (selectable + one default for print)
CREATE TABLE IF NOT EXISTS public.quotation_terms_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quotation_terms_conditions_content_nonempty
    CHECK (length(trim(content)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS quotation_terms_conditions_one_default
  ON public.quotation_terms_conditions ((true))
  WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_quotation_terms_conditions_sort
  ON public.quotation_terms_conditions (sort_order, content);

DROP TRIGGER IF EXISTS trg_quotation_terms_conditions_updated_at
  ON public.quotation_terms_conditions;
CREATE TRIGGER trg_quotation_terms_conditions_updated_at
  BEFORE UPDATE ON public.quotation_terms_conditions
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.quotation_terms_conditions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_quotation_terms_conditions_authenticated_all
  ON public.quotation_terms_conditions;
CREATE POLICY lims_quotation_terms_conditions_authenticated_all
  ON public.quotation_terms_conditions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.quotation_terms_conditions IS
  'Finance Sale — reusable quotation terms & conditions; default is prefilled on new quotations.';

INSERT INTO public.quotation_terms_conditions (content, is_default, sort_order)
SELECT '100 % Advance', true, 0
WHERE NOT EXISTS (
  SELECT 1 FROM public.quotation_terms_conditions WHERE trim(content) = '100 % Advance'
);
