-- Optional quotation line fields for future / column-picker use
ALTER TABLE public.quotation_line_items
  ADD COLUMN IF NOT EXISTS item_code text,
  ADD COLUMN IF NOT EXISTS discount_percent numeric(8, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_remarks text,
  ADD COLUMN IF NOT EXISTS delivery_period text;

COMMENT ON COLUMN public.quotation_line_items.item_code IS
  'Product / service code snapshot on the quotation line.';
COMMENT ON COLUMN public.quotation_line_items.discount_percent IS
  'Line-level discount percent (0–100).';
COMMENT ON COLUMN public.quotation_line_items.line_remarks IS
  'Optional remarks for a single quotation line.';
COMMENT ON COLUMN public.quotation_line_items.delivery_period IS
  'Delivery / lead time text for the line (e.g. 7 days).';
