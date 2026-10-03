-- Per-module Terms / Notes / Signature defaults
-- (Quotation, Proforma Invoice, Invoice, Credit Note, Payment Receipt)

ALTER TABLE public.quotation_terms_conditions
  ADD COLUMN IF NOT EXISTS document_kind text NOT NULL DEFAULT 'quotation';

ALTER TABLE public.quotation_notes
  ADD COLUMN IF NOT EXISTS document_kind text NOT NULL DEFAULT 'quotation';

UPDATE public.quotation_terms_conditions
SET document_kind = 'quotation'
WHERE document_kind IS NULL OR btrim(document_kind) = '';

UPDATE public.quotation_notes
SET document_kind = 'quotation'
WHERE document_kind IS NULL OR btrim(document_kind) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quotation_terms_conditions_document_kind_chk'
  ) THEN
    ALTER TABLE public.quotation_terms_conditions
      ADD CONSTRAINT quotation_terms_conditions_document_kind_chk
      CHECK (
        document_kind IN (
          'quotation',
          'proformaInvoice',
          'invoice',
          'creditNote',
          'paymentReceipt'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quotation_notes_document_kind_chk'
  ) THEN
    ALTER TABLE public.quotation_notes
      ADD CONSTRAINT quotation_notes_document_kind_chk
      CHECK (
        document_kind IN (
          'quotation',
          'proformaInvoice',
          'invoice',
          'creditNote',
          'paymentReceipt'
        )
      );
  END IF;
END $$;

DROP INDEX IF EXISTS public.quotation_terms_conditions_one_default;
CREATE UNIQUE INDEX IF NOT EXISTS quotation_terms_conditions_one_default_per_kind
  ON public.quotation_terms_conditions (document_kind)
  WHERE is_default;

DROP INDEX IF EXISTS public.quotation_notes_one_default;
CREATE UNIQUE INDEX IF NOT EXISTS quotation_notes_one_default_per_kind
  ON public.quotation_notes (document_kind)
  WHERE is_default;

CREATE TABLE IF NOT EXISTS public.sale_document_signature_defaults (
  document_kind text PRIMARY KEY,
  signature_text text NOT NULL DEFAULT '',
  signature_image_path text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sale_document_signature_defaults_kind_chk
    CHECK (
      document_kind IN (
        'quotation',
        'proformaInvoice',
        'invoice',
        'creditNote',
        'paymentReceipt'
      )
    )
);

DROP TRIGGER IF EXISTS trg_sale_document_signature_defaults_updated_at
  ON public.sale_document_signature_defaults;
CREATE TRIGGER trg_sale_document_signature_defaults_updated_at
  BEFORE UPDATE ON public.sale_document_signature_defaults
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.sale_document_signature_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_sale_document_signature_defaults_authenticated_all
  ON public.sale_document_signature_defaults;
CREATE POLICY lims_sale_document_signature_defaults_authenticated_all
  ON public.sale_document_signature_defaults
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON COLUMN public.quotation_terms_conditions.document_kind IS
  'Sale module this term belongs to (independent lists + defaults).';
COMMENT ON COLUMN public.quotation_notes.document_kind IS
  'Sale module this note belongs to (independent lists + defaults).';
COMMENT ON TABLE public.sale_document_signature_defaults IS
  'Per Sale module default signature text + image path.';
