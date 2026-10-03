-- Quotation line items: Make / brand column
ALTER TABLE public.quotation_line_items
  ADD COLUMN IF NOT EXISTS make text;

COMMENT ON COLUMN public.quotation_line_items.make IS
  'Make / brand for the quoted item (optional).';
