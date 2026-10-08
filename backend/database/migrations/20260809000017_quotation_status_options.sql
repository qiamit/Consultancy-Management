-- Quotation status options: Draft, Sent, Finalized, Proforma, Invoice

ALTER TABLE public.quotations
  DROP CONSTRAINT IF EXISTS quotations_status_check;

UPDATE public.quotations
SET status = 'Finalized'
WHERE status = 'Accepted';

UPDATE public.quotations
SET status = 'Invoice'
WHERE status = 'Converted';

ALTER TABLE public.quotations
  ALTER COLUMN status SET DEFAULT 'Draft';

ALTER TABLE public.quotations
  ADD CONSTRAINT quotations_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'Draft'::text,
        'Sent'::text,
        'Finalized'::text,
        'Proforma'::text,
        'Invoice'::text,
        'Accepted'::text,
        'Rejected'::text,
        'Expired'::text,
        'Converted'::text
      ]
    )
  );
