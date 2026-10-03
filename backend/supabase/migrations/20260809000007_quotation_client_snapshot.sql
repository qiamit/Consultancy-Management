-- Snapshot client address / GST on quotation for autofilled letter/form fields
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS client_address text,
  ADD COLUMN IF NOT EXISTS client_gst_number text;

COMMENT ON COLUMN public.quotations.client_address IS
  'Client address snapshot at quotation time.';
COMMENT ON COLUMN public.quotations.client_gst_number IS
  'Client GST number snapshot at quotation time.';
