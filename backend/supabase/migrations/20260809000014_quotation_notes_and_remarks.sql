-- Quotation header Notes column + separate Remarks master (Terms | Notes | Remarks)

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN public.quotations.notes IS
  'Selected / free-text notes from quotation_notes master.';

CREATE TABLE IF NOT EXISTS public.quotation_remarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  content text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quotation_remarks_label_nonempty CHECK (length(trim(label)) > 0),
  CONSTRAINT quotation_remarks_content_nonempty CHECK (length(trim(content)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS quotation_remarks_one_default
  ON public.quotation_remarks ((true))
  WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_quotation_remarks_sort
  ON public.quotation_remarks (sort_order, label);

DROP TRIGGER IF EXISTS trg_quotation_remarks_updated_at ON public.quotation_remarks;
CREATE TRIGGER trg_quotation_remarks_updated_at
  BEFORE UPDATE ON public.quotation_remarks
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.quotation_remarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_quotation_remarks_authenticated_all ON public.quotation_remarks;
CREATE POLICY lims_quotation_remarks_authenticated_all
  ON public.quotation_remarks
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.quotation_remarks IS
  'Finance Sale — reusable quotation remarks; default is prefilled on new quotations.';

INSERT INTO public.quotation_remarks (label, content, is_default, sort_order)
SELECT 'General', 'Thank you for your business.', true, 0
WHERE NOT EXISTS (
  SELECT 1 FROM public.quotation_remarks WHERE trim(label) = 'General'
);

-- Existing quotation_notes stay as Notes master; seed already present.
