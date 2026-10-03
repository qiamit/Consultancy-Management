-- Quotation line: item description under item name
ALTER TABLE public.quotation_line_items
  ADD COLUMN IF NOT EXISTS details text;

COMMENT ON COLUMN public.quotation_line_items.details IS
  'Item description / details shown under item name on quotation.';
