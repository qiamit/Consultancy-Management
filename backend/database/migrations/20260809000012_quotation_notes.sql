-- Reusable quotation notes (selectable + one default for print / remarks)
CREATE TABLE IF NOT EXISTS public.quotation_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  content text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quotation_notes_label_nonempty CHECK (length(trim(label)) > 0),
  CONSTRAINT quotation_notes_content_nonempty CHECK (length(trim(content)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS quotation_notes_one_default
  ON public.quotation_notes ((true))
  WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_quotation_notes_sort
  ON public.quotation_notes (sort_order, label);

DROP TRIGGER IF EXISTS trg_quotation_notes_updated_at ON public.quotation_notes;
CREATE TRIGGER trg_quotation_notes_updated_at
  BEFORE UPDATE ON public.quotation_notes
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.quotation_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_quotation_notes_authenticated_all ON public.quotation_notes;
CREATE POLICY lims_quotation_notes_authenticated_all
  ON public.quotation_notes
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.quotation_notes IS
  'Finance Sale — reusable quotation notes; default is prefilled on new quotations.';

INSERT INTO public.quotation_notes (label, content, is_default, sort_order)
SELECT 'General', 'Thank you for your business.', true, 0
WHERE NOT EXISTS (
  SELECT 1 FROM public.quotation_notes WHERE trim(label) = 'General'
);
