-- Per-line GST % from Product & Services master (snapshot at quotation time)
ALTER TABLE public.quotation_line_items
  ADD COLUMN IF NOT EXISTS gst_percent numeric(8, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.quotation_line_items.gst_percent IS
  'GST percent snapshot from product/service at line entry time.';
