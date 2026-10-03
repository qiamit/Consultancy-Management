-- Finance Management · Sale · Quotations

CREATE TABLE IF NOT EXISTS public.quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number text NOT NULL UNIQUE,
  quotation_date date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date,
  client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL,
  client_name text NOT NULL DEFAULT '',
  contact_person text,
  contact_email text,
  contact_mobile text,
  subject text,
  reference_no text,
  status text NOT NULL DEFAULT 'Draft'
    CHECK (status IN ('Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Converted')),
  payment_terms text,
  remarks text,
  discount_percent numeric(8, 2) NOT NULL DEFAULT 0,
  discount_amount numeric(14, 2) NOT NULL DEFAULT 0,
  gst_percent numeric(8, 2) NOT NULL DEFAULT 18,
  gst_amount numeric(14, 2) NOT NULL DEFAULT 0,
  subtotal numeric(14, 2) NOT NULL DEFAULT 0,
  grand_total numeric(14, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quotations_client_id ON public.quotations (client_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON public.quotations (status);
CREATE INDEX IF NOT EXISTS idx_quotations_quotation_date ON public.quotations (quotation_date DESC);

DROP TRIGGER IF EXISTS trg_quotations_updated_at ON public.quotations;
CREATE TRIGGER trg_quotations_updated_at
  BEFORE UPDATE ON public.quotations
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_quotations_authenticated_all ON public.quotations;
CREATE POLICY lims_quotations_authenticated_all
  ON public.quotations
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.quotations IS
  'Finance Sale — customer quotations (header).';

CREATE TABLE IF NOT EXISTS public.quotation_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid NOT NULL
    REFERENCES public.quotations (id) ON DELETE CASCADE,
  line_no integer NOT NULL DEFAULT 1 CHECK (line_no >= 1),
  description text NOT NULL DEFAULT '',
  hsn_sac text,
  quantity numeric(14, 3) NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'Nos',
  rate numeric(14, 2) NOT NULL DEFAULT 0,
  amount numeric(14, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quotation_line_items_quotation_id
  ON public.quotation_line_items (quotation_id);

DROP TRIGGER IF EXISTS trg_quotation_line_items_updated_at ON public.quotation_line_items;
CREATE TRIGGER trg_quotation_line_items_updated_at
  BEFORE UPDATE ON public.quotation_line_items
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.quotation_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_quotation_line_items_authenticated_all
  ON public.quotation_line_items;
CREATE POLICY lims_quotation_line_items_authenticated_all
  ON public.quotation_line_items
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.quotation_line_items IS
  'Finance Sale — quotation line items (1:N with quotations).';
