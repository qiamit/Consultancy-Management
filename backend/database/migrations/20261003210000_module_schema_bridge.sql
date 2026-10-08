-- Map existing Consultancy Pro schema → LIMS UI expected tables/columns.

-- ── IS Codes aliases ──────────────────────────────────────────────────────────
ALTER TABLE public.is_codes ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.is_codes ADD COLUMN IF NOT EXISTS aspect text;
ALTER TABLE public.is_codes ADD COLUMN IF NOT EXISTS remarks text;

UPDATE public.is_codes
SET
  title = COALESCE(NULLIF(title, ''), is_code_title),
  aspect = COALESCE(NULLIF(aspect, ''), aspect_of_is, 'Specification')
WHERE title IS NULL OR title = '' OR aspect IS NULL OR aspect = '';

CREATE OR REPLACE FUNCTION public.sync_is_codes_lims_aliases()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.title IS NULL OR btrim(NEW.title) = '' THEN
    NEW.title := COALESCE(NEW.is_code_title, NEW.title);
  END IF;
  IF NEW.is_code_title IS NULL OR btrim(NEW.is_code_title) = '' THEN
    NEW.is_code_title := COALESCE(NEW.title, NEW.is_code_title);
  END IF;
  IF NEW.aspect IS NULL OR btrim(NEW.aspect) = '' THEN
    NEW.aspect := COALESCE(NEW.aspect_of_is, 'Specification');
  END IF;
  IF NEW.aspect_of_is IS NULL OR btrim(NEW.aspect_of_is) = '' THEN
    NEW.aspect_of_is := COALESCE(NEW.aspect, 'Specification');
  END IF;
  -- Keep both sides in sync when one is updated
  IF TG_OP = 'UPDATE' THEN
    IF NEW.title IS DISTINCT FROM OLD.title THEN
      NEW.is_code_title := NEW.title;
    ELSIF NEW.is_code_title IS DISTINCT FROM OLD.is_code_title THEN
      NEW.title := NEW.is_code_title;
    END IF;
    IF NEW.aspect IS DISTINCT FROM OLD.aspect THEN
      NEW.aspect_of_is := NEW.aspect;
    ELSIF NEW.aspect_of_is IS DISTINCT FROM OLD.aspect_of_is THEN
      NEW.aspect := NEW.aspect_of_is;
    END IF;
  ELSE
    NEW.is_code_title := COALESCE(NEW.is_code_title, NEW.title);
    NEW.title := COALESCE(NEW.title, NEW.is_code_title);
    NEW.aspect_of_is := COALESCE(NEW.aspect_of_is, NEW.aspect, 'Specification');
    NEW.aspect := COALESCE(NEW.aspect, NEW.aspect_of_is, 'Specification');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_is_codes_lims_aliases ON public.is_codes;
CREATE TRIGGER trg_sync_is_codes_lims_aliases
  BEFORE INSERT OR UPDATE ON public.is_codes
  FOR EACH ROW EXECUTE FUNCTION public.sync_is_codes_lims_aliases();

-- ── Test parameters aliases ───────────────────────────────────────────────────
ALTER TABLE public.test_parameters ADD COLUMN IF NOT EXISTS item_name text;
ALTER TABLE public.test_parameters ADD COLUMN IF NOT EXISTS specific_requirement text;
ALTER TABLE public.test_parameters ADD COLUMN IF NOT EXISTS unit_value text;
ALTER TABLE public.test_parameters ADD COLUMN IF NOT EXISTS uncertainty_mu text;
ALTER TABLE public.test_parameters ADD COLUMN IF NOT EXISTS acceptance_criteria text;
ALTER TABLE public.test_parameters ADD COLUMN IF NOT EXISTS is_code_label text;
ALTER TABLE public.test_parameters ADD COLUMN IF NOT EXISTS accreditation text;

UPDATE public.test_parameters
SET
  item_name = COALESCE(NULLIF(item_name, ''), test_name),
  unit_value = COALESCE(NULLIF(unit_value, ''), unit),
  specific_requirement = COALESCE(NULLIF(specific_requirement, ''), specified_value)
WHERE item_name IS NULL OR item_name = '' OR unit_value IS NULL OR unit_value = '';

CREATE OR REPLACE FUNCTION public.sync_test_parameters_lims_aliases()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.item_name IS NULL OR btrim(NEW.item_name) = '' THEN
    NEW.item_name := COALESCE(NEW.test_name, NEW.item_name);
  END IF;
  IF NEW.test_name IS NULL OR btrim(NEW.test_name) = '' THEN
    NEW.test_name := COALESCE(NEW.item_name, NEW.test_name);
  END IF;
  IF NEW.unit_value IS NULL OR btrim(NEW.unit_value) = '' THEN
    NEW.unit_value := COALESCE(NEW.unit, NEW.unit_value);
  END IF;
  IF NEW.unit IS NULL OR btrim(NEW.unit) = '' THEN
    NEW.unit := COALESCE(NEW.unit_value, NEW.unit);
  END IF;
  IF NEW.specific_requirement IS NULL OR btrim(NEW.specific_requirement) = '' THEN
    NEW.specific_requirement := COALESCE(NEW.specified_value, NEW.specific_requirement);
  END IF;
  IF NEW.specified_value IS NULL OR btrim(NEW.specified_value) = '' THEN
    NEW.specified_value := COALESCE(NEW.specific_requirement, NEW.specified_value);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_test_parameters_lims_aliases ON public.test_parameters;
CREATE TRIGGER trg_sync_test_parameters_lims_aliases
  BEFORE INSERT OR UPDATE ON public.test_parameters
  FOR EACH ROW EXECUTE FUNCTION public.sync_test_parameters_lims_aliases();

-- ── Products & Services (LIMS table name) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products_services_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL DEFAULT 'Service',
  item_code text NOT NULL,
  item_category text NOT NULL DEFAULT 'Testing',
  item_name text NOT NULL,
  item_description text,
  hsn_code text,
  sale_price numeric NOT NULL DEFAULT 0,
  purchase_price numeric NOT NULL DEFAULT 0,
  gst_percent numeric NOT NULL DEFAULT 18,
  discount numeric NOT NULL DEFAULT 0,
  unit_of_measurement text,
  make text,
  opening_stock numeric NOT NULL DEFAULT 0,
  low_stock_alert numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS products_services_master_item_code_uq
  ON public.products_services_master (item_code);

INSERT INTO public.products_services_master (
  id, item_type, item_code, item_category, item_name, item_description, hsn_code,
  sale_price, purchase_price, gst_percent, unit_of_measurement, make,
  opening_stock, low_stock_alert, created_at, updated_at
)
SELECT
  p.id,
  CASE WHEN lower(COALESCE(p.category, '')) LIKE '%product%' THEN 'Product' ELSE 'Service' END,
  COALESCE(NULLIF(p.item_code, ''), left(replace(p.id::text, '-', ''), 8)),
  COALESCE(NULLIF(p.category, ''), 'Testing'),
  COALESCE(NULLIF(p.name, ''), 'Item'),
  p.description,
  p.hsn_code,
  COALESCE(p.sale_price, 0),
  COALESCE(p.purchase_price, 0),
  CASE
    WHEN NULLIF(regexp_replace(COALESCE(p.gst_rate, ''), '[^0-9.]', '', 'g'), '') IS NULL THEN 18
    ELSE NULLIF(regexp_replace(COALESCE(p.gst_rate, ''), '[^0-9.]', '', 'g'), '')::numeric
  END,
  p.unit_of_item,
  p.make,
  COALESCE(NULLIF(regexp_replace(COALESCE(p.opening_stock, '0'), '[^0-9.]', '', 'g'), '')::numeric, 0),
  COALESCE(NULLIF(regexp_replace(COALESCE(p.low_stock_value, '0'), '[^0-9.]', '', 'g'), '')::numeric, 0),
  p.created_at,
  p.updated_at
FROM public.product_master_items p
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.product_item_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

INSERT INTO public.product_item_categories (name) VALUES ('Calibration'), ('Testing')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.product_makes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

INSERT INTO public.product_makes (name) VALUES ('QIRLPL'), ('QE'), ('Other')
ON CONFLICT (name) DO NOTHING;

-- ── Quotations (LIMS table names) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number text NOT NULL,
  quotation_date date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date,
  client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL,
  client_name text NOT NULL DEFAULT '',
  contact_person text,
  contact_email text,
  contact_mobile text,
  client_address text,
  client_gst_number text,
  subject text,
  reference_no text,
  status text NOT NULL DEFAULT 'Draft',
  payment_terms text,
  notes text,
  remarks text,
  signature_text text,
  signature_image_path text,
  discount_percent numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  transportation_charges numeric DEFAULT 0,
  packaging_charges numeric DEFAULT 0,
  gst_percent numeric NOT NULL DEFAULT 18,
  gst_amount numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  grand_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS quotations_number_uq ON public.quotations (quotation_number);

CREATE TABLE IF NOT EXISTS public.quotation_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid NOT NULL REFERENCES public.quotations (id) ON DELETE CASCADE,
  line_no integer NOT NULL DEFAULT 1,
  description text NOT NULL DEFAULT '',
  details text,
  make text,
  hsn_sac text,
  item_code text,
  quantity numeric NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'Nos',
  rate numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  discount_percent numeric DEFAULT 0,
  gst_percent numeric DEFAULT 18,
  line_remarks text,
  delivery_period text,
  created_at timestamptz DEFAULT now()
);

INSERT INTO public.quotations (
  id, quotation_number, quotation_date, valid_until, client_id, client_name,
  notes, status, subtotal, gst_amount, grand_total, created_at, updated_at
)
SELECT
  q.id,
  COALESCE(NULLIF(q.quotation_number, ''), 'Q-' || left(q.id::text, 8)),
  COALESCE(q.quotation_date, CURRENT_DATE),
  q.expiry_date,
  q.client_id,
  COALESCE(c.company_name, c.name, ''),
  q.notes,
  COALESCE(NULLIF(q.quotation_status, ''), 'Draft'),
  COALESCE(q.subtotal, 0),
  COALESCE(q.tax_total, 0),
  COALESCE(q.grand_total, 0),
  q.created_at,
  q.updated_at
FROM public.finance_quotations q
LEFT JOIN public.clients c ON c.id = q.client_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.quotation_line_items (
  id, quotation_id, line_no, description, quantity, unit, rate, amount, gst_percent
)
SELECT
  l.id,
  l.quotation_id,
  COALESCE(l.sort_order, 1),
  COALESCE(l.item_description, 'Line item'),
  COALESCE(l.qty, 1),
  COALESCE(l.unit_of_item, 'Nos'),
  COALESCE(l.unit_rate, 0),
  COALESCE(l.line_total, 0),
  CASE
    WHEN NULLIF(regexp_replace(COALESCE(l.gst_rate, ''), '[^0-9.]', '', 'g'), '') IS NULL THEN 18
    ELSE NULLIF(regexp_replace(COALESCE(l.gst_rate, ''), '[^0-9.]', '', 'g'), '')::numeric
  END
FROM public.finance_quotation_lines l
WHERE EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = l.quotation_id)
ON CONFLICT (id) DO NOTHING;

-- Supporting quotation option tables (empty OK)
CREATE TABLE IF NOT EXISTS public.quotation_terms_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text,
  content text NOT NULL,
  sort_order integer DEFAULT 0,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quotation_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text,
  content text NOT NULL,
  sort_order integer DEFAULT 0,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quotation_remarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text,
  content text NOT NULL,
  sort_order integer DEFAULT 0,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sale_document_signature_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_kind text NOT NULL DEFAULT 'quotation',
  signature_text text,
  signature_image_path text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (document_kind)
);

-- ── RLS + grants ──────────────────────────────────────────────────────────────
ALTER TABLE public.products_services_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_item_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_makes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_terms_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_remarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_document_signature_defaults ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products_services_master','product_item_categories','product_makes',
    'quotations','quotation_line_items','quotation_terms_conditions',
    'quotation_notes','quotation_remarks','sale_document_signature_defaults'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS consultancy_%s_all ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY consultancy_%s_all ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t, t
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

NOTIFY pgrst, 'reload schema';
